/**
 * LME Autopilot, sletting av konto.
 *
 * Google Play krever at en app med innlogging lar brukeren slette kontoen
 * sin, både inne i appen og fra en offentlig nettadresse. Siden
 * /slett-konto bruker dette endepunktet, og er den adressen som oppgis i
 * Play Console under "Datasletting".
 *
 * POST /api/delete-account  { token }  -> { ok: true, slettet: <antall nøkler> }
 *
 * Sletter alt appen har lagret om kontoen i ACCOUNTS_KV:
 *   user:<e-post>            kontoen, planen og kredittene
 *   code:<e-post>            en eventuell innloggingskode som ikke er brukt
 *   store:<slot>:<e-post>    alt lagret arbeid (innstillinger, historikk, stories)
 *
 * Merk: et løpende Stripe-abonnement sies IKKE opp herfra. Sletting av
 * kontoen og oppsigelse av abonnementet er to forskjellige ting, og en
 * bruker som sletter kontoen skal ikke miste penger uten å vite det.
 * Svaret sier fra om det, og teksten på siden gjentar det.
 */

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}
function secret(env) { return env.AUTH_SECRET || "lme-dev-secret-change-me"; }

async function verifyToken(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [payload, sig] = token.split(".");
  if (sig !== (await hmac(secret(env), payload))) return null;
  try {
    const o = JSON.parse(dec.decode(b64urlDecode(payload)));
    if (o.exp && o.exp < Date.now()) return null;
    return o.email;
  } catch (e) { return null; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ACCOUNTS_KV) return json({ error: "ACCOUNTS_KV er ikke bundet i Cloudflare." }, 200);

  let body = {};
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

  const email = await verifyToken(env, body.token);
  if (!email) return json({ error: "not_authenticated" }, 200);

  const noekler = ["user:" + email, "code:" + email];

  /* Lagret arbeid ligger på store:<slot>:<e-post>, og slot er fritt valgt av
     appen. KV kan bare liste på prefiks, så jeg lister alt under "store:" og
     plukker ut de som hører til denne e-posten. Listen er paginert. */
  const suffiks = ":" + email;
  let cursor;
  do {
    const side = await env.ACCOUNTS_KV.list({ prefix: "store:", cursor });
    for (const n of side.keys) {
      if (n.name.endsWith(suffiks)) noekler.push(n.name);
    }
    cursor = side.list_complete ? null : side.cursor;
  } while (cursor);

  for (const n of noekler) {
    try { await env.ACCOUNTS_KV.delete(n); } catch (e) { /* fortsetter, resten skal slettes */ }
  }

  return json({
    ok: true,
    slettet: noekler.length,
    merknad: "Kontoen og alt lagret arbeid er slettet. Et eventuelt løpende abonnement må sies opp for seg.",
  });
}
