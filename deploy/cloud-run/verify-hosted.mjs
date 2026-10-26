import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const base = process.argv[2];
if (!base || !/^https:\/\/(?:houseworthit-[a-z0-9.-]+\.run\.app|(?:www\.)?houseworthit\.com)$/.test(base)) throw new Error('Supply the verified HouseWorthIt HTTPS origin without a trailing slash.');
const accounts = [];
const pdf = Buffer.from('%PDF-1.4\nHouseWorthIt synthetic deployment verification document.\n%%EOF');
const password = randomBytes(24).toString('base64url');
async function request(path, method = 'GET', body, cookie, origin = base) {
  const form = body instanceof FormData;
  return fetch(`${base}/api/${path}`, {
    method, headers: { 'x-houseworthit': '1', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body && !form ? { 'content-type': 'application/json' } : {}) },
    body: body ? form ? body : JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
}
try {
  const home = await fetch(base); assert.equal(home.status, 200);
  const accountPage = await fetch(`${base}/account`); assert.equal(accountPage.status, 200);
  const health = await (await request('health')).json(); assert.equal(health.storage, 'neon');
  assert.equal((await request('profile')).status, 401);
  assert.equal((await request('auth/login', 'POST', {}, undefined, 'https://untrusted.example')).status, 403);
  for (let i = 0; i < 2; i++) {
    const email = `hwi-deploy-${Date.now()}-${i}@example.invalid`;
    const response = await request('auth/register', 'POST', { name: 'Synthetic Deployment Check', email, password, consent: true });
    assert.equal(response.status, 201, `Registration ${i} returned ${response.status}`);
    const setCookie = response.headers.get('set-cookie'); assert.ok(setCookie); assert.match(setCookie, /Secure/); assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    accounts.push({ email, cookie: setCookie.split(';')[0] });
  }
  const [first, second] = accounts;
  const profile = { annualIncome: 100000, monthlyDebts: 300, savings: 80000, targetPrice: 350000, employment: 'Employed', creditRange: 'Not sure', timeline: 'Exploring', zip: '' };
  assert.equal((await request('profile', 'PUT', profile, first.cookie)).status, 200);
  assert.equal((await (await request('profile', 'GET', undefined, first.cookie)).json()).profile.annualIncome, 100000);
  assert.deepEqual((await (await request('profile', 'GET', undefined, second.cookie)).json()).profile, {});
  const upload = new FormData(); upload.set('category', 'Other'); upload.set('file', new Blob([pdf], { type: 'application/pdf' }), 'synthetic-verification.pdf');
  const response = await request('documents', 'POST', upload, first.cookie); assert.equal(response.status, 201, `Upload returned ${response.status}`);
  const document = await response.json();
  assert.deepEqual(await (await request('documents', 'GET', undefined, second.cookie)).json(), []);
  assert.equal((await request(`documents/${document.id}`, 'GET', undefined, second.cookie)).status, 400);
  await request(`documents/${document.id}`, 'DELETE', undefined, second.cookie);
  assert.deepEqual(Buffer.from(await (await request(`documents/${document.id}`, 'GET', undefined, first.cookie)).arrayBuffer()), pdf);
  console.log('HTTPS, Neon profile persistence, secure cookies, cross-origin rejection, document round-trip, and account isolation passed.');
  if (process.argv.includes('--restart')) {
    const gcloud = process.env.GCLOUD_PATH || 'C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd';
    const result = spawnSync('cmd.exe', ['/d', '/c', gcloud, 'run', 'services', 'update', 'houseworthit', '--project=houseworthit-20261026', '--region=us-central1', `--update-env-vars=DEPLOYMENT_CHECK=${Date.now()}`, '--quiet'], { encoding: 'utf8', windowsHide: true, timeout: 180000 });
    assert.equal(result.status, 0, 'The controlled restart failed.');
    assert.equal((await (await request('profile', 'GET', undefined, first.cookie)).json()).profile.annualIncome, 100000);
    assert.deepEqual(Buffer.from(await (await request(`documents/${document.id}`, 'GET', undefined, first.cookie)).arrayBuffer()), pdf);
    console.log('Profile, session, document metadata, and encrypted document survived a new Cloud Run revision.');
  }
  const login = await request('auth/login', 'POST', { email: first.email, password }); assert.equal(login.status, 200);
  const loginCookie = login.headers.get('set-cookie').split(';')[0];
  await request('auth/logout', 'POST', undefined, loginCookie);
  assert.equal((await request('profile', 'GET', undefined, loginCookie)).status, 401);
  const market = await (await fetch(`${base}/api/market`)).json();
  assert.equal(market.series.length, 2);
  console.log(JSON.stringify({ market: market.series.map(item => ({ id: item.id, available: !!item.observation, date: item.observation?.date || null })) }));
  console.log('Hosted verification passed.');
} finally {
  let removed = 0;
  for (const account of accounts) {
    try {
      const result = await request('profile', 'DELETE', undefined, account.cookie);
      if (!result.ok) throw new Error('Account cleanup failed');
      assert.equal((await request('profile', 'GET', undefined, account.cookie)).status, 401);
      removed++;
    } catch { console.error('A synthetic verification account needs cleanup.'); process.exitCode = 1; }
  }
  console.log(`Removed ${removed} synthetic verification accounts and their documents.`);
}
