import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_RESPONSE_RULE_PHASE,
  ADMIN_RESPONSE_RULE_REF,
  adminResponseRuleMatches,
  buildAdminResponseRule,
  configureAdminResponseRule,
  verifyAdminResponsePolicy
} from '../../scripts/configure-cloudflare-admin-response-rule.mjs';

const ZONE_ID = '0123456789abcdef0123456789abcdef';
const TOKEN = 'cloudflare-test-token';
const SITE_BASE = 'https://pool.dustwave.xyz';

function apiResponse(result: unknown, status = 200) {
  return new Response(JSON.stringify({ success: status >= 200 && status < 300, result, errors: [] }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function ruleset(rules: any[] = []) {
  return { id: 'ruleset-id', kind: 'zone', phase: ADMIN_RESPONSE_RULE_PHASE, rules };
}

describe('Cloudflare Pool admin response rule', () => {
  it('builds a narrow localized no-store and no-transform rule', () => {
    const rule = buildAdminResponseRule(SITE_BASE);
    expect(rule.ref).toBe(ADMIN_RESPONSE_RULE_REF);
    expect(rule.expression).toContain('http.host eq "pool.dustwave.xyz"');
    expect(rule.expression).toContain('http.request.uri.path eq "/admin"');
    expect(rule.expression).toContain('http.request.uri.path eq "/es/admin"');
    expect(rule.action_parameters).toMatchObject({
      'max-age': { operation: 'set', value: 0 },
      'no-store': { operation: 'set' },
      'no-transform': { operation: 'set' },
      private: { operation: 'set' }
    });
  });

  it('reports a matching rule without writes or token disclosure', async () => {
    const desired = { id: 'rule-id', ...buildAdminResponseRule(SITE_BASE) };
    const fetchImpl = vi.fn().mockResolvedValue(apiResponse(ruleset([desired])));
    const result = await configureAdminResponseRule({ zoneId: ZONE_ID, token: TOKEN, siteBase: SITE_BASE, fetchImpl });
    expect(result).toMatchObject({ state: 'current', changed: false, containsCredentials: false });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('adds only the managed rule alongside unrelated rules', async () => {
    const unrelated = { id: 'other-rule', ref: 'other', action: 'set_cache_control' };
    const desired = { id: 'managed-rule', ...buildAdminResponseRule(SITE_BASE) };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(apiResponse(ruleset([unrelated])))
      .mockResolvedValueOnce(apiResponse(ruleset([unrelated, desired])));
    const result = await configureAdminResponseRule({ apply: true, zoneId: ZONE_ID, token: TOKEN, siteBase: SITE_BASE, fetchImpl });
    expect(result).toMatchObject({ state: 'current', operation: 'add_rule', changed: true });
    expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[1][1].body).not.toContain('other-rule');
  });

  it('creates a missing phase entrypoint', async () => {
    const desired = { id: 'managed-rule', ...buildAdminResponseRule(SITE_BASE) };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(apiResponse(null, 404))
      .mockResolvedValueOnce(apiResponse(ruleset([desired])));
    const result = await configureAdminResponseRule({ apply: true, zoneId: ZONE_ID, token: TOKEN, siteBase: SITE_BASE, fetchImpl });
    expect(result.operation).toBe('create_ruleset');
    const body = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(adminResponseRuleMatches(body.rules[0], buildAdminResponseRule(SITE_BASE))).toBe(true);
  });

  it('verifies effective public headers without retaining bodies', async () => {
    const fetchImpl = vi.fn(async () => new Response('<!doctype html><title>Admin</title>', {
      status: 200,
      headers: { 'Cache-Control': 'max-age=0, private, must-revalidate, no-store, no-transform' }
    }));
    const result = await verifyAdminResponsePolicy({ siteBase: SITE_BASE, fetchImpl });
    expect(result).toMatchObject({ state: 'current', containsResponseBodies: false, containsCredentials: false });
    expect(result.routes).toHaveLength(2);
  });

  it('fails on missing directives, edge injection, or report-only CSP', async () => {
    const missing = vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 200, headers: { 'Cache-Control': 'max-age=600' } }));
    await expect(verifyAdminResponsePolicy({ siteBase: SITE_BASE, fetchImpl: missing }))
      .rejects.toThrow('missing private,no-store,no-transform,must-revalidate,max-age=0');
    const injected = vi.fn().mockResolvedValue(new Response('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>', {
      status: 200,
      headers: { 'Cache-Control': 'max-age=0, private, must-revalidate, no-store, no-transform' }
    }));
    await expect(verifyAdminResponsePolicy({ siteBase: SITE_BASE, fetchImpl: injected })).rejects.toThrow('edge injection present');
    const reportOnly = vi.fn().mockResolvedValue(new Response('<!doctype html>', {
      status: 200,
      headers: {
        'Cache-Control': 'max-age=0, private, must-revalidate, no-store, no-transform',
        'Content-Security-Policy-Report-Only': "default-src 'none'"
      }
    }));
    await expect(verifyAdminResponsePolicy({ siteBase: SITE_BASE, fetchImpl: reportOnly })).rejects.toThrow('report-only CSP present');
  });
});
