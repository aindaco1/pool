/**
 * Security Test Helpers
 */

export const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
export const PROD_MODE = process.env.PROD_MODE === 'true';
export const ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-admin-secret';
export const TEST_TOKEN = process.env.TEST_TOKEN || '';

/**
 * Fetch wrapper for security tests with common headers
 */
export async function securityFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${WORKER_URL}${path}`;
  const headers = new Headers(options.headers);
  
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  
  return fetch(url, {
    ...options,
    headers
  });
}

/**
 * Assert response is unauthorized (401)
 */
export function expectUnauthorized(res: Response, message?: string) {
  if (res.status !== 401) {
    throw new Error(
      `Expected 401 Unauthorized, got ${res.status}. ${message || ''}`
    );
  }
}

/**
 * Assert response is forbidden (403)
 */
export function expectForbidden(res: Response, message?: string) {
  if (res.status !== 403) {
    throw new Error(
      `Expected 403 Forbidden, got ${res.status}. ${message || ''}`
    );
  }
}

/**
 * Assert response is bad request (400)
 */
export function expectBadRequest(res: Response, message?: string) {
  if (res.status !== 400) {
    throw new Error(
      `Expected 400 Bad Request, got ${res.status}. ${message || ''}`
    );
  }
}

/**
 * Assert response is not found (404)
 */
export function expectNotFound(res: Response, message?: string) {
  if (res.status !== 404) {
    throw new Error(
      `Expected 404 Not Found, got ${res.status}. ${message || ''}`
    );
  }
}

/**
 * Assert response is server error (500)
 */
export function expectServerError(res: Response, message?: string) {
  if (res.status !== 500) {
    throw new Error(
      `Expected 500 Server Error, got ${res.status}. ${message || ''}`
    );
  }
}

/**
 * Generate a fake magic link token (invalid signature)
 */
export function generateFakeToken(payload: object): string {
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const fakeSig = 'invalid_signature_here';
  return `${payloadB64}.${fakeSig}`;
}

/**
 * Generate expired token payload
 */
export function generateExpiredPayload(base: object): object {
  return {
    ...base,
    exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
  };
}

/**
 * Generate a fake Stripe webhook signature
 */
export function generateFakeStripeSignature(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=fake_signature_that_should_fail_verification`;
}

/**
 * Common malicious payloads for input validation testing
 */
export const MALICIOUS_PAYLOADS = {
  xss: [
    '<script>alert(1)</script>',
    '"><script>alert(1)</script>',
    "';alert(1)//",
    '<img src=x onerror=alert(1)>',
    '{{constructor.constructor("alert(1)")()}}'
  ],
  sqlInjection: [
    "'; DROP TABLE pledges; --",
    "1' OR '1'='1",
    "1; SELECT * FROM users",
    "admin'--",
    "1' UNION SELECT NULL,NULL,NULL--"
  ],
  nosqlInjection: [
    '{"$gt": ""}',
    '{"$ne": null}',
    '{"$where": "this.password.length > 0"}',
    '{"__proto__": {"admin": true}}'
  ],
  pathTraversal: [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '%2e%2e%2f%2e%2e%2f',
    '....//....//....//etc/passwd'
  ],
  overflow: [
    'A'.repeat(10000),
    'A'.repeat(100000),
    '\x00'.repeat(1000)
  ]
};

/**
 * Test campaigns for security testing
 */
export const TEST_CAMPAIGNS = {
  valid: 'hand-relations',
  invalid: 'nonexistent-campaign-12345',
  malicious: '../../../etc/passwd'
};

/**
 * Measure response time for timing attack detection
 */
export async function measureResponseTime(
  fn: () => Promise<Response>
): Promise<{ response: Response; duration: number }> {
  const start = performance.now();
  const response = await fn();
  const duration = performance.now() - start;
  return { response, duration };
}

/**
 * Run multiple requests in parallel for rate limit testing
 */
export async function burstRequests(
  fn: () => Promise<Response>,
  count: number
): Promise<Response[]> {
  const promises = Array(count).fill(null).map(() => fn());
  return Promise.all(promises);
}
