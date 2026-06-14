/**
 * LME Content Studio — lyd-proxy.
 * Henter en ekstern lydfil tjenerside og leverer den same-origin med CORS,
 * slik at FFmpeg.wasm kan lese den (cross-origin fetch+blob blokkeres ellers).
 *
 * GET /api/audio?url=<encoded audio url>
 * Kun hvitelistede verter tillates.
 */

const ALLOWED_HOSTS = [
  'lmexplorers.com',
  'www.lmexplorers.com',
  'soundhelix.com',
  'www.soundhelix.com',
];

export async function onRequestGet(context) {
  const { request } = context;
  const u = new URL(request.url).searchParams.get('url');
  if (!u) return new Response('missing url', { status: 400 });

  let target;
  try { target = new URL(u); } catch (e) { return new Response('bad url', { status: 400 }); }
  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    return new Response('host not allowed', { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), { headers: { 'User-Agent': 'LME-Content-Studio' } });
  } catch (e) {
    return new Response('fetch failed', { status: 502 });
  }
  if (!upstream.ok) return new Response('upstream ' + upstream.status, { status: 502 });

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('Content-Type') || 'audio/mpeg');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=86400');
  const len = upstream.headers.get('Content-Length');
  if (len) headers.set('Content-Length', len);
  return new Response(upstream.body, { status: 200, headers });
}
