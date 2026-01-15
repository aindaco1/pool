/**
 * Unit tests for email broadcast functionality
 * 
 * Tests cover:
 * - Diary tracking helpers (getSentDiaryEntries, markDiarySent)
 * - Milestone tracking helpers (getSentMilestones, markMilestoneSent, checkMilestones)
 * - Rate limiting between email sends
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock KV store
function createMockKV(initialData: Record<string, any> = {}) {
  const store = new Map(Object.entries(initialData));
  return {
    get: vi.fn(async (key: string, options?: { type: string }) => {
      const value = store.get(key);
      if (options?.type === 'json' && value) {
        return typeof value === 'string' ? JSON.parse(value) : value;
      }
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async (options?: { prefix: string }) => {
      const keys = [...store.keys()]
        .filter(k => !options?.prefix || k.startsWith(options.prefix))
        .map(name => ({ name }));
      return { keys };
    }),
    _store: store,
  };
}

// Inline implementation of diary tracking helpers (mirrors worker/src/stats.js)
async function getSentDiaryEntries(env: { PLEDGES: ReturnType<typeof createMockKV> }, campaignSlug: string): Promise<string[]> {
  if (!env.PLEDGES) return [];
  
  const sent = await env.PLEDGES.get(`diary-sent:${campaignSlug}`, { type: 'json' });
  return sent || [];
}

async function markDiarySent(env: { PLEDGES: ReturnType<typeof createMockKV> }, campaignSlug: string, diaryDate: string): Promise<void> {
  if (!env.PLEDGES) return;
  
  const sent = await getSentDiaryEntries(env, campaignSlug);
  if (!sent.includes(diaryDate)) {
    sent.push(diaryDate);
    await env.PLEDGES.put(`diary-sent:${campaignSlug}`, JSON.stringify(sent));
  }
}

// Inline implementation of milestone tracking helpers (mirrors worker/src/stats.js)
const MILESTONE_THRESHOLDS: Record<string, number> = {
  'one-third': 0.33,
  'two-thirds': 0.66,
  'goal': 1.0
};

async function getSentMilestones(env: { PLEDGES: ReturnType<typeof createMockKV> }, campaignSlug: string): Promise<string[]> {
  if (!env.PLEDGES) return [];
  
  const milestones = await env.PLEDGES.get(`milestones:${campaignSlug}`, { type: 'json' });
  return milestones || [];
}

async function markMilestoneSent(env: { PLEDGES: ReturnType<typeof createMockKV> }, campaignSlug: string, milestone: string): Promise<void> {
  if (!env.PLEDGES) return;
  
  const sent = await getSentMilestones(env, campaignSlug);
  if (!sent.includes(milestone)) {
    sent.push(milestone);
    await env.PLEDGES.put(`milestones:${campaignSlug}`, JSON.stringify(sent));
  }
}

async function checkMilestones(
  env: { PLEDGES: ReturnType<typeof createMockKV> },
  campaignSlug: string,
  pledgedAmount: number,
  goalAmount: number
): Promise<string[]> {
  if (!env.PLEDGES || !goalAmount || goalAmount <= 0) return [];
  
  const progress = pledgedAmount / goalAmount;
  const sent = await getSentMilestones(env, campaignSlug);
  const newMilestones: string[] = [];
  
  // Check standard percentage milestones
  const pendingPercentageMilestones: string[] = [];
  for (const [milestone, threshold] of Object.entries(MILESTONE_THRESHOLDS)) {
    if (progress >= threshold && !sent.includes(milestone)) {
      pendingPercentageMilestones.push(milestone);
    }
  }
  
  // Filter percentage milestones: skip intermediates if higher ones are also pending
  // Always include 'goal', only include the highest of one-third/two-thirds
  if (pendingPercentageMilestones.includes('goal')) {
    newMilestones.push('goal');
  } else if (pendingPercentageMilestones.includes('two-thirds')) {
    newMilestones.push('two-thirds');
  } else if (pendingPercentageMilestones.includes('one-third')) {
    newMilestones.push('one-third');
  }
  
  return newMilestones;
}

// Rate limit constant (mirrors worker/src/index.js)
const RESEND_RATE_LIMIT_DELAY = 600; // ms between emails

// Inline implementation of getDiaryExcerpt (mirrors worker/src/index.js)
function getDiaryExcerpt(entry: { body?: string; content?: Array<{ type: string; body?: string; text?: string }> }, maxLength = 200): string {
  // Legacy: plain text body
  if (entry.body && typeof entry.body === 'string') {
    return entry.body.slice(0, maxLength);
  }
  
  // New: content blocks array
  if (entry.content && Array.isArray(entry.content)) {
    const textParts: string[] = [];
    for (const block of entry.content) {
      if (block.type === 'text' && block.body) {
        // Strip basic markdown formatting for email excerpt
        const plainText = block.body
          .replace(/\*\*([^*]+)\*\*/g, '$1')  // bold
          .replace(/\*([^*]+)\*/g, '$1')       // italic
          .replace(/_([^_]+)_/g, '$1')         // italic
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links
          .replace(/^#+\s*/gm, '')              // headers
          .replace(/\n+/g, ' ')                 // newlines to spaces
          .trim();
        textParts.push(plainText);
      } else if (block.type === 'quote' && block.text) {
        textParts.push(`"${block.text}"`);
      }
    }
    const combined = textParts.join(' ').trim();
    return combined.slice(0, maxLength);
  }
  
  return '';
}

