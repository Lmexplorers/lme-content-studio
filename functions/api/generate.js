/**
 * LME Content Studio — generering via Cloudflare (proxy).
 * Unngår CORS ("Failed to fetch") og kan skjule nøkler.
 *
 * POST /api/generate
 *  Bilde: { type:"image", model:"dalle3"|"nano"|"nano-pro", key?, token?, prompt, size?, aspectRatio? }
 *         -> { imageUrl: "data:image/...;base64,..." }
 *  Tekst: { type:"text", provider:"claude"|"openai", key?, prompt, model?, max_tokens? }
 *         -> { text: "..." }
 *
 * Nøkkel hentes fra Cloudflare-hemmelighet hvis satt (OPENAI_API_KEY / GEMINI_API_KEY /
 * ANTHROPIC_API_KEY), ellers fra request-body (BYO-nøkkel fra appen).
 *
 * BILDE-TAK PER PLAN: Når bildet lages med LMEs egen nøkkel (Cloudflare-hemmelighet),
 * håndheves et månedlig tak knyttet til kundens plan FØR OpenAI/Gemini-kallet. Taket
 * styres av kreditter (user.credits.image i ACCOUNTS_KV), som settes av abonnement-webhooken.
 * Hver vellykket bilde trekker én kreditt. Bruker kunden sin egen nøkkel, gjelder ikke taket
 * (da betaler kunden selv, og LME har ingen kostnad).
 */

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* ───────── Konto / token / plan-tak ───────── */

// Inkluderte mengder per plan (dekket av abonnementet, på LMEs egen nøkkel).
// Over taket bruker appen kundens egen nøkkel, så det koster ikke LME noe.
// App-planen (699 kr/mnd, 6 990 kr/år): 500 tekster, 100 bilder, 5 videoklipp.
const PLAN_CAPS = {
  free:      { text: 0,   image: 0,   video: 0 },
  app:       { text: 500, image: 100, video: 5 },
  // Bakoverkompatible aliaser, alle betalte planer = app-planen:
  start:     { text: 500, image: 100, video: 5 },
  proff:     { text: 500, image: 100, video: 5 },
  proffplus: { text: 500, image: 100, video: 5 },
  arlig:     { text: 500, image: 100, video: 5 },
};
function planCaps(plan) { return PLAN_CAPS[plan] || PLAN_CAPS.free; }
// Beholdt for bakoverkompatibilitet i eksisterende kode.
const PLAN_IMAGE_CAP = { free: 0, start: 100, proff: 100, proffplus: 100, arlig: 100, app: 100 };

// Eieren skal aldri stoppes av bilde-taket. Kan utvides via env.OWNER_EMAIL.
const OWNER_EMAILS = ["renateshobby@hotmail.com"];
function isOwner(env, email) {
  if (!email) return false;
  const e = String(email).toLowerCase();
  if (OWNER_EMAILS.includes(e)) return true;
  if (env.OWNER_EMAIL && e === String(env.OWNER_EMAIL).toLowerCase()) return true;
  return false;
}

const _enc = new TextEncoder();
const _dec = new TextDecoder();
function _b64urlDecode(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
function _b64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function _hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", _enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, _enc.encode(data));
  return _b64url(new Uint8Array(sig));
}
// Samme token-format som functions/api/auth.js
async function verifyToken(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const secret = env.AUTH_SECRET || "lme-dev-secret-change-me";
  const [payload, sig] = token.split(".");
  if (sig !== (await _hmac(secret, payload))) return null;
  try {
    const o = JSON.parse(_dec.decode(_b64urlDecode(payload)));
    if (o.exp && o.exp < Date.now()) return null;
    return o.email;
  } catch (e) { return null; }
}
async function getUser(env, email) {
  const raw = await env.ACCOUNTS_KV.get("user:" + email);
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }
  return null;
}
async function putUser(env, user) {
  await env.ACCOUNTS_KV.put("user:" + user.email, JSON.stringify(user));
}

// Sjekker plan-taket FØR generering. Returnerer { user } hvis ok, ellers { error, code }.
async function checkImageQuota(env, token) {
  if (!env.ACCOUNTS_KV) {
    return { error: "Innlogging er ikke konfigurert (ACCOUNTS_KV mangler). Kontakt support." , code: "no_kv" };
  }
  const email = await verifyToken(env, token);
  if (!email) return { error: "Logg inn for å generere bilder.", code: "login_required" };
  // Eieren har alltid ubegrenset bildegenerering.
  if (isOwner(env, email)) {
    return { user: (await getUser(env, email)) || { email, plan: "owner" }, owner: true };
  }
  const user = await getUser(env, email);
  if (!user) return { error: "Logg inn for å generere bilder.", code: "login_required" };
  const plan = user.plan || "free";
  if (!user.credits) user.credits = { video: 0, image: PLAN_IMAGE_CAP[plan] != null ? PLAN_IMAGE_CAP[plan] : 0 };
  const remaining = Number(user.credits.image || 0);
  if (remaining <= 0) {
    return {
      error: "Du har brukt opp bilde-kredittene dine for denne perioden. Oppgrader planen for flere. (You have used all your image credits for this period.)",
      code: "no_image_credits",
    };
  }
  return { user };
}

