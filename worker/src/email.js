/**
 * Resend Email Integration for The Pool
 * 
 * Sends supporter access emails with magic links for:
 * - /manage/ — Pledge management (cancel, modify, update payment)
 * - /community/:slug/ — Supporter-only voting/decisions
 */

// Instagram CTA block for emails (when campaign has instagram field)
function getInstagramCTA(instagramUrl, siteBase = 'https://pool.dustwave.xyz') {
  if (!instagramUrl) return '';
  
  // Instagram logo hosted on our own domain (third-party URLs trigger Gmail spam filters)
  const instagramIcon = `<img src="${siteBase}/assets/images/instagram-white.png" alt="" width="20" height="20" style="vertical-align: middle; margin-right: 8px;">`;
  
  return `
  <div style="background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
    <a href="${instagramUrl}" style="color: #fff; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; justify-content: center;">
      ${instagramIcon}
      <span>Share to your Story!</span>
    </a>
    <p style="margin: 8px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">Help spread the word on Instagram</p>
  </div>`;
}

// Render pledge items (tiers, support items, custom amount) for email display
function renderPledgeItems({ tierName, tierQty, additionalTiers = [], supportItems = [], customAmount = 0 }) {
  const items = [];
  
  // Main tier
  if (tierName) {
    const qtyText = tierQty > 1 ? ` × ${tierQty}` : '';
    items.push(`<li style="margin: 4px 0;">${tierName}${qtyText}</li>`);
  }
  
  // Additional tiers
  for (const tier of additionalTiers) {
    if (tier.name) {
      const qtyText = tier.qty > 1 ? ` × ${tier.qty}` : '';
      items.push(`<li style="margin: 4px 0;">${tier.name}${qtyText}</li>`);
    }
  }
  
  // Support items
  for (const item of supportItems) {
    if (item.label && item.amount > 0) {
      items.push(`<li style="margin: 4px 0;">${item.label}: $${item.amount.toFixed(2)}</li>`);
    }
  }
  
  // Custom amount
  if (customAmount > 0) {
    items.push(`<li style="margin: 4px 0;">Additional support: $${customAmount.toFixed(2)}</li>`);
  }
  
  if (items.length === 0) return '';
  
  return `
  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e5e5;">
    <p style="margin: 0 0 8px 0; font-weight: 600; font-size: 14px;">Your pledge includes:</p>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #555;">
      ${items.join('\n      ')}
    </ul>
  </div>`;
}

/**
 * Send supporter confirmation email after successful pledge
 */
export async function sendSupporterEmail(env, { email, campaignSlug, campaignTitle, amount, token, instagramUrl, pledgeItems }) {
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const communityUrl = `${env.SITE_BASE}/community/${campaignSlug}/?t=${token}`;
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE);
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems) : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">Thanks for backing ${campaignTitle}!</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px 0;"><strong>Pledge amount:</strong> $${(amount / 100).toFixed(2)}</p>
    ${pledgeItemsHtml}
    <p style="margin: 12px 0 0 0; color: #666; font-size: 14px;">
      <strong>Remember:</strong> Your card is saved but won't be charged unless this campaign reaches its goal. Tax will be added at time of charge.
    </p>
  </div>
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">Your Supporter Access</h2>
    <p style="margin: 0 0 16px 0;">No account needed — these links are your keys:</p>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Manage Your Pledge
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Cancel, modify amount, or update payment method</p>
    </div>
    
    <div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        Supporter Community
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Vote on creative decisions for this project</p>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0 0 8px 0;"><strong>Save this email!</strong> You'll need these links to manage your pledge.</p>
    <p style="margin: 0;">Questions? Reply to this email or visit <a href="${env.SITE_BASE}" style="color: #000;">The Pool</a>.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <pledges@pool.dustwave.xyz>',
      to: email,
      subject: `Your pledge to ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send pledge modification confirmation email
 */
export async function sendPledgeModifiedEmail(env, { email, campaignSlug, campaignTitle, previousSubtotal, newSubtotal, token, instagramUrl, pledgeItems }) {
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const increased = newSubtotal > previousSubtotal;
  const diff = Math.abs(newSubtotal - previousSubtotal);
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE);
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems) : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">Pledge Updated</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px 0;"><strong>Campaign:</strong> ${campaignTitle}</p>
    <p style="margin: 0 0 8px 0;"><strong>Previous pledge:</strong> $${(previousSubtotal / 100).toFixed(2)}</p>
    <p style="margin: 0 0 8px 0;"><strong>New pledge:</strong> $${(newSubtotal / 100).toFixed(2)} (${increased ? '+' : '-'}$${(diff / 100).toFixed(2)})</p>
    ${pledgeItemsHtml}
    <p style="margin: 12px 0 0 0; color: #666; font-size: 14px;">
      <strong>Remember:</strong> Your card is saved but won't be charged unless this campaign reaches its goal. Tax will be added at time of charge.
    </p>
  </div>
  
  <div style="margin-bottom: 32px;">
    <p style="margin: 0 0 16px 0;">Your pledge has been successfully updated. You can manage your pledge anytime using the link below:</p>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Manage Your Pledge
      </a>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">Questions? Reply to this email or visit <a href="${env.SITE_BASE}" style="color: #000;">The Pool</a>.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <pledges@pool.dustwave.xyz>',
      to: email,
      subject: `Pledge updated for ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send payment failure notification
 */
