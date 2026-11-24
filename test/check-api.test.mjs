// Tests for POST /api/check in src/worker.js. Run: node --test
// Uses only Node's built-in test runner. All keys and URLs are fictional.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const LIVE = 'https://heronscribe.app';
const PREVIEW = 'https://website-check-heronscribe-website.adambarron79.workers.dev';
const GOOD = { minutes_per_consult: 10, own_time_hours: 2, consults_per_day: 16, src: 'share' };

let calls, supabaseStatus, supabaseThrows, logged, realFetch, realLog, realError, realWarn;

function makeEnv(extra = {}) {
  return {
    SUPABASE_URL: 'https://fictional-project.supabase.co',
    SUPABASE_KEY: 'sb_publishable_fictional',
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    ...extra,
  };
}

function req(body, { origin = LIVE, type = 'application/json', method = 'POST', path = '/api/check', headers = {} } = {}) {
  const h = { ...headers };
  if (origin !== null) h.Origin = origin;
  if (type !== null) h['Content-Type'] = type;
  const init = { method, headers: h };
  if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`https://heronscribe.app${path}`, init);
}

beforeEach(() => {
  calls = [];
  supabaseStatus = 204;
  supabaseThrows = false;
  logged = 0;
  realFetch = globalThis.fetch;
  realLog = console.log; realError = console.error; realWarn = console.warn;
  console.log = console.error = console.warn = () => { logged++; };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (supabaseThrows) throw new Error('network down');
    return new Response(null, { status: supabaseStatus });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog; console.error = realError; console.warn = realWarn;
});

test('valid answers: 204, one insert via the RPC with only the four fields', async () => {
  const res = await worker.fetch(req({ ...GOOD, email: 'someone@example.com', name: 'Test' }), makeEnv());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fictional-project.supabase.co/rest/v1/rpc/save_paperwork_check');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_minutes_per_consult: 10, p_own_time_hours: 2, p_consults_per_day: 16, p_src: 'share',
  });
  assert.equal(calls[0].init.headers.apikey, 'sb_publishable_fictional');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(logged, 0, 'nothing is logged');
});

test('every exact option value is accepted', async () => {
  for (const m of [3, 5, 8, 10, 15, 20]) for (const o of [0, 1, 2, 3.5, 5, 7]) for (const c of [6, 8, 12, 16, 20, 24]) {
    const res = await worker.fetch(req({ minutes_per_consult: m, own_time_hours: o, consults_per_day: c }), makeEnv());
    assert.equal(res.status, 204, `${m}/${o}/${c}`);
  }
  assert.equal(calls.length, 6 * 6 * 6);
});

test('values not on the page are rejected with 400 and nothing is saved', async () => {
  const bad = [
    { ...GOOD, minutes_per_consult: 11 },
    { ...GOOD, minutes_per_consult: '10' },
    { ...GOOD, own_time_hours: 3 },
    { ...GOOD, own_time_hours: null },
    { ...GOOD, consults_per_day: 25 },
    { ...GOOD, consults_per_day: 16.0001 },
    { own_time_hours: 2, consults_per_day: 16 },
    [10, 2, 16],
    null,
    'hello',
  ];
  for (const body of bad) {
    const res = await worker.fetch(req(body), makeEnv());
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const notJson = await worker.fetch(req('{not json'), makeEnv());
  assert.equal(notJson.status, 400);
  assert.equal(calls.length, 0);
});

test('src is kept only if lowercase letters, digits or hyphens, 1-20 chars; otherwise null', async () => {
  const cases = [
    ['share', 'share'], ['email-nov-2026', 'email-nov-2026'], ['a'.repeat(20), 'a'.repeat(20)],
    ['a'.repeat(21), null], ['Share', null], ['a b', null], ['x_y', null], ['', null],
    [42, null], [null, null], [undefined, null], ['<script>', null],
  ];
  for (const [src, expected] of cases) {
    calls = [];
    const body = { ...GOOD };
    if (src === undefined) delete body.src; else body.src = src;
    const res = await worker.fetch(req(body), makeEnv());
    assert.equal(res.status, 204, String(src));
    assert.equal(JSON.parse(calls[0].init.body).p_src, expected, String(src));
  }
});

test('other origins, or no origin, get 403', async () => {
  for (const origin of ['https://evil.example', 'http://heronscribe.app', 'https://heronscribe.app.evil.example',
    'https://x-heronscribe-website.adambarron79.workers.dev.evil.example', 'http://localhost:8787', null]) {
    const res = await worker.fetch(req(GOOD, { origin }), makeEnv());
    assert.equal(res.status, 403, String(origin));
  }
  assert.equal(calls.length, 0);
});

test('PR preview origins are allowed (decision G1)', async () => {
  const res = await worker.fetch(req(GOOD, { origin: PREVIEW }), makeEnv());
  assert.equal(res.status, 204);
  const versioned = await worker.fetch(req(GOOD, { origin: 'https://99cab28d-heronscribe-website.adambarron79.workers.dev' }), makeEnv());
  assert.equal(versioned.status, 204);
});

test('localhost is allowed only when ALLOW_LOCALHOST is "1"', async () => {
  const off = await worker.fetch(req(GOOD, { origin: 'http://localhost:8787' }), makeEnv());
  assert.equal(off.status, 403);
  const on = await worker.fetch(req(GOOD, { origin: 'http://localhost:8787' }), makeEnv({ ALLOW_LOCALHOST: '1' }));
  assert.equal(on.status, 204);
  const ip = await worker.fetch(req(GOOD, { origin: 'http://127.0.0.1:8787' }), makeEnv({ ALLOW_LOCALHOST: '1' }));
  assert.equal(ip.status, 204);
});

test('wrong method gives 405', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await worker.fetch(req(method === 'GET' ? undefined : GOOD, { method }), makeEnv());
    assert.equal(res.status, 405, method);
  }
  assert.equal(calls.length, 0);
});