// Trekker én bilde-kreditt etter vellykket generering.
async function consumeImageCredit(env, user) {
  user.credits = user.credits || { video: 0, image: 0 };
  user.credits.image = Math.max(0, Number(user.credits.image || 0) - 1);
  await putUser(env, user);
}

// Generisk kvotesjekk for text/image/video. Returnerer {user} hvis innenfor taket,
// {owner:true} for eieren, eller {error, code} ellers.
async function checkQuota(env, token, kind) {
  if (!env.ACCOUNTS_KV) return { error: "Innlogging er ikke konfigurert (ACCOUNTS_KV mangler).", code: "no_kv" };
  const email = await verifyToken(env, token);
  if (!email) return { error: "login", code: "login_required" };
  if (isOwner(env, email)) return { user: (await getUser(env, email)) || { email, plan: "owner" }, owner: true };
  const user = await getUser(env, email);
  if (!user) return { error: "login", code: "login_required" };
  const caps = planCaps(user.plan || "free");
  if (!user.credits) user.credits = { text: caps.text, image: caps.image, video: caps.video };
  if (user.credits[kind] == null) user.credits[kind] = caps[kind] || 0;
  if (Number(user.credits[kind] || 0) <= 0) return { error: "empty", code: "no_" + kind + "_credits" };
  return { user };
}
async function consumeCredit(env, user, kind) {
  user.credits = user.credits || {};
  user.credits[kind] = Math.max(0, Number(user.credits[kind] || 0) - 1);
  await putUser(env, user);
}
// Fast melding når inkludert mengde er brukt opp eller innlogging mangler.
function quotaMsg(kind, code) {
  const own = { text: "din egen Claude-nøkkel", image: "din egen OpenAI- eller Gemini-nøkkel", video: "din egen video-nøkkel" }[kind] || "din egen nøkkel";
  if (code === "no_" + kind + "_credits") return "Du har brukt opp det inkluderte. Legg inn " + own + " i Innstillinger for å fortsette.";
  return "Logg inn for å bruke det inkluderte, eller legg inn " + own + " i Innstillinger.";
}

/* ───────── Bildegenerering (returnerer {imageUrl} eller {error}) ───────── */

async function generateImage(env, body, forceUserKey) {
  const model = body.model || "dalle3";
  if (model === "dalle3") {
    const key = forceUserKey ? body.key : (env.OPENAI_API_KEY || body.key);
    if (!key) return { error: "OpenAI-nøkkel mangler. Legg den inn i Innstillinger." };
    const sz = body.size || "1024x1024";
    const gptSize = sz === "1024x1792" ? "1024x1536" : sz === "1792x1024" ? "1536x1024" : "1024x1024";
    const dalleQuality = body.quality === "hd" ? "hd" : "standard";

    // Malbilde/referanse: DALL-E 3 støtter det ikke, men gpt-image-1 gjør det via /images/edits.
    if (body.refData) {
      try {
        const bin = Uint8Array.from(atob(body.refData), (c) => c.charCodeAt(0));
        const blob = new Blob([bin], { type: body.refMime || "image/png" });
        const form = new FormData();
        form.append("model", "gpt-image-1");
        form.append("image", blob, "ref.png");
        form.append("prompt", body.prompt);
        form.append("size", gptSize);
        const r = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { "Authorization": "Bearer " + key },
          body: form,
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.data && d.data[0] && d.data[0].b64_json) {
          return { imageUrl: "data:image/png;base64," + d.data[0].b64_json };
        }
        return { error: (d.error && d.error.message) || ("OpenAI edits " + r.status) };
      } catch (e) {
        return { error: "Malbilde-feil: " + String((e && e.message) || e) };
      }
    }

    const attempts = [
      { model: "dall-e-3", prompt: body.prompt, n: 1, size: sz, quality: dalleQuality },
      { model: "gpt-image-1", prompt: body.prompt, n: 1, size: gptSize },
    ];
    let lastErr = "Ingen bilde i svaret";
    for (const a of attempts) {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify(a),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const item = d.data && d.data[0];
        if (item && item.b64_json) return { imageUrl: "data:image/png;base64," + item.b64_json };
        if (item && item.url) {
          try {
            const ir = await fetch(item.url);
            const buf = await ir.arrayBuffer();
            return { imageUrl: "data:image/png;base64," + bufToB64(buf) };
          } catch (e) { return { imageUrl: item.url }; }
        }
        lastErr = "Ingen bilde i svaret";
      } else {
        lastErr = (d.error && d.error.message) || ("OpenAI " + r.status);
      }
    }
    return { error: lastErr };
  } else {
    const key = forceUserKey ? body.key : (env.GEMINI_API_KEY || body.key);
    if (!key) return { error: "Gemini-nøkkel mangler. Legg den inn i Innstillinger." };
    const gModel = model === "nano-pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
    const reqParts = [];
    if (body.refData) reqParts.push({ inlineData: { mimeType: body.refMime || "image/jpeg", data: body.refData } });
    reqParts.push({ text: body.prompt });
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + gModel + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: reqParts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: body.aspectRatio || "1:1" } } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (d.error && d.error.message) || ("Gemini " + r.status) };
    const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    const ip = parts.find((p) => p.inlineData || p.inline_data);
    const inl = ip && (ip.inlineData || ip.inline_data);
    if (!inl || !inl.data) return { error: "Ingen bilde i svaret" };
    return { imageUrl: "data:" + (inl.mimeType || inl.mime_type || "image/png") + ";base64," + inl.data };
  }
}

