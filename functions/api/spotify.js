/**
 * LME Content Studio — Spotify-proxy (kun inspirasjon).
 * Bruker client-credentials-flyt for å søke etter populære spor.
 * Spotify-lyd kan IKKE bakes inn i eksportert video (lisens), kun forhåndshøres
 * via 30-sek smakebit og åpnes i Spotify.
 *
 * POST /api/spotify  { q?, market?, clientId?, clientSecret? }
 *  -> { tracks: [{ id, name, artist, img, preview, url, pop }] }
 *
 * Nøkler hentes fra Cloudflare-hemmeligheter (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)
 * hvis satt, ellers fra request-body (BYO fra Innstillinger).
 */

let _tok = null, _exp = 0;

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function getToken(env, body) {
  const id = env.SPOTIFY_CLIENT_ID || body.clientId;
  const secret = env.SPOTIFY_CLIENT_SECRET || body.clientSecret;
  if (!id || !secret) return null;
  if (_tok && Date.now() < _exp) return _tok;
  let r;
  try {
    r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(id + ':' + secret),
      },
      body: 'grant_type=client_credentials',
    });
  } catch (e) { return null; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) return null;
  _tok = d.access_token;
  _exp = Date.now() + ((d.expires_in || 3600) - 60) * 1000;
  return _tok;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch (e) {}

  const tok = await getToken(env, body);
  if (!tok) return json({ error: 'no_spotify_credentials' }, 200);

  const q = (body.q || 'viral hits').toString().slice(0, 120);
  const market = (body.market || 'NO').toString().slice(0, 2).toUpperCase();
  const url = 'https://api.spotify.com/v1/search?type=track&limit=12&market=' +
    market + '&q=' + encodeURIComponent(q);

  let r;
  try { r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } }); }
  catch (e) { return json({ error: 'spotify_unreachable' }, 200); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: (d.error && d.error.message) || ('spotify ' + r.status) }, 200);

  const items = (d.tracks && d.tracks.items) || [];
  const tracks = items.map(function (t) {
    const imgs = (t.album && t.album.images) || [];
    return {
      id: t.id,
      name: t.name,
      artist: (t.artists || []).map(function (a) { return a.name; }).join(', '),
      img: (imgs[1] || imgs[0] || {}).url || '',
      preview: t.preview_url || '',
      url: (t.external_urls && t.external_urls.spotify) || '',
      pop: t.popularity || 0,
    };
  });
  return json({ tracks });
}