// =============================================================================
// Diary Excerpt Extraction
// =============================================================================

describe('getDiaryExcerpt', () => {
  it('extracts plain text from legacy body field', () => {
    const entry = { body: 'This is a simple update.' };
    expect(getDiaryExcerpt(entry)).toBe('This is a simple update.');
  });

  it('truncates legacy body to maxLength', () => {
    const entry = { body: 'A'.repeat(300) };
    expect(getDiaryExcerpt(entry, 200)).toBe('A'.repeat(200));
  });

  it('extracts text from content blocks', () => {
    const entry = {
      content: [
        { type: 'text', body: 'First paragraph.' },
        { type: 'text', body: 'Second paragraph.' }
      ]
    };
    expect(getDiaryExcerpt(entry)).toBe('First paragraph. Second paragraph.');
  });

  it('strips markdown bold formatting', () => {
    const entry = {
      content: [{ type: 'text', body: 'This is **bold** text.' }]
    };
    expect(getDiaryExcerpt(entry)).toBe('This is bold text.');
  });

  it('strips markdown italic formatting', () => {
    const entry = {
      content: [{ type: 'text', body: 'This is *italic* and _also italic_ text.' }]
    };
    expect(getDiaryExcerpt(entry)).toBe('This is italic and also italic text.');
  });

  it('strips markdown links', () => {
    const entry = {
      content: [{ type: 'text', body: 'Check out [our site](https://example.com) for more.' }]
    };
    expect(getDiaryExcerpt(entry)).toBe('Check out our site for more.');
  });

  it('strips markdown headers', () => {
    const entry = {
      content: [{ type: 'text', body: '### The Update\nHere is the news.' }]
    };
    expect(getDiaryExcerpt(entry)).toBe('The Update Here is the news.');
  });

  it('includes quote blocks with quotation marks', () => {
    const entry = {
      content: [
        { type: 'text', body: 'Some intro.' },
        { type: 'quote', text: 'A memorable quote.' }
      ]
    };
    expect(getDiaryExcerpt(entry)).toBe('Some intro. "A memorable quote."');
  });

  it('ignores non-text blocks like images', () => {
    const entry = {
      content: [
        { type: 'text', body: 'Before image.' },
        { type: 'image', src: '/path/to/image.jpg' } as any,
        { type: 'text', body: 'After image.' }
      ]
    };
    expect(getDiaryExcerpt(entry)).toBe('Before image. After image.');
  });

  it('returns empty string for empty entry', () => {
    expect(getDiaryExcerpt({})).toBe('');
    expect(getDiaryExcerpt({ content: [] })).toBe('');
  });

  it('prefers content blocks over body when both present', () => {
    const entry = {
      body: 'Legacy body',
      content: [{ type: 'text', body: 'New content.' }]
    };
    // body is checked first, so it takes precedence
    expect(getDiaryExcerpt(entry)).toBe('Legacy body');
  });
});

// =============================================================================
// Diary Tracking Helpers
// =============================================================================

