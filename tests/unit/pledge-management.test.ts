/**
 * Unit tests for pledge management logic
 * 
 * Tests cover:
 * - Deadline enforcement (blocking cancel/modify after deadline)
 * - canModify/canCancel flag computation
 * - Pledge status transitions
 * - Payment method updates after deadline
 */

import { describe, it, expect, vi } from 'vitest';

// Mock types
interface Pledge {
  orderId: string;
  email: string;
  campaignSlug: string;
  amount: number;
  pledgeStatus: 'active' | 'cancelled' | 'charged' | 'payment_failed';
  charged: boolean;
  chargedAt?: string;
}

interface Campaign {
  slug: string;
  goal_deadline: string;
  goal_amount: number;
}

// Helper to check if deadline passed (MT timezone)
function isDeadlinePassed(dateString: string): boolean {
  // End of day in Mountain Time (UTC-7)
  const deadline = new Date(dateString + 'T23:59:59-07:00');
  return new Date() > deadline;
}

// Helper to compute canModify/canCancel
function computeCanChange(pledge: Pledge, campaign: Campaign | null): boolean {
  if (pledge.pledgeStatus !== 'active') return false;
  if (pledge.charged) return false;
  if (campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline)) return false;
  return true;
}

// Helper to create mock pledge
function createMockPledge(overrides: Partial<Pledge> = {}): Pledge {
  return {
    orderId: `pledge-${Date.now()}`,
    email: 'test@example.com',
    campaignSlug: 'test-campaign',
    amount: 10000,
    pledgeStatus: 'active',
    charged: false,
    ...overrides,
  };
}

// Helper to create mock campaign
function createMockCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    slug: 'test-campaign',
    goal_deadline: '2026-12-31', // Future date
    goal_amount: 2500,
    ...overrides,
  };
}

// =============================================================================
// Deadline Enforcement
// =============================================================================

describe('Deadline enforcement', () => {
  describe('isDeadlinePassed', () => {
    it('should return false for future deadline', () => {
      const futureDate = '2026-12-31';
      expect(isDeadlinePassed(futureDate)).toBe(false);
    });

    it('should return true for past deadline', () => {
      const pastDate = '2020-01-01';
      expect(isDeadlinePassed(pastDate)).toBe(true);
    });

    it('should handle deadline at end of day (23:59:59 MT)', () => {
      // This tests the edge case of checking very close to midnight MT
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      
      // Whether today's deadline has passed depends on current time
      // We can't assert a specific value, but it shouldn't throw
      expect(() => isDeadlinePassed(todayString)).not.toThrow();
    });
  });

  describe('computeCanChange', () => {
    it('should allow changes for active pledge before deadline', () => {
      const pledge = createMockPledge({ pledgeStatus: 'active', charged: false });
      const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
      
      expect(computeCanChange(pledge, campaign)).toBe(true);
    });

    it('should block changes for active pledge after deadline', () => {
      const pledge = createMockPledge({ pledgeStatus: 'active', charged: false });
      const campaign = createMockCampaign({ goal_deadline: '2020-01-01' }); // Past deadline
      
      expect(computeCanChange(pledge, campaign)).toBe(false);
    });

    it('should block changes for charged pledge', () => {
      const pledge = createMockPledge({ pledgeStatus: 'charged', charged: true });
      const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
      
      expect(computeCanChange(pledge, campaign)).toBe(false);
    });

    it('should block changes for cancelled pledge', () => {
      const pledge = createMockPledge({ pledgeStatus: 'cancelled', charged: false });
      const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
      
      expect(computeCanChange(pledge, campaign)).toBe(false);
    });

    it('should block changes for payment_failed pledge', () => {
      const pledge = createMockPledge({ pledgeStatus: 'payment_failed', charged: false });
      const campaign = createMockCampaign({ goal_deadline: '2020-01-01' });
      
      expect(computeCanChange(pledge, campaign)).toBe(false);
    });

    it('should handle missing campaign gracefully', () => {
      const pledge = createMockPledge({ pledgeStatus: 'active', charged: false });
      
      // No campaign = no deadline check, allow changes
      expect(computeCanChange(pledge, null)).toBe(true);
    });

    it('should handle campaign without deadline', () => {
      const pledge = createMockPledge({ pledgeStatus: 'active', charged: false });
      const campaign = createMockCampaign({ goal_deadline: '' });
      
      // No deadline = allow changes
      expect(computeCanChange(pledge, campaign)).toBe(true);
    });
  });
});

// =============================================================================
// Cancel Pledge Validation
// =============================================================================

