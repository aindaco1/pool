#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const siteDir = process.env.SEO_SITE_DIR || path.join(repoRoot, '_site');
const configPath = path.join(repoRoot, '_config.yml');

function fail(message) {
  throw new Error(message);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function siteBaseFromConfig() {
  const config = readFile(configPath);
  const platformSiteUrl = config.match(/^\s{2}site_url:\s*("?)(https?:\/\/[^\s"]+)\1\s*$/m);
  if (platformSiteUrl) return platformSiteUrl[2].replace(/\/+$/, '');
  const rootUrl = config.match(/^url:\s*("?)(https?:\/\/[^\s"]+)\1\s*$/m);
  if (rootUrl) return rootUrl[2].replace(/\/+$/, '');
  return 'https://pool.dustwave.xyz';
}

function walkFiles(dir, suffix, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, suffix, files);
    } else if (entry.isFile() && fullPath.endsWith(suffix)) {
      files.push(fullPath);
    }
  }
  return files;
}

function routeForHtml(filePath) {
  let route = `/${path.relative(siteDir, filePath).split(path.sep).join('/')}`;
  route = route.replace(/\/index\.html$/, '/').replace(/\.html$/, '/');
  return route === '/index.html' ? '/' : route;
}

function isAdminRoute(route) {
  return route === '/admin/' || route.startsWith('/admin/') || route === '/es/admin/' || route.startsWith('/es/admin/');
}

function isPrivateRoute(route) {
  return isAdminRoute(route) ||
    /^\/(?:es\/)?manage(?:\/|$)/.test(route) ||
    /^\/(?:es\/)?api(?:\/|$)/.test(route) ||
    /^\/(?:es\/)?embed(?:\/|$)/.test(route) ||
    /^\/(?:es\/)?pledge-(?:success|cancelled)(?:\/|$)/.test(route) ||
    /^\/(?:es\/)?campaigns\/[^/]+\/preview(?:\/|$)/.test(route) ||
    /^\/(?:es\/)?community\/[^/]+(?:\/|$)/.test(route);
}

function isCampaignRoute(route) {
  return /^\/(?:es\/)?campaigns\/[^/]+\/$/.test(route);
}

function isShoppingProductRoute(route) {
  return /^\/(?:es\/)?campaigns\/[^/]+\/rewards\/[^/]+\/$/.test(route);
}

function campaignSlugForRoute(route) {
  return route.match(/^\/(?:es\/)?campaigns\/([^/]+)\/$/)?.[1] || '';
}

function isNoindex(document) {
  const robots = document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
  return /(^|,)\s*noindex\b/i.test(robots);
}

function parseJsonLd(document, route, errors) {
  const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  return nodes.flatMap((node) => {
    const payload = node.textContent.trim();
    if (!payload) return [];
    try {
      const parsed = JSON.parse(payload);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      errors.push(`${route}: invalid JSON-LD (${error.message})`);
      return [];
    }
  });
}

function flattenGraph(jsonLd) {
  return jsonLd.flatMap((item) => Array.isArray(item?.['@graph']) ? item['@graph'] : [item]);
}

function hasType(node, typeName) {
  const type = node && node['@type'];
  return Array.isArray(type) ? type.includes(typeName) : type === typeName;
}

