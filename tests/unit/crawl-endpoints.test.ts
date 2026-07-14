import { describe, expect, it, vi } from 'vitest';
import {
  auditCrawlEndpoints,
  validateRobotsResponse,
  validateSitemapResponse
} from '../../scripts/audit-crawl-endpoints.mjs';

const BASE = 'https://pool.example';
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${BASE}/</loc><lastmod>2026-07-13T00:00:00Z</lastmod></url>
</urlset>`;

function response(body: string, type: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': type } });
}

describe('deployed crawl endpoint audit', () => {
  it('accepts canonical XML, robots, and public HTML for ordinary and inspection requests', async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/sitemap.xml')) return response(SITEMAP, 'application/xml');
      if (url.endsWith('/robots.txt')) return response(`User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`, 'text/plain; charset=utf-8');
      return response('<!doctype html><html><head><link rel="canonical" href="https://pool.example/"></head><body><main>Public</main></body></html>', 'text/html; charset=utf-8');
    });

    await expect(auditCrawlEndpoints({ baseUrl: BASE, fetchFn })).resolves.toMatchObject({
      errors: [],
      urlCount: 1
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('rejects challenge HTML, wrong MIME types, private URLs, duplicates, and future dates', () => {
    const invalid = `<!doctype html><html><body>Just a moment
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>${BASE}/admin/</loc><lastmod>2999-01-01</lastmod></url>
      <url><loc>${BASE}/admin/</loc></url></urlset></body></html>`;
    const result = validateSitemapResponse({
      response: response(invalid, 'text/html'),
      body: invalid,
      baseUrl: BASE
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('content type'),
      expect.stringContaining('XML declaration'),
      expect.stringContaining('bot challenge'),
      expect.stringContaining('private route'),
      expect.stringContaining('duplicate loc'),
      expect.stringContaining('future lastmod')
    ]));
  });

  it('requires robots.txt to advertise the canonical sitemap without returning HTML', () => {
    const body = '<html>challenge-platform</html>';
    expect(validateRobotsResponse({ response: response(body, 'text/html'), body, baseUrl: BASE })).toEqual([
      'robots.txt content type is text/html',
      'robots.txt response looks like HTML or a bot challenge',
      'robots.txt does not advertise the canonical sitemap URL'
    ]);
  });
});