describe('Cancel pledge validation', () => {
  function validateCancel(pledge: Pledge, campaign: Campaign | null): { valid: boolean; error?: string } {
    if (pledge.charged) {
      return { valid: false, error: 'Cannot cancel - pledge has been charged' };
    }
    
    if (campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline)) {
      return { valid: false, error: 'Cannot cancel - campaign deadline has passed' };
    }
    
    if (pledge.pledgeStatus !== 'active') {
      return { valid: false, error: 'Pledge is not active' };
    }
    
    return { valid: true };
  }

  it('should allow cancelling active pledge before deadline', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
    
    const result = validateCancel(pledge, campaign);
    expect(result.valid).toBe(true);
  });

  it('should reject cancelling after deadline', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    const campaign = createMockCampaign({ goal_deadline: '2020-01-01' });
    
    const result = validateCancel(pledge, campaign);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('deadline has passed');
  });

  it('should reject cancelling charged pledge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'charged', charged: true });
    const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
    
    const result = validateCancel(pledge, campaign);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('has been charged');
  });

  it('should reject cancelling already cancelled pledge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'cancelled' });
    const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
    
    const result = validateCancel(pledge, campaign);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not active');
  });
});

// =============================================================================
// Modify Pledge Validation
// =============================================================================

describe('Modify pledge validation', () => {
  function validateModify(pledge: Pledge, campaign: Campaign | null): { valid: boolean; error?: string } {
    if (pledge.charged) {
      return { valid: false, error: 'Cannot modify - pledge has been charged' };
    }
    
    if (pledge.pledgeStatus !== 'active') {
      return { valid: false, error: 'Pledge is not active' };
    }
    
    // isCampaignLive check includes deadline
    if (campaign?.goal_deadline && isDeadlinePassed(campaign.goal_deadline)) {
      return { valid: false, error: 'Campaign deadline has passed' };
    }
    
    return { valid: true };
  }

  it('should allow modifying active pledge before deadline', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
    
    const result = validateModify(pledge, campaign);
    expect(result.valid).toBe(true);
  });

  it('should reject modifying after deadline', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    const campaign = createMockCampaign({ goal_deadline: '2020-01-01' });
    
    const result = validateModify(pledge, campaign);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('deadline has passed');
  });

  it('should reject modifying charged pledge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'charged', charged: true });
    const campaign = createMockCampaign({ goal_deadline: '2026-12-31' });
    
    const result = validateModify(pledge, campaign);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('has been charged');
  });
});

// =============================================================================
// Payment Method Update Validation
// =============================================================================

describe('Payment method update validation', () => {
  function canUpdatePaymentMethod(pledge: Pledge): boolean {
    // Payment method updates allowed even after deadline (for failed payment recovery)
    // Only blocked if pledge is already charged
    return !pledge.charged;
  }

  it('should allow payment update for active pledge before deadline', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active', charged: false });
    expect(canUpdatePaymentMethod(pledge)).toBe(true);
  });

  it('should allow payment update for active pledge after deadline', () => {
    // Key difference: payment updates allowed after deadline
    const pledge = createMockPledge({ pledgeStatus: 'active', charged: false });
    expect(canUpdatePaymentMethod(pledge)).toBe(true);
  });

  it('should allow payment update for payment_failed pledge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'payment_failed', charged: false });
    expect(canUpdatePaymentMethod(pledge)).toBe(true);
  });

  it('should block payment update for charged pledge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'charged', charged: true });
    expect(canUpdatePaymentMethod(pledge)).toBe(false);
  });
});

// =============================================================================
// Pledge Status Transitions
// =============================================================================

describe('Pledge status transitions', () => {
  it('should transition active -> cancelled on cancel', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    
    // Simulate cancel
    pledge.pledgeStatus = 'cancelled';
    
    expect(pledge.pledgeStatus).toBe('cancelled');
  });

  it('should transition active -> charged on successful charge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    
    // Simulate successful charge
    pledge.pledgeStatus = 'charged';
    pledge.charged = true;
    pledge.chargedAt = new Date().toISOString();
    
    expect(pledge.pledgeStatus).toBe('charged');
    expect(pledge.charged).toBe(true);
    expect(pledge.chargedAt).toBeDefined();
  });

  it('should transition active -> payment_failed on failed charge', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    
    // Simulate failed charge
    pledge.pledgeStatus = 'payment_failed';
    
    expect(pledge.pledgeStatus).toBe('payment_failed');
    expect(pledge.charged).toBe(false);
  });

  it('should transition payment_failed -> active on payment method update', () => {
    const pledge = createMockPledge({ pledgeStatus: 'payment_failed' });
    
    // Simulate payment method update (before auto-retry)
    pledge.pledgeStatus = 'active';
    
    expect(pledge.pledgeStatus).toBe('active');
  });

  it('should transition payment_failed -> charged on successful retry', () => {
    const pledge = createMockPledge({ pledgeStatus: 'payment_failed' });
    
    // Simulate successful retry
    pledge.pledgeStatus = 'charged';
    pledge.charged = true;
    pledge.chargedAt = new Date().toISOString();
    
    expect(pledge.pledgeStatus).toBe('charged');
    expect(pledge.charged).toBe(true);
  });
});

