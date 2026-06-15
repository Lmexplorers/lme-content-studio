/**
 * LME Content Studio — konto + passordløs innlogging + kreditter.
 *
 * POST /api/auth  { action: "request", email }
 *   -> sender en 6-sifret engangskode på e-post (Resend). Returnerer devCode kun hvis DEV_AUTH=1.
 * POST /api/auth  { action: "verify", email, code }
 *   -> { token, account }  (oppretter konto ved første innlogging)
 * POST /api/auth  { action: "me", token }
 *   -> { account }
 *
 * Krever KV-binding ACCOUNTS_KV. Hemmeligheter: AUTH_SECRET (signering),
 * RESEND_API_KEY + EMAIL_FROM (e-postutsending). DEV_AUTH=1 returnerer koden i svaret for testing.
 *
 * Kreditter gjelder video + bilde. Tildeling skjer (senere) automatisk via abonnement-webhook.
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

async function makeToken(env, email) {
  const payload = b64url(enc.encode(JSON.stringify({ email, exp: Date.now() + 30 * 24 * 3600 * 1000 })));
  return payload + "." + (await hmac(secret(env), payload));
}
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

function normEmail(e) { return String(e || "").trim().toLowerCase(); }
function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

async function getUser(env, email) {
  const raw = await env.ACCOUNTS_KV.get("user:" + email);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return null;
}
async function putUser(env, user) {
  await env.ACCOUNTS_KV.put("user:" + user.email, JSON.stringify(user));
  return user;
}
function publicAccount(u) {
  return { email: u.email, plan: u.plan || "free", credits: u.credits || { video: 0, image: 0 } };
}

async function sendCodeEmail(env, email, code) {
  const key = env.RESEND_API_KEY;
  if (!key) return false;
  const from = env.EMAIL_FROM || "LME Content Studio <noreply@lmexplorers.com>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [email],
        subject: "Innloggingskode: " + code,
        html: `<div style="font-family:sans-serif;font-size:15px;color:#1A1A1A;">
          <p>Hei!</p><p>Koden din til LME Content Studio er:</p>
          <p style="font-size:30px;font-weight:800;letter-spacing:4px;color:#C81860;">${code}</p>
          <p style="color:#666;">Koden varer i 10 minutter. Hvis du ikke ba om den, kan du se bort fra denne e-posten.</p></div>`,
      }),
    });
    return r.ok;
  } catch (e) { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ACCOUNTS_KV) return json({ error: "ACCOUNTS_KV ikke bundet i Cloudflare. Legg til KV-bindingen for å aktivere innlogging." }, 200);

  let body = {};
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const action = body.action;

  if (action === "request") {
    const email = normEmail(body.email);
    if (!validEmail(email)) return json({ error: "Ugyldig e-postadresse." }, 200);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await env.ACCOUNTS_KV.put("code:" + email, JSON.stringify({ code, ts: Date.now() }), { expirationTtl: 600 });
    const sent = await sendCodeEmail(env, email, code);
    const out = { ok: true, sent };
    if (env.DEV_AUTH === "1") out.devCode = code; // kun for testing
    if (!sent && env.DEV_AUTH !== "1") out.note = "E-postutsending er ikke konfigurert (RESEND_API_KEY mangler).";
    return json(out);
  }

  if (action === "verify") {
    const email = normEmail(body.email);
    const code = String(body.code || "").trim();
    const raw = await env.ACCOUNTS_KV.get("code:" + email);
    if (!raw) return json({ error: "Koden er utløpt. Be om en ny." }, 200);
    let rec; try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    if (!rec || rec.code !== code) return json({ error: "Feil kode." }, 200);
    await env.ACCOUNTS_KV.delete("code:" + email);
    let user = await getUser(env, email);
    if (!user) {
      user = { email, plan: "free", credits: { video: 0, image: 0 }, createdAt: Date.now() };
      await putUser(env, user);
    }
    const token = await makeToken(env, email);
    return json({ token, account: publicAccount(user) });
  }

  if (action === "me") {
    const email = await verifyToken(env, body.token);
    if (!email) return json({ error: "not_authenticated" }, 200);
    const user = await getUser(env, email);
    if (!user) return json({ error: "not_authenticated" }, 200);
    return json({ account: publicAccount(user) });
  }

  return json({ error: "ukjent action" }, 400);
}