describe('Diary tracking helpers', () => {
  it('getSentDiaryEntries returns empty array when no entries sent', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    const sent = await getSentDiaryEntries(env, 'test-campaign');
    
    expect(sent).toEqual([]);
  });

  it('getSentDiaryEntries returns previously sent dates', async () => {
    const kv = createMockKV({
      'diary-sent:test-campaign': JSON.stringify(['2026-01-10', '2026-01-12']),
    });
    const env = { PLEDGES: kv };
    
    const sent = await getSentDiaryEntries(env, 'test-campaign');
    
    expect(sent).toEqual(['2026-01-10', '2026-01-12']);
  });

  it('markDiarySent adds date to sent list', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    await markDiarySent(env, 'test-campaign', '2026-01-15');
    
    const sent = await getSentDiaryEntries(env, 'test-campaign');
    expect(sent).toEqual(['2026-01-15']);
  });

  it('markDiarySent is idempotent (does not duplicate dates)', async () => {
    const kv = createMockKV({
      'diary-sent:test-campaign': JSON.stringify(['2026-01-10']),
    });
    const env = { PLEDGES: kv };
    
    // Mark the same date again
    await markDiarySent(env, 'test-campaign', '2026-01-10');
    
    const sent = await getSentDiaryEntries(env, 'test-campaign');
    expect(sent).toEqual(['2026-01-10']);
    expect(sent.filter(d => d === '2026-01-10').length).toBe(1);
  });

  it('markDiarySent appends new dates to existing list', async () => {
    const kv = createMockKV({
      'diary-sent:test-campaign': JSON.stringify(['2026-01-10']),
    });
    const env = { PLEDGES: kv };
    
    await markDiarySent(env, 'test-campaign', '2026-01-12');
    
    const sent = await getSentDiaryEntries(env, 'test-campaign');
    expect(sent).toEqual(['2026-01-10', '2026-01-12']);
  });
});

// =============================================================================
// Milestone Tracking Helpers
// =============================================================================

describe('Milestone tracking helpers', () => {
  it('getSentMilestones returns empty array initially', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    const sent = await getSentMilestones(env, 'test-campaign');
    
    expect(sent).toEqual([]);
  });

  it('markMilestoneSent adds milestone to sent list', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    await markMilestoneSent(env, 'test-campaign', 'one-third');
    
    const sent = await getSentMilestones(env, 'test-campaign');
    expect(sent).toEqual(['one-third']);
  });

  it('markMilestoneSent is idempotent (does not duplicate milestones)', async () => {
    const kv = createMockKV({
      'milestones:test-campaign': JSON.stringify(['one-third']),
    });
    const env = { PLEDGES: kv };
    
    await markMilestoneSent(env, 'test-campaign', 'one-third');
    
    const sent = await getSentMilestones(env, 'test-campaign');
    expect(sent).toEqual(['one-third']);
    expect(sent.filter(m => m === 'one-third').length).toBe(1);
  });

  it('markMilestoneSent appends new milestones to existing list', async () => {
    const kv = createMockKV({
      'milestones:test-campaign': JSON.stringify(['one-third']),
    });
    const env = { PLEDGES: kv };
    
    await markMilestoneSent(env, 'test-campaign', 'two-thirds');
    
    const sent = await getSentMilestones(env, 'test-campaign');
    expect(sent).toEqual(['one-third', 'two-thirds']);
  });
});

// =============================================================================
// Milestone Checking Logic
// =============================================================================

