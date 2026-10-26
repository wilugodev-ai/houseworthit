import { NextRequest } from 'next/server';
const API = process.env.API_URL || 'http://127.0.0.1:4400';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!['auth', 'profile', 'documents', 'estimate', 'health'].includes(path[0]) || path.some(v => !/^[a-zA-Z0-9-]+$/.test(v))) return Response.json({ message: 'Not found' }, { status: 404 });
  const expectedOrigin = process.env.K_SERVICE ? `https://${request.headers.get('host') || request.nextUrl.host}` : request.nextUrl.origin;
  if (!['GET', 'HEAD'].includes(request.method) && (request.headers.get('x-houseworthit') !== '1' || (request.headers.get('origin') && request.headers.get('origin') !== expectedOrigin))) return Response.json({ message: 'Request origin not allowed.' }, { status: 403 });
  if (Number(request.headers.get('content-length')) > 11 * 1024 * 1024) return Response.json({ message: 'File is too large.' }, { status: 413 });
  try {
    const headers = new Headers();
    for (const name of ['content-type', 'cookie', 'x-houseworthit']) { const value = request.headers.get(name); if (value) headers.set(name, value); }
    // Cloud Run appends its observed peer to X-Forwarded-For. The API is
    // loopback-only; never accept a caller's custom client-identity header.
    if (process.env.K_SERVICE) headers.set('x-houseworthit-client', request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown');
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    if (body && body.byteLength > 11 * 1024 * 1024) return Response.json({ message: 'File is too large.' }, { status: 413 });
    const result = await fetch(`${API}/v1/${path.join('/')}`, { method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(30000), redirect: 'manual' });
    const outgoing = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'content-disposition', 'set-cookie']) { const value = result.headers.get(name); if (value) outgoing.set(name, value); }
    return new Response(result.body, { status: result.status, headers: outgoing });
  } catch { return Response.json({ message: 'The account service is unavailable. Please try again shortly.' }, { status: 503 }); }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
