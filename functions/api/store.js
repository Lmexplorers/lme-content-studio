/**
 * LME Autopilot — server-lagring per konto (så arbeidet aldri forsvinner selv om
 * mobilens nettleser tømmer localStorage/IndexedDB).
 *
 * POST /api/store  { action:"load", token, slot }          -> { ok, data }
 * POST /api/store  { action:"save", token, slot, data }    -> { ok }
 *
 * "slot" er f.eks. "settings" (Blotato-nøkkel m.m.) eller "stories" (story-lageret).
 * Krever samme KV-binding og AUTH_SECRET som /api/auth.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  if (!env.ACCOUNTS_KV) return json({ error: "ACCOUNTS_KV ikke bundet i Cloudflare." }, 200);

  let body = {};
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

  const email = await verifyToken(env, body.token);
  if (!email) return json({ error: "not_authenticated" }, 200);

  const slot = String(body.slot || "").replace(/[^a-z0-9_]/gi, "").slice(0, 32);
  if (!slot) return json({ error: "missing slot" }, 200);
  const key = "store:" + slot + ":" + email;

  if (body.action === "load") {
    const raw = await env.ACCOUNTS_KV.get(key);
    let data = null;
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = null; } }
    return json({ ok: true, data });
  }

  if (body.action === "save") {
    const payload = JSON.stringify(body.data === undefined ? null : body.data);
    // KV tåler opptil 25 MB per verdi. Gi en tydelig feil om det er for stort.
    if (payload.length > 24 * 1024 * 1024) return json({ error: "too_large", detail: "Lageret er for stort til å lagres på serveren (over 24 MB)." }, 200);
    try { await env.ACCOUNTS_KV.put(key, payload); }
    catch (e) { return json({ error: String((e && e.message) || e) }, 200); }
    return json({ ok: true });
  }

  return json({ error: "ukjent action" }, 400);
}
