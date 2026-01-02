/**
 * Magic Link Token Utilities
 * 
 * Stateless HMAC-signed tokens for supporter access.
 * No database required — tokens are self-verifying.
 */

/**
 * Generate a magic link token
 * 
 * @param {string} secret - MAGIC_LINK_SECRET from env
 * @param {object} payload - { orderId, email, campaignSlug }
 * @param {number} expiryDays - Token validity in days (default: 90)
 * @returns {string} Base64url encoded token
 */
export async function generateToken(secret, payload, expiryDays = 90) {
  const data = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60)
  };
  
  const payloadStr = JSON.stringify(data);
  const payloadB64 = base64urlEncode(payloadStr);
  
  const signature = await hmacSign(secret, payloadB64);
  const signatureB64 = base64urlEncode(signature);
  
  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verify and decode a magic link token
 * 
 * @param {string} secret - MAGIC_LINK_SECRET from env
 * @param {string} token - The token string
 * @returns {object|null} Decoded payload or null if invalid
 */
export async function verifyToken(secret, token) {
  try {
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return null;
    
    // Verify signature
    const expectedSig = await hmacSign(secret, payloadB64);
    const expectedSigB64 = base64urlEncode(expectedSig);
    
    if (!timingSafeEqual(signatureB64, expectedSigB64)) {
      return null;
    }
    
    // Decode payload
    const payloadStr = base64urlDecode(payloadB64);
    const payload = JSON.parse(payloadStr);
    
    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return payload;
  } catch (e) {
    console.error('Token verification error:', e);
    return null;
  }
}

// --- Helpers ---

async function hmacSign(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(signature);
}

function base64urlEncode(input) {
  let str;
  if (typeof input === 'string') {
    str = btoa(input);
  } else {
    // Uint8Array
    str = btoa(String.fromCharCode(...input));
  }
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