// Bruker LME sin egen nøkkel for dette bildet? (Da gjelder plan-taket.)
function usesOwnerKey(env, model) {
  return (model || "dalle3") === "dalle3" ? !!env.OPENAI_API_KEY : !!env.GEMINI_API_KEY;
}

/* ───────── Handler ───────── */

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const type = body.type;

  try {
    if (type === "image") {
      // Modell: inkluderte bilder går på LMEs egen nøkkel (med tak). Over taket,
      // eller uten innlogging, bruker appen kundens egen nøkkel (BYOK), så det
      // ikke koster LME noe.
      const serverHasKey = usesOwnerKey(env, body.model);
      let useServerKey = false, gateUser = null, gateOwner = false;
      if (serverHasKey) {
        const gate = await checkImageQuota(env, body.token);
        if (gate.error) {
          if (gate.code === "no_kv") return json({ error: gate.error, code: gate.code }, 200);
          // Kvote brukt opp eller ikke innlogget: krev kundens egen nøkkel.
          if (!body.key) {
            const msg = gate.code === "no_image_credits"
              ? "Du har brukt opp de inkluderte bildene. Legg inn din egen OpenAI- eller Gemini-nøkkel i Innstillinger for å fortsette."
              : "Logg inn for å bruke de inkluderte bildene, eller legg inn din egen nøkkel i Innstillinger.";
            return json({ error: msg, code: gate.code }, 200);
          }
          // Faller tilbake til kundens egen nøkkel.
        } else {
          useServerKey = true; gateUser = gate.user; gateOwner = !!gate.owner;
        }
      }

      const result = await generateImage(env, body, !useServerKey);
      if (result.imageUrl) {
        if (useServerKey && gateUser && !gateOwner) {
          try { await consumeImageCredit(env, gateUser); } catch (e) {}
        }
        return json({ imageUrl: result.imageUrl });
      }
      return json({ error: result.error || "Ingen bilde i svaret" }, 200);
    }

    if (type === "text") {
      const provider = body.provider || "claude";
      const serverKey = provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
      // Inkludert tekst går på LMEs nøkkel opp til taket, deretter kundens egen.
      let useServerKey = false, gu = null, go = false;
      if (serverKey) {
        const gate = await checkQuota(env, body.token, "text");
        if (gate.error) {
          if (gate.code === "no_kv") return json({ error: gate.error, code: gate.code }, 200);
          if (!body.key) return json({ error: quotaMsg("text", gate.code), code: gate.code }, 200);
        } else { useServerKey = true; gu = gate.user; go = !!gate.owner; }
      }
      const key = useServerKey ? serverKey : body.key;
      if (!key) return json({ error: provider === "openai" ? "OpenAI-nøkkel mangler." : "Claude-nøkkel mangler." }, 400);

      let text = "";
      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({ model: body.model || "gpt-4o", max_tokens: body.max_tokens || 1500, messages: [{ role: "user", content: body.prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("OpenAI " + r.status) }, 200);
        text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
      } else {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: body.model || "claude-sonnet-4-6", max_tokens: body.max_tokens || 1500, messages: [{ role: "user", content: body.prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("Claude " + r.status) }, 200);
        text = (d.content && d.content.map((b) => b.text || "").join("")) || "";
      }
      if (useServerKey && gu && !go) { try { await consumeCredit(env, gu, "text"); } catch (e) {} }
      return json({ text });
    }

    return json({ error: "ukjent type" }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}