export async function sendPaymentFailedEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax, amount, token, pledgeItems }) {
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems) : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px; color: #dc3545;">Action Required</h1>
  </div>
  
  <div style="background: #fff3cd; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #ffc107;">
    <p style="margin: 0 0 12px 0;">
      We tried to charge your card for your pledge to <strong>${campaignTitle}</strong>, but the payment failed.
    </p>
    <p style="margin: 0 0 4px 0;">Subtotal: $${(subtotal / 100).toFixed(2)}</p>
    <p style="margin: 0 0 4px 0;">Tax (7.875%): $${(tax / 100).toFixed(2)}</p>
    <p style="margin: 0;"><strong>Amount due: $${(amount / 100).toFixed(2)}</strong></p>
    ${pledgeItemsHtml}
  </div>
  
  <p>The campaign has been funded and we're processing charges. Please update your payment method to complete your pledge:</p>
  
  <div style="text-align: center; margin: 24px 0;">
    <a href="${manageUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Update Payment Method
    </a>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">If you have questions, reply to this email.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <pledges@pool.dustwave.xyz>',
      to: email,
      subject: `Action needed: Update payment for ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send charge success email after campaign settlement
 */
export async function sendChargeSuccessEmail(env, { email, campaignSlug, campaignTitle, subtotal, tax, amount, token, pledgeItems }) {
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const communityUrl = `${env.SITE_BASE}/community/${campaignSlug}/?t=${token}`;
  const pledgeItemsHtml = pledgeItems ? renderPledgeItems(pledgeItems) : '';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px; color: #059669;">Payment Successful!</h1>
  </div>
  
  <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
    <p style="margin: 0 0 12px 0;"><strong>${campaignTitle}</strong> has been fully funded!</p>
    <p style="margin: 0 0 4px 0;">Subtotal: $${(subtotal / 100).toFixed(2)}</p>
    <p style="margin: 0 0 4px 0;">Tax (7.875%): $${(tax / 100).toFixed(2)}</p>
    <p style="margin: 0;"><strong>Amount charged: $${(amount / 100).toFixed(2)}</strong></p>
    ${pledgeItemsHtml}
  </div>
  
  <p>Your pledge has been successfully charged. Thank you for helping make this project happen!</p>
  
  <div style="margin-bottom: 32px;">
    <div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Supporter Community
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Stay connected and vote on project decisions</p>
    </div>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        View Your Pledge
      </a>
    </div>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">Questions? Reply to this email or visit <a href="${env.SITE_BASE}" style="color: #000;">The Pool</a>.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <pledges@pool.dustwave.xyz>',
      to: email,
      subject: `Payment confirmed for ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error:', error);
    throw new Error(`Failed to send email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send diary update notification to supporters
 */
export async function sendDiaryUpdateEmail(env, { email, campaignSlug, campaignTitle, diaryTitle, diaryExcerpt, diaryPhase, token, instagramUrl }) {
  const communityUrl = `${env.SITE_BASE}/community/${campaignSlug}/?t=${token}`;
  const diaryAnchor = diaryPhase ? `#diary-${diaryPhase}` : '#diary';
  const campaignUrl = `${env.SITE_BASE}/campaigns/${campaignSlug}/${diaryAnchor}`;
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">New Update: ${campaignTitle}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 12px 0; font-size: 18px;">${diaryTitle}</h2>
    ${diaryExcerpt ? `<p style="margin: 0; color: #666;">${diaryExcerpt}</p>` : ''}
  </div>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      Read Full Update
    </a>
  </div>
  
  <div style="margin-bottom: 32px;">
    <h2 style="font-size: 18px; margin: 0 0 16px 0;">Your Supporter Access</h2>
    
    <div style="margin-bottom: 12px;">
      <a href="${communityUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Supporter Community
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Vote on creative decisions for this project</p>
    </div>
    
    <div style="margin-bottom: 12px;">
      <a href="${manageUrl}" style="display: inline-block; background: #fff; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; border: 1px solid #000;">
        Manage Your Pledge
      </a>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Cancel, modify amount, or update payment method</p>
    </div>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">You're receiving this because you backed ${campaignTitle}.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <updates@pool.dustwave.xyz>',
      to: email,
      subject: `📝 ${diaryTitle} — ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (diary):', error);
    throw new Error(`Failed to send diary email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send pledge cancellation confirmation email
 */
export async function sendPledgeCancelledEmail(env, { email, campaignSlug, campaignTitle, amount }) {
  const campaignUrl = `${env.SITE_BASE}/campaigns/${campaignSlug}/`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="margin: 0; font-size: 24px;">Pledge Cancelled</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px 0;"><strong>Campaign:</strong> ${campaignTitle}</p>
    <p style="margin: 0 0 8px 0;"><strong>Amount:</strong> $${(amount / 100).toFixed(0)}</p>
    <p style="margin: 0; color: #666; font-size: 14px;">
      Your card was never charged — this was just a pledge hold.
    </p>
  </div>
  
  <p style="margin-bottom: 24px;">Your pledge has been cancelled and you won't be charged. If you change your mind, you can always make a new pledge while the campaign is still live.</p>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      View Campaign
    </a>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0;">You've been removed from supporter updates for this campaign. Make a new pledge to rejoin.</p>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <pledges@pool.dustwave.xyz>',
      to: email,
      subject: `Pledge cancelled for ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (cancelled):', error);
    throw new Error(`Failed to send cancellation email: ${response.status}`);
  }

  return response.json();
}

/**
 * Send goal milestone notification to supporters
 * @param {string} milestone - 'one-third' | 'two-thirds' | 'goal' | 'stretch'
 */
export async function sendMilestoneEmail(env, { email, campaignSlug, campaignTitle, milestone, pledgedAmount, goalAmount, stretchGoalName, token, instagramUrl }) {
  const campaignUrl = `${env.SITE_BASE}/campaigns/${campaignSlug}/`;
  const manageUrl = `${env.SITE_BASE}/manage/?t=${token}`;
  const instagramCTA = getInstagramCTA(instagramUrl, env.SITE_BASE);
  
  const milestoneConfig = {
    'one-third': {
      emoji: '🚀',
      heading: "We're 1/3 of the way there!",
      message: `${campaignTitle} has reached 33% of its funding goal. Thanks for being part of this journey!`
    },
    'two-thirds': {
      emoji: '🔥',
      heading: "We're 2/3 funded!",
      message: `${campaignTitle} is at 66% of its goal. The finish line is in sight!`
    },
    'goal': {
      emoji: '🎉',
      heading: 'Goal Reached!',
      message: `${campaignTitle} has hit its funding goal! This project is happening. Your pledge will be charged soon.`
    },
    'stretch': {
      emoji: '⭐',
      heading: `Stretch Goal Unlocked: ${stretchGoalName || 'New Reward'}`,
      message: `${campaignTitle} keeps growing! A new stretch goal has been unlocked.`
    }
  };
  
  const config = milestoneConfig[milestone] || milestoneConfig['goal'];
  const percentFunded = Math.round((pledgedAmount / goalAmount) * 100);
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="font-size: 48px; margin-bottom: 16px;">${config.emoji}</div>
    <h1 style="margin: 0; font-size: 24px;">${config.heading}</h1>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
    <div style="font-size: 36px; font-weight: bold; margin-bottom: 8px;">${percentFunded}%</div>
    <p style="margin: 0; color: #666;">$${(pledgedAmount / 100).toLocaleString()} of $${(goalAmount / 100).toLocaleString()} goal</p>
  </div>
  
  <p style="margin-bottom: 24px;">${config.message}</p>
  
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${campaignUrl}" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      View Campaign
    </a>
  </div>
  
  ${instagramCTA}
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #666;">
    <p style="margin: 0 0 8px 0;">You're receiving this because you backed ${campaignTitle}.</p>
    <a href="${manageUrl}" style="color: #666;">Manage your pledge</a>
  </div>
</body>
</html>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'The Pool <updates@pool.dustwave.xyz>',
      to: email,
      subject: `${config.emoji} ${config.heading} — ${campaignTitle}`,
      html
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Resend error (milestone):', error);
    throw new Error(`Failed to send milestone email: ${response.status}`);
  }

  return response.json();
}
