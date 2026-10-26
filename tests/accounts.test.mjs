import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const base = 'http://127.0.0.1:4497/v1';
const pdf = Buffer.from('%PDF-1.4\nprivate-document-test-payload\n%%EOF');

test('accounts, financial profiles, and encrypted documents stay isolated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'houseworthit-test-'));
  const server = spawn(process.execPath, ['dist/main.js'], { cwd: resolve('apps/api'), env: { ...process.env, PORT: '4497', DATA_DIRECTORY: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b);
  async function request(path, method = 'GET', body, cookie, protect = true) {
    const form = body instanceof FormData;
    return fetch(`${base}/${path}`, { method, headers: { ...(protect ? { 'x-houseworthit': '1' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body && !form ? { 'content-type': 'application/json' } : {}) }, body: body ? form ? body : JSON.stringify(body) : undefined });
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await request('health')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
    assert.ok(ready, output);
    assert.equal((await request('profile')).status, 401);
    const credentials = { email: 'one@example.com', name: 'First Buyer', password: 'a-long-test-password', consent: true };
    assert.equal((await request('auth/register', 'POST', credentials, undefined, false)).status, 400);
    const first = await request('auth/register', 'POST', credentials);
    assert.equal(first.status, 201);
    const cookie1 = first.headers.get('set-cookie').split(';')[0];
    assert.match(first.headers.get('set-cookie'), /HttpOnly/);
    assert.match(first.headers.get('set-cookie'), /SameSite=Strict/);
    assert.equal((await first.json()).hash, undefined);
    const second = await request('auth/register', 'POST', { ...credentials, email: 'two@example.com' });
    const cookie2 = second.headers.get('set-cookie').split(';')[0];
    const profile = { annualIncome: 120000, monthlyDebts: 500, savings: 80000, targetPrice: 350000, employment: 'Employed', creditRange: '740+', timeline: 'Exploring', zip: '33101', role: 'admin' };
    assert.equal((await request('profile', 'PUT', profile, cookie1)).status, 200);
    const me = await (await request('profile', 'GET', undefined, cookie1)).json();
    assert.equal(me.profile.annualIncome, 120000);
    assert.equal(me.profile.role, undefined);
    assert.deepEqual((await (await request('profile', 'GET', undefined, cookie2)).json()).profile, {});
    assert.equal((await request('profile', 'PUT', { ...profile, annualIncome: -1 }, cookie1)).status, 400);
    const upload = new FormData(); upload.set('category', 'Income'); upload.set('file', new Blob([pdf], { type: 'application/pdf' }), 'paystub.pdf');
    const uploaded = await request('documents', 'POST', upload, cookie1);
    assert.equal(uploaded.status, 201, JSON.stringify(await uploaded.clone().json()));
    const doc = await uploaded.json();
    assert.equal((await (await request('documents', 'GET', undefined, cookie1)).json()).length, 1);
    assert.deepEqual(await (await request('documents', 'GET', undefined, cookie2)).json(), []);
    assert.equal((await request(`documents/${doc.id}`, 'GET', undefined, cookie2)).status, 400);
    await request(`documents/${doc.id}`, 'DELETE', undefined, cookie2);
    const downloaded = await request(`documents/${doc.id}`, 'GET', undefined, cookie1);
    assert.match(downloaded.headers.get('content-disposition'), /attachment/);
    assert.equal(downloaded.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
    const invalid = new FormData(); invalid.set('category', 'Income'); invalid.set('file', new Blob(['not a pdf'], { type: 'application/pdf' }), 'fake.pdf');
    assert.equal((await request('documents', 'POST', invalid, cookie1)).status, 400);
    const oversized = new FormData(); oversized.set('category', 'Other'); oversized.set('file', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'too-large.pdf');
    assert.equal((await request('documents', 'POST', oversized, cookie1)).status, 413);
    const disk = Buffer.concat(await Promise.all(['houseworthit.sqlite', 'houseworthit.sqlite-wal'].map(f => readFile(join(directory, f)).catch(() => Buffer.alloc(0)))));
    assert.ok(!disk.includes(pdf), 'document plaintext must not be stored');
    assert.equal((await request('auth/login', 'POST', { email: credentials.email, password: 'wrong password' })).status, 401);
    const loggedIn = await request('auth/login', 'POST', credentials);
    assert.equal(loggedIn.status, 200);
    const newCookie = loggedIn.headers.get('set-cookie').split(';')[0];
    await request('auth/logout', 'POST', undefined, newCookie);
    assert.equal((await request('profile', 'GET', undefined, newCookie)).status, 401);
    await request('profile', 'DELETE', undefined, cookie1);
    assert.equal((await request('profile', 'GET', undefined, cookie1)).status, 401);
    assert.equal((await request(`documents/${doc.id}`, 'GET', undefined, cookie1)).status, 401);
    assert.equal((await request('auth/login', 'POST', credentials)).status, 401);
    const estimate = await request('estimate', 'POST', { price: 100 });
    assert.equal(estimate.status, 400);
    await request('profile', 'DELETE', undefined, cookie2);
  } finally {
    server.kill(); if (server.exitCode === null) await once(server, 'exit');
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
