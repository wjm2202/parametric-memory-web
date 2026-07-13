/**
 * Tests for indexnow-ping.mjs — runs with Node's built-in runner (no deps):
 *   node --test scripts/indexnow-ping.test.mjs
 * If you prefer vitest: swap `node:test`/`node:assert` imports for
 * `import { describe, it, expect } from 'vitest'` and assert.* → expect().* calls.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULTS,
  extractSitemapEntries,
  extractSitemapUrls,
  computeDelta,
  loadState,
  saveState,
  buildPayload,
  describeStatus,
  submitToIndexNow,
  fetchSitemapEntries,
  parseArgs,
} from './indexnow-ping.mjs';

const HOST = 'parametric-memory.dev';
const KEY = 'b01407c61b90e651db43414300b3bac3';

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://parametric-memory.dev</loc><lastmod>2026-07-12T00:00:00.000Z</lastmod></url>
  <url><loc> https://parametric-memory.dev/pricing </loc><lastmod>2026-07-12T00:00:00.000Z</lastmod></url>
  <url><loc>https://parametric-memory.dev/pricing</loc><lastmod>2026-01-01T00:00:00.000Z</lastmod></url>
  <url><loc>https://parametric-memory.dev/no-lastmod</loc></url>
</urlset>`;

describe('extractSitemapEntries / extractSitemapUrls', () => {
  it('extracts loc+lastmod pairs, trims, dedupes by URL (first wins)', () => {
    const entries = extractSitemapEntries(SITEMAP_XML);
    assert.deepEqual(entries, [
      { url: 'https://parametric-memory.dev', lastmod: '2026-07-12T00:00:00.000Z' },
      { url: 'https://parametric-memory.dev/pricing', lastmod: '2026-07-12T00:00:00.000Z' },
      { url: 'https://parametric-memory.dev/no-lastmod', lastmod: null },
    ]);
  });

  it('extractSitemapUrls returns just the URLs', () => {
    assert.deepEqual(extractSitemapUrls(SITEMAP_XML), [
      'https://parametric-memory.dev',
      'https://parametric-memory.dev/pricing',
      'https://parametric-memory.dev/no-lastmod',
    ]);
  });

  it('returns empty array for empty/invalid input', () => {
    assert.deepEqual(extractSitemapEntries(''), []);
    assert.deepEqual(extractSitemapEntries('<urlset></urlset>'), []);
    assert.deepEqual(extractSitemapEntries(undefined), []);
  });
});

describe('computeDelta', () => {
  const entries = [
    { url: 'https://x.dev/a', lastmod: '2026-07-01' },
    { url: 'https://x.dev/b', lastmod: '2026-07-12' },
    { url: 'https://x.dev/c', lastmod: null },
  ];

  it('flags everything on first run (empty state)', () => {
    const { changed, nextState } = computeDelta(entries, {});
    assert.deepEqual(changed, ['https://x.dev/a', 'https://x.dev/b', 'https://x.dev/c']);
    assert.deepEqual(nextState, {
      'https://x.dev/a': '2026-07-01',
      'https://x.dev/b': '2026-07-12',
      'https://x.dev/c': null,
    });
  });

  it('flags only new or lastmod-changed URLs; unchanged are skipped', () => {
    const state = {
      'https://x.dev/a': '2026-07-01', // unchanged
      'https://x.dev/b': '2026-06-01', // bumped
      // /c is new-to-state
    };
    const { changed } = computeDelta(entries, state);
    assert.deepEqual(changed, ['https://x.dev/b', 'https://x.dev/c']);
  });

  it('returns empty changed list when nothing moved → caller makes no request', () => {
    const state = {
      'https://x.dev/a': '2026-07-01',
      'https://x.dev/b': '2026-07-12',
      'https://x.dev/c': null,
    };
    const { changed } = computeDelta(entries, state);
    assert.deepEqual(changed, []);
  });

  it('drops URLs removed from the sitemap out of nextState without pinging them', () => {
    const state = { 'https://x.dev/gone': '2025-01-01', 'https://x.dev/a': '2026-07-01' };
    const { changed, nextState } = computeDelta(entries, state);
    assert.ok(!('https://x.dev/gone' in nextState));
    assert.ok(!changed.includes('https://x.dev/gone'));
  });
});

describe('loadState / saveState', () => {
  it('round-trips state through a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
    const path = join(dir, 'state.json');
    const state = { 'https://x.dev/a': '2026-07-01', 'https://x.dev/c': null };
    saveState(state, path);
    assert.deepEqual(loadState(path), state);
  });

  it('returns empty state for missing or corrupt files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
    assert.deepEqual(loadState(join(dir, 'nope.json')), {});
    const corrupt = join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{not json');
    assert.deepEqual(loadState(corrupt), {});
    const wrongShape = join(dir, 'array.json');
    writeFileSync(wrongShape, '[1,2,3]');
    assert.deepEqual(loadState(wrongShape), {});
  });
});

describe('buildPayload', () => {
  it('builds a spec-compliant payload with keyLocation on the host', () => {
    const { payload, skipped } = buildPayload({
      host: HOST,
      key: KEY,
      urls: ['https://parametric-memory.dev/pricing'],
    });
    assert.equal(payload.host, HOST);
    assert.equal(payload.key, KEY);
    assert.equal(payload.keyLocation, `https://${HOST}/${KEY}.txt`);
    assert.deepEqual(payload.urlList, ['https://parametric-memory.dev/pricing']);
    assert.deepEqual(skipped, []);
  });

  it('expands site-relative paths against the host', () => {
    const { payload } = buildPayload({ host: HOST, key: KEY, urls: ['/faq'] });
    assert.deepEqual(payload.urlList, [`https://${HOST}/faq`]);
  });

  it('skips foreign-host, non-https, and malformed URLs (422 prevention)', () => {
    const { payload, skipped } = buildPayload({
      host: HOST,
      key: KEY,
      urls: [
        'https://parametric-memory.dev/benchmark',
        'https://evil.example.com/spam',
        'http://parametric-memory.dev/insecure',
        'not a url',
      ],
    });
    assert.deepEqual(payload.urlList, ['https://parametric-memory.dev/benchmark']);
    assert.equal(skipped.length, 3);
  });

  it('accepts www subdomain of the host', () => {
    const { payload } = buildPayload({
      host: HOST,
      key: KEY,
      urls: ['https://www.parametric-memory.dev/pricing'],
    });
    assert.equal(payload.urlList.length, 1);
  });

  it('dedupes URLs and caps at maxUrlsPerRequest', () => {
    const many = Array.from({ length: 30 }, (_, i) => `https://${HOST}/page-${i % 10}`);
    const { payload } = buildPayload({ host: HOST, key: KEY, urls: many, maxUrlsPerRequest: 5 });
    assert.equal(payload.urlList.length, 5);
  });

  it('throws on missing/invalid key, empty urls, or zero valid urls', () => {
    assert.throws(() => buildPayload({ host: HOST, key: '', urls: ['/x'] }), /key/);
    assert.throws(() => buildPayload({ host: HOST, key: 'ZZZ!', urls: ['/x'] }), /key/);
    assert.throws(() => buildPayload({ host: HOST, key: KEY, urls: [] }), /non-empty/);
    assert.throws(
      () => buildPayload({ host: HOST, key: KEY, urls: ['https://other.com/x'] }),
      /no valid URLs/,
    );
  });
});

describe('describeStatus', () => {
  it('treats 200 and 202 as success', () => {
    assert.equal(describeStatus(200).ok, true);
    assert.equal(describeStatus(202).ok, true);
  });
  it('treats 400/403/422/429 and unknown codes as failure', () => {
    for (const code of [400, 403, 422, 429, 500]) {
      assert.equal(describeStatus(code).ok, false);
    }
  });
});

describe('submitToIndexNow', () => {
  it('POSTs JSON to the endpoint and reports success', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { status: 200 };
    };
    const { payload } = buildPayload({ host: HOST, key: KEY, urls: ['/pricing', '/faq'] });
    const result = await submitToIndexNow(payload, { fetchImpl });

    assert.equal(captured.url, DEFAULTS.endpoint);
    assert.equal(captured.init.method, 'POST');
    assert.match(captured.init.headers['Content-Type'], /application\/json/);
    const body = JSON.parse(captured.init.body);
    assert.equal(body.host, HOST);
    assert.equal(body.urlList.length, 2);
    assert.equal(result.ok, true);
    assert.equal(result.submitted, 2);
  });

  it('reports failure detail on key mismatch (403)', async () => {
    const fetchImpl = async () => ({ status: 403 });
    const { payload } = buildPayload({ host: HOST, key: KEY, urls: ['/pricing'] });
    const result = await submitToIndexNow(payload, { fetchImpl });
    assert.equal(result.ok, false);
    assert.match(result.message, /key/i);
  });
});

describe('fetchSitemapEntries', () => {
  it('fetches and parses the live sitemap into entries', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => SITEMAP_XML });
    const entries = await fetchSitemapEntries(DEFAULTS.sitemapUrl, { fetchImpl });
    assert.equal(entries.length, 3);
    assert.equal(entries[0].lastmod, '2026-07-12T00:00:00.000Z');
  });

  it('throws on non-OK response', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, text: async () => '' });
    await assert.rejects(() => fetchSitemapEntries(DEFAULTS.sitemapUrl, { fetchImpl }), /404/);
  });
});

describe('parseArgs', () => {
  it('parses --key, --sitemap, --host, --endpoint, --state, --all and --urls lists', () => {
    const args = parseArgs([
      '--key', KEY,
      '--host', HOST,
      '--urls', '/a', '/b', 'https://parametric-memory.dev/c',
      '--endpoint', 'https://example.org/indexnow',
      '--state', '/tmp/state.json',
      '--all',
    ]);
    assert.equal(args.key, KEY);
    assert.equal(args.host, HOST);
    assert.deepEqual(args.urls, ['/a', '/b', 'https://parametric-memory.dev/c']);
    assert.equal(args.endpoint, 'https://example.org/indexnow');
    assert.equal(args.state, '/tmp/state.json');
    assert.equal(args.all, true);
  });

  it('defaults: empty urls, all=false', () => {
    const args = parseArgs([]);
    assert.deepEqual(args.urls, []);
    assert.equal(args.all, false);
  });
});