function assertAbsoluteSiteUrl(value, siteBase, label, route, errors) {
  if (!value) {
    errors.push(`${route}: missing ${label}`);
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${route}: ${label} is not an absolute URL`);
    return null;
  }
  if (parsed.origin !== siteBase) {
    errors.push(`${route}: ${label} points outside ${siteBase}`);
  }
  if (parsed.search || parsed.hash) {
    errors.push(`${route}: ${label} should not include query strings or fragments`);
  }
  return parsed;
}

function parseExcludedCampaignSlugs() {
  const campaignDir = path.join(repoRoot, '_campaigns');
  if (!fs.existsSync(campaignDir)) return new Set();
  const excluded = new Set();
  for (const name of fs.readdirSync(campaignDir)) {
    if (!name.endsWith('.md')) continue;
    const raw = readFile(path.join(campaignDir, name));
    const frontMatter = raw.match(/^---\n([\s\S]*?)\n---/);
    const data = frontMatter?.[1] || '';
    const slug = data.match(/^slug:\s*("?)([^"\n]+)\1\s*$/m)?.[2]?.trim() || name.replace(/\.md$/, '');
    const testOnly = /^test_only:\s*true\s*$/m.test(data);
    const previewOnly = /^preview_only:\s*true\s*$/m.test(data);
    const unpublished = /^published:\s*false\s*$/m.test(data);
    if (slug && (testOnly || previewOnly || unpublished)) excluded.add(slug);
  }
  return excluded;
}

if (!fs.existsSync(siteDir)) {
  fail(`Built site not found at ${siteDir}. Run bundle exec jekyll build first.`);
}

const htmlFiles = walkFiles(siteDir, '.html');
const sitemapPath = path.join(siteDir, 'sitemap.xml');
const textSitemapPath = path.join(siteDir, 'sitemap.txt');
const robotsPath = path.join(siteDir, 'robots.txt');
const errors = [];
const sitemapLocs = new Set();
const sitemapUrls = [];
const seenCanonicals = new Map();
const excludedCampaignSlugs = parseExcludedCampaignSlugs();

let siteBase = process.env.SEO_SITE_BASE || siteBaseFromConfig();
if (!process.env.SEO_SITE_BASE && fs.existsSync(robotsPath)) {
  const robotsSitemap = readFile(robotsPath).match(/^Sitemap:\s*(https?:\/\/[^\s]+)\/sitemap\.xml\s*$/m);
  if (robotsSitemap) siteBase = new URL(robotsSitemap[1]).origin;
}
if (!process.env.SEO_SITE_BASE && fs.existsSync(sitemapPath)) {
  const firstLoc = readFile(sitemapPath).match(/<loc>(https?:\/\/[^<]+)<\/loc>/);
  if (firstLoc) siteBase = new URL(firstLoc[1]).origin;
}

if (!fs.existsSync(sitemapPath)) errors.push('missing /sitemap.xml');
if (!fs.existsSync(textSitemapPath)) errors.push('missing /sitemap.txt');
if (!fs.existsSync(robotsPath)) errors.push('missing /robots.txt');

if (fs.existsSync(sitemapPath)) {
  const sitemapText = readFile(sitemapPath);
  if (sitemapText.charCodeAt(0) === 0xfeff) errors.push('sitemap.xml: must not start with a UTF-8 BOM');
  if (!sitemapText.startsWith('<?xml')) errors.push('sitemap.xml: XML declaration must be the first bytes');
  if (!sitemapText.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) {
    errors.push('sitemap.xml: missing xhtml namespace for hreflang alternates');
  }
  if (!sitemapText.includes('xhtml:link rel="alternate"')) {
    errors.push('sitemap.xml: missing hreflang alternate links');
  }
  const sitemapDocument = new JSDOM(sitemapText, { contentType: 'text/xml' }).window.document;
  if (sitemapDocument.querySelector('parsererror')) errors.push('sitemap.xml: malformed XML');
  for (const loc of Array.from(sitemapDocument.querySelectorAll('loc')).map((node) => node.textContent.trim())) {
    if (sitemapLocs.has(loc)) errors.push(`sitemap.xml: duplicate loc (${loc})`);
    sitemapLocs.add(loc);
    sitemapUrls.push(loc);
    const parsed = assertAbsoluteSiteUrl(loc, siteBase, 'sitemap loc', '/sitemap.xml', errors);
    if (parsed && isPrivateRoute(parsed.pathname.replace(/\/?$/, '/'))) {
      errors.push(`sitemap.xml: private route included (${parsed.pathname})`);
    }
  }
  for (const lastmod of Array.from(sitemapDocument.querySelectorAll('lastmod')).map((node) => node.textContent.trim())) {
    const timestamp = Date.parse(lastmod);
    if (!Number.isFinite(timestamp)) errors.push(`sitemap.xml: invalid lastmod (${lastmod || 'empty'})`);
    if (Number.isFinite(timestamp) && timestamp > Date.now() + 5 * 60 * 1000) {
      errors.push(`sitemap.xml: future lastmod (${lastmod})`);
    }
  }
}

if (fs.existsSync(textSitemapPath)) {
  const rawTextSitemap = readFile(textSitemapPath).replace(/\r\n/g, '\n');
  if (rawTextSitemap.charCodeAt(0) === 0xfeff) errors.push('sitemap.txt: must not start with a UTF-8 BOM');
  const textSitemapLines = rawTextSitemap.split('\n');
  if (textSitemapLines.at(-1) === '') textSitemapLines.pop();
  if (textSitemapLines.length === 0) errors.push('sitemap.txt: contains no URLs');
  if (textSitemapLines.some((line) => line === '' || line !== line.trim())) {
    errors.push('sitemap.txt: must contain exactly one unpadded URL per non-empty line');
  }
  const textSitemapUrls = [];
  const seenTextSitemapUrls = new Set();
  for (const url of textSitemapLines) {
    if (seenTextSitemapUrls.has(url)) errors.push(`sitemap.txt: duplicate URL (${url})`);
    seenTextSitemapUrls.add(url);
    textSitemapUrls.push(url);
    const parsed = assertAbsoluteSiteUrl(url, siteBase, 'text sitemap URL', '/sitemap.txt', errors);
    if (parsed && isPrivateRoute(parsed.pathname.replace(/\/?$/, '/'))) {
      errors.push(`sitemap.txt: private route included (${parsed.pathname})`);
    }
  }
  if (JSON.stringify(textSitemapUrls) !== JSON.stringify(sitemapUrls)) {
    errors.push('sitemap.txt: URL list must exactly match sitemap.xml');
  }
}

if (fs.existsSync(robotsPath)) {
  const robotsText = readFile(robotsPath);
  for (const required of [
    'Disallow: /manage/',
    'Disallow: /es/manage/',
    'Disallow: /admin/',
    'Disallow: /es/admin/',
    'Disallow: /campaigns/*/preview/',
    'Disallow: /es/campaigns/*/preview/',
    'Disallow: /community/*/',
    'Disallow: /es/community/*/',
    'Disallow: /pledge-success/',
    'Disallow: /es/pledge-success/',
    'Disallow: /api/'
  ]) {
    if (!robotsText.includes(required)) errors.push(`robots.txt: missing ${required}`);
  }
  if (!robotsText.includes(`Sitemap: ${siteBase}/sitemap.xml`)) {
    errors.push('robots.txt: sitemap directive is missing or not canonical');
  }
}

for (const filePath of htmlFiles) {
  const route = routeForHtml(filePath);
  const dom = new JSDOM(readFile(filePath));
  const { document } = dom.window;
  const robotsMeta = document.querySelector('meta[name="robots"]');
  if (!robotsMeta) errors.push(`${route}: missing robots meta tag`);

  const noindex = isNoindex(document);
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';

  if (noindex) {
    if (canonical && sitemapLocs.has(canonical)) {
      errors.push(`${route}: noindex page appears in sitemap`);
    }
    continue;
  }

  const title = document.querySelector('title')?.textContent.trim() || '';
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
  const lang = document.documentElement.getAttribute('lang') || '';
  const h1Count = document.querySelectorAll('h1').length;
  const excludedCampaign = excludedCampaignSlugs.has(campaignSlugForRoute(route));

  if (!title) errors.push(`${route}: missing title`);
  if (!description || description.length < 40) errors.push(`${route}: missing or thin meta description`);
  if (!lang) errors.push(`${route}: missing html lang`);
  if (h1Count < 1) errors.push(`${route}: missing h1`);

  const canonicalUrl = assertAbsoluteSiteUrl(canonical, siteBase, 'canonical', route, errors);
  if (canonicalUrl) {
    const previous = seenCanonicals.get(canonical);
    if (previous && previous !== route) {
      errors.push(`${route}: duplicate canonical also used by ${previous}`);
    } else {
      seenCanonicals.set(canonical, route);
    }
    if (!excludedCampaign && !sitemapLocs.has(canonical)) {
      errors.push(`${route}: indexable canonical is missing from sitemap`);
    }
  }

  for (const [selector, label] of [
    ['meta[property="og:title"]', 'og:title'],
    ['meta[property="og:url"]', 'og:url'],
    ['meta[property="og:image"]', 'og:image'],
    ['meta[name="twitter:card"]', 'twitter:card'],
    ['meta[name="twitter:title"]', 'twitter:title']
  ]) {
    if (!document.querySelector(selector)?.getAttribute('content')) {
      errors.push(`${route}: missing ${label}`);
    }
  }

  const alternates = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'));
  if (alternates.length > 0) {
    const alternateLangs = new Set(alternates.map((node) => node.getAttribute('hreflang')));
    if (!alternateLangs.has(lang)) errors.push(`${route}: hreflang alternates missing self language`);
    if (!alternateLangs.has('x-default')) errors.push(`${route}: hreflang alternates missing x-default`);
    for (const node of alternates) {
      assertAbsoluteSiteUrl(node.getAttribute('href'), siteBase, `hreflang ${node.getAttribute('hreflang')}`, route, errors);
    }
  }

  const graph = flattenGraph(parseJsonLd(document, route, errors));
  const organization = graph.find((node) => hasType(node, 'Organization'));
  if (!organization) {
    errors.push(`${route}: JSON-LD missing Organization`);
  } else {
    const availableLanguages = organization.contactPoint?.availableLanguage;
    if (!Array.isArray(availableLanguages) || availableLanguages.length === 0 || availableLanguages.some((language) => typeof language !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language))) {
      errors.push(`${route}: Organization contactPoint availableLanguage must be a nonempty language-code array`);
    }
    const returnPolicy = organization.hasMerchantReturnPolicy;
    if (!returnPolicy || typeof returnPolicy !== 'object') {
      errors.push(`${route}: Organization JSON-LD missing merchant return policy`);
    } else {
      for (const field of ['applicableCountry', 'returnPolicyCategory']) {
        if (!returnPolicy[field]) errors.push(`${route}: MerchantReturnPolicy missing ${field}`);
      }
      if (returnPolicy.returnPolicyCategory === 'https://schema.org/MerchantReturnNotPermitted' && returnPolicy.merchantReturnDays) {
        errors.push(`${route}: no-returns MerchantReturnPolicy must not publish merchantReturnDays`);
      }
    }
  }
  if (isShoppingProductRoute(route)) {
    const product = graph.find((node) => hasType(node, 'Product'));
    if (!product) {
      errors.push(`${route}: JSON-LD missing Product`);
    } else {
      for (const field of ['name', 'description', 'image', 'sku', 'brand']) {
        if (!product[field]) errors.push(`${route}: Product missing ${field}`);
      }
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      if (!offer || typeof offer !== 'object') {
        errors.push(`${route}: Product JSON-LD missing Offer`);
      } else {
        for (const field of ['url', 'price', 'priceCurrency', 'availability', 'itemCondition', 'seller', 'hasMerchantReturnPolicy']) {
          if (offer[field] === undefined || offer[field] === null || offer[field] === '') {
            errors.push(`${route}: Offer missing ${field}`);
          }
        }
      }
    }
    if (!graph.some((node) => hasType(node, 'BreadcrumbList'))) {
      errors.push(`${route}: JSON-LD missing BreadcrumbList`);
    }
    for (const property of ['product:price:amount', 'product:price:currency', 'product:availability']) {
      if (!document.querySelector(`meta[property="${property}"]`)?.getAttribute('content')) {
        errors.push(`${route}: missing ${property}`);
      }
    }
  } else if (isCampaignRoute(route)) {
    if (!graph.some((node) => hasType(node, 'CreativeWork'))) {
      errors.push(`${route}: JSON-LD missing CreativeWork`);
    }
    if (!graph.some((node) => hasType(node, 'BreadcrumbList'))) {
      errors.push(`${route}: JSON-LD missing BreadcrumbList`);
    }
  } else if (!graph.some((node) => hasType(node, 'WebSite'))) {
    errors.push(`${route}: JSON-LD missing WebSite`);
  }
}

if (errors.length > 0) {
  console.error('SEO audit failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`SEO audit passed for ${htmlFiles.length} HTML pages and ${sitemapLocs.size} sitemap URLs.`);
