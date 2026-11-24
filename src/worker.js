// Static site, plus one small endpoint: POST /api/check saves the three
// Paperwork Check answers anonymously. Everything else is served from public/
// via the ASSETS binding.
//
// /api/check stores only the three answers and an optional ?src= tag. It never
// reads or forwards the visitor's IP, user agent or cookies, and logs nothing.
// It writes through the insert-only database function save_paperwork_check(),
// with the project's anon (publishable) key held as the SUPABASE_KEY secret.

const ALLOWED = {
  minutes_per_consult: [3, 5, 8, 10, 15, 20],
  own_time_hours: [0, 1, 2, 3.5, 5, 7],
  consults_per_day: [6, 8, 12, 16, 20, 24],
};
const SRC_PATTERN = /^[a-z0-9-]{1,20}$/;
const MAX_BODY_BYTES = 1024;
const SUPABASE_TIMEOUT_MS = 3000;
const LIVE_ORIGIN = 'https://heronscribe.app';
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+-heronscribe-website\.adambarron79\.workers\.dev$/;
const LOCAL_ORIGINS = ['http://localhost:8787', 'http://127.0.0.1:8787'];

function empty(status) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

function originAllowed(origin, env) {
  if (!origin) return false;
  if (origin === LIVE_ORIGIN || PREVIEW_ORIGIN.test(origin)) return true;
  return env.ALLOW_LOCALHOST === '1' && LOCAL_ORIGINS.includes(origin);
}

// Reads at most MAX_BODY_BYTES; returns null if the body is larger.
async function readSmallBody(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(bytes);
}

// Returns the row to save, or null if any answer is not an exact page value.
function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = {};
  for (const [field, values] of Object.entries(ALLOWED)) {
    const v = data[field];
    if (typeof v !== 'number' || !values.includes(v)) return null;
    row[field] = v;
  }
  row.src = typeof data.src === 'string' && SRC_PATTERN.test(data.src) ? data.src : null;
  return row;
}

async function saveRow(row, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return false;
  const headers = { 'Content-Type': 'application/json', apikey: env.SUPABASE_KEY, Prefer: 'return=minimal' };
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys do not.
  if (env.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${env.SUPABASE_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/save_paperwork_check`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_minutes_per_consult: row.minutes_per_consult,
        p_own_time_hours: row.own_time_hours,
        p_consults_per_day: row.consults_per_day,
        p_src: row.src,
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function handleCheck(request, env) {
  if (request.method !== 'POST') return empty(405);
  if (!originAllowed(request.headers.get('Origin'), env)) return empty(403);
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return empty(415);
  const text = await readSmallBody(request);
  if (text === null) return empty(413);
  if (env.CHECK_LIMITER) {
    const { success } = await env.CHECK_LIMITER.limit({ key: 'paperwork-check' });
    if (!success) return empty(429);
  }
  let data;
  try { data = JSON.parse(text); } catch { return empty(400); }
  const row = validate(data);
  if (!row) return empty(400);
  return (await saveRow(row, env)) ? empty(204) : empty(502);
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/check') return handleCheck(request, env);
    return env.ASSETS.fetch(request);
  },
};