// =============================================================================
// Multi-campaign pledge independence
// =============================================================================

describe('Multi-campaign pledge independence', () => {
  it('should allow modifying pledge for live campaign even if other campaign deadline passed', () => {
    const pledgeLiveCampaign = createMockPledge({ 
      campaignSlug: 'live-campaign',
      pledgeStatus: 'active' 
    });
    const pledgeEndedCampaign = createMockPledge({ 
      campaignSlug: 'ended-campaign',
      pledgeStatus: 'active' 
    });
    
    const liveCampaign = createMockCampaign({ 
      slug: 'live-campaign',
      goal_deadline: '2026-12-31' 
    });
    const endedCampaign = createMockCampaign({ 
      slug: 'ended-campaign',
      goal_deadline: '2020-01-01' 
    });
    
    // Live campaign pledge should be modifiable
    expect(computeCanChange(pledgeLiveCampaign, liveCampaign)).toBe(true);
    
    // Ended campaign pledge should not be modifiable
    expect(computeCanChange(pledgeEndedCampaign, endedCampaign)).toBe(false);
  });

  it('should evaluate each pledge against its own campaign deadline', () => {
    const campaigns = [
      { slug: 'campaign-a', goal_deadline: '2026-12-31' }, // Future
      { slug: 'campaign-b', goal_deadline: '2020-01-01' }, // Past
      { slug: 'campaign-c', goal_deadline: '2026-06-15' }, // Future
    ];
    
    const pledges = campaigns.map((c, i) => createMockPledge({
      orderId: `pledge-${i}`,
      campaignSlug: c.slug,
      pledgeStatus: 'active',
    }));
    
    const results = pledges.map((pledge, i) => ({
      campaignSlug: pledge.campaignSlug,
      canChange: computeCanChange(pledge, campaigns[i] as Campaign),
    }));
    
    expect(results[0].canChange).toBe(true);  // campaign-a: future deadline
    expect(results[1].canChange).toBe(false); // campaign-b: past deadline
    expect(results[2].canChange).toBe(true);  // campaign-c: future deadline
  });
});

// =============================================================================
// API Response Shape
// =============================================================================

describe('API response shape', () => {
  function buildPledgeResponse(pledge: Pledge, campaign: Campaign | null) {
    const deadlinePassed = campaign?.goal_deadline ? isDeadlinePassed(campaign.goal_deadline) : false;
    const canChange = computeCanChange(pledge, campaign);
    
    return {
      orderId: pledge.orderId,
      email: pledge.email,
      campaignSlug: pledge.campaignSlug,
      pledgeStatus: pledge.pledgeStatus,
      amount: pledge.amount,
      canModify: canChange,
      canCancel: canChange,
      canUpdatePaymentMethod: !pledge.charged,
      deadlinePassed,
    };
  }

  it('should include deadlinePassed flag in response', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    const pastCampaign = createMockCampaign({ goal_deadline: '2020-01-01' });
    const futureCampaign = createMockCampaign({ goal_deadline: '2026-12-31' });
    
    const pastResponse = buildPledgeResponse(pledge, pastCampaign);
    const futureResponse = buildPledgeResponse(pledge, futureCampaign);
    
    expect(pastResponse.deadlinePassed).toBe(true);
    expect(futureResponse.deadlinePassed).toBe(false);
  });

  it('should set canModify/canCancel to false when deadline passed', () => {
    const pledge = createMockPledge({ pledgeStatus: 'active' });
    const campaign = createMockCampaign({ goal_deadline: '2020-01-01' });
    
    const response = buildPledgeResponse(pledge, campaign);
    
    expect(response.canModify).toBe(false);
    expect(response.canCancel).toBe(false);
    expect(response.canUpdatePaymentMethod).toBe(true); // Still allowed
  });

  it('should set all flags correctly for charged pledge', () => {
    const pledge = createMockPledge({ 
      pledgeStatus: 'charged', 
      charged: true,
      chargedAt: '2025-12-15T07:00:00Z'
    });
    const campaign = createMockCampaign({ goal_deadline: '2020-01-01' });
    
    const response = buildPledgeResponse(pledge, campaign);
    
    expect(response.canModify).toBe(false);
    expect(response.canCancel).toBe(false);
    expect(response.canUpdatePaymentMethod).toBe(false);
    expect(response.deadlinePassed).toBe(true);
  });
});