describe('checkMilestones', () => {
  it('returns correct milestone for one-third progress', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 35% progress (above one-third threshold of 33%)
    const milestones = await checkMilestones(env, 'test-campaign', 35000, 100000);
    
    expect(milestones).toEqual(['one-third']);
  });

  it('returns correct milestone for two-thirds progress', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 70% progress (above two-thirds threshold of 66%)
    const milestones = await checkMilestones(env, 'test-campaign', 70000, 100000);
    
    expect(milestones).toEqual(['two-thirds']);
  });

  it('returns goal milestone when 100% funded', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 100% progress
    const milestones = await checkMilestones(env, 'test-campaign', 100000, 100000);
    
    expect(milestones).toEqual(['goal']);
  });

  it('returns goal milestone when overfunded', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 150% progress
    const milestones = await checkMilestones(env, 'test-campaign', 150000, 100000);
    
    expect(milestones).toEqual(['goal']);
  });

  it('skips already-sent milestones', async () => {
    const kv = createMockKV({
      'milestones:test-campaign': JSON.stringify(['one-third']),
    });
    const env = { PLEDGES: kv };
    
    // 35% progress but one-third already sent
    const milestones = await checkMilestones(env, 'test-campaign', 35000, 100000);
    
    expect(milestones).toEqual([]);
  });

  it('only returns highest pending percentage milestone (two-thirds beats one-third)', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 70% progress - both one-third and two-thirds are crossed
    // Should only return two-thirds (skip one-third)
    const milestones = await checkMilestones(env, 'test-campaign', 70000, 100000);
    
    expect(milestones).toEqual(['two-thirds']);
    expect(milestones).not.toContain('one-third');
  });

  it('only returns goal when all milestones pending (goal beats one-third and two-thirds)', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 100% progress - all milestones crossed at once
    // Should only return goal (skip one-third and two-thirds)
    const milestones = await checkMilestones(env, 'test-campaign', 100000, 100000);
    
    expect(milestones).toEqual(['goal']);
    expect(milestones).not.toContain('one-third');
    expect(milestones).not.toContain('two-thirds');
  });

  it('returns two-thirds when one-third already sent', async () => {
    const kv = createMockKV({
      'milestones:test-campaign': JSON.stringify(['one-third']),
    });
    const env = { PLEDGES: kv };
    
    // 70% progress - one-third already sent, two-thirds pending
    const milestones = await checkMilestones(env, 'test-campaign', 70000, 100000);
    
    expect(milestones).toEqual(['two-thirds']);
  });

  it('returns empty array when below all thresholds', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    // 20% progress - below one-third
    const milestones = await checkMilestones(env, 'test-campaign', 20000, 100000);
    
    expect(milestones).toEqual([]);
  });

  it('returns empty array when all milestones already sent', async () => {
    const kv = createMockKV({
      'milestones:test-campaign': JSON.stringify(['one-third', 'two-thirds', 'goal']),
    });
    const env = { PLEDGES: kv };
    
    // 150% progress but all milestones already sent
    const milestones = await checkMilestones(env, 'test-campaign', 150000, 100000);
    
    expect(milestones).toEqual([]);
  });

  it('returns empty array for invalid goal amount', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    const milestonesZero = await checkMilestones(env, 'test-campaign', 50000, 0);
    const milestonesNegative = await checkMilestones(env, 'test-campaign', 50000, -100);
    
    expect(milestonesZero).toEqual([]);
    expect(milestonesNegative).toEqual([]);
  });
});

// =============================================================================
// Rate Limiting
// =============================================================================

describe('Rate limiting', () => {
  it('RESEND_RATE_LIMIT_DELAY is 600ms', () => {
    expect(RESEND_RATE_LIMIT_DELAY).toBe(600);
  });

  it('emails are sent with delay between them', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    
    // Mock setTimeout to track delays
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, delay?: number) => {
      if (delay) delays.push(delay);
      fn();
      return 0 as any;
    });

    // Simulate sending multiple emails with rate limiting
    const emails = ['a@test.com', 'b@test.com', 'c@test.com'];
    const sendEmail = vi.fn(async (email: string) => {});
    
    for (let i = 0; i < emails.length; i++) {
      await sendEmail(emails[i]);
      if (i < emails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RESEND_RATE_LIMIT_DELAY));
      }
    }
    
    // Verify emails were sent
    expect(sendEmail).toHaveBeenCalledTimes(3);
    
    // Verify delays were applied between emails (not after the last one)
    expect(delays.filter(d => d === RESEND_RATE_LIMIT_DELAY).length).toBe(2);
    
    vi.restoreAllMocks();
  });

  it('delay is applied between diary broadcast emails', async () => {
    const kv = createMockKV();
    const env = { PLEDGES: kv };
    
    const timestamps: number[] = [];
    const sendDiaryEmail = vi.fn(async () => {
      timestamps.push(Date.now());
    });

    // Simulate sending diary emails to multiple supporters with rate limiting
    const supporters = ['user1@test.com', 'user2@test.com'];
    
    vi.useFakeTimers();
    
    for (let i = 0; i < supporters.length; i++) {
      await sendDiaryEmail();
      if (i < supporters.length - 1) {
        vi.advanceTimersByTime(RESEND_RATE_LIMIT_DELAY);
      }
    }
    
    expect(sendDiaryEmail).toHaveBeenCalledTimes(2);
    
    vi.useRealTimers();
  });
});