test('wrong content type gives 415', async () => {
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', null]) {
    const res = await worker.fetch(req(JSON.stringify(GOOD), { type }), makeEnv());
    assert.equal(res.status, 415, String(type));
  }
  const withCharset = await worker.fetch(req(GOOD, { type: 'application/json; charset=utf-8' }), makeEnv());
  assert.equal(withCharset.status, 204);
});

test('bodies over 1 KB give 413, by header or by actual size', async () => {
  const big = JSON.stringify({ ...GOOD, pad: 'x'.repeat(1100) });
  const res = await worker.fetch(req(big), makeEnv());
  assert.equal(res.status, 413);
  const lying = await worker.fetch(req(JSON.stringify(GOOD), { headers: { 'Content-Length': '5000' } }), makeEnv());
  assert.equal(lying.status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const chunked = new Request('https://heronscribe.app/api/check', {
    method: 'POST', headers: { Origin: LIVE, 'Content-Type': 'application/json' }, body: stream, duplex: 'half',
  });
  const res2 = await worker.fetch(chunked, makeEnv());
  assert.equal(res2.status, 413);
  assert.equal(calls.length, 0);
});

test('rate limit: 429 when the limiter says no; keyed on a fixed string, never the IP', async () => {
  const keys = [];
  const limiter = { limit: async ({ key }) => { keys.push(key); return { success: false }; } };
  const res = await worker.fetch(req(GOOD, { headers: { 'CF-Connecting-IP': '203.0.113.9' } }), makeEnv({ CHECK_LIMITER: limiter }));
  assert.equal(res.status, 429);
  assert.equal(calls.length, 0);
  assert.deepEqual(keys, ['paperwork-check']);
  const ok = { limit: async () => ({ success: true }) };
  assert.equal((await worker.fetch(req(GOOD), makeEnv({ CHECK_LIMITER: ok }))).status, 204);
});

test('Supabase failure, network error or missing secrets give 502 and nothing is logged', async () => {
  supabaseStatus = 500;
  assert.equal((await worker.fetch(req(GOOD), makeEnv())).status, 502);
  supabaseStatus = 204; supabaseThrows = true;
  assert.equal((await worker.fetch(req(GOOD), makeEnv())).status, 502);
  supabaseThrows = false;
  assert.equal((await worker.fetch(req(GOOD), makeEnv({ SUPABASE_KEY: undefined }))).status, 502);
  assert.equal((await worker.fetch(req(GOOD), makeEnv({ SUPABASE_URL: undefined }))).status, 502);
  assert.equal(logged, 0);
});

test('Authorization header is sent only for a legacy JWT key, never for a publishable key', async () => {
  await worker.fetch(req(GOOD), makeEnv());
  assert.equal(calls[0].init.headers.Authorization, undefined);
  await worker.fetch(req(GOOD), makeEnv({ SUPABASE_KEY: 'eyJfictional.jwt.key' }));
  assert.equal(calls[1].init.headers.Authorization, 'Bearer eyJfictional.jwt.key');
});

test('nothing about the visitor is forwarded to Supabase', async () => {
  await worker.fetch(req(GOOD, { headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'TestAgent/1.0', Cookie: 'a=b' } }), makeEnv());
  const sent = JSON.stringify(calls[0]);
  for (const s of ['203.0.113.9', 'TestAgent', 'a=b']) assert.ok(!sent.includes(s), s);
});

test('every other path is served from static assets', async () => {
  const res = await worker.fetch(new Request('https://heronscribe.app/check'), makeEnv());
  assert.equal(await res.text(), 'asset');
  const sub = await worker.fetch(new Request('https://heronscribe.app/api/check/extra', { method: 'POST' }), makeEnv());
  assert.equal(await sub.text(), 'asset');
  assert.equal(calls.length, 0);
});

test('check.html sends the answers once, same origin, keepalive, with no new outside scripts', () => {
  const html = readFileSync(new URL('../public/check.html', import.meta.url), 'utf8');
  assert.equal((html.match(/fetch\(/g) || []).length, 1, 'exactly one fetch call');
  assert.match(html, /fetch\("\/api\/check"/);
  assert.match(html, /keepalive:\s*true/);
  assert.match(html, /credentials:\s*"omit"/);
  assert.match(html, /if\s*\(sent\)\s*return/);
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external script tags');
  assert.ok(!/document\.cookie|localStorage|sessionStorage/.test(html), 'no cookies or storage');
  assert.match(html, /Your answers are saved anonymously, with no names\./);
  assert.match(html, /https:\/\/heronscribe\.app\/check\?src=share/);
});
