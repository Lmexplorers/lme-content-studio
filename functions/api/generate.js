/**
 * LME Autopilot — generering via Cloudflare (proxy).
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

import { loggForbruk } from "../_lib/forbrukslogg.js";
import { erEierEpost } from "../_lib/eier.js";

/* Hvilken modell-id vi faktisk kalte, slik den heter hos leverandøren.
   Appen bruker korte kallenavn ("dalle3", "nano"), mens forbruksloggen og
   /ai-kostnader vil ha den ekte id-en, ellers finner de ingen pris. */
function modellId(kortnavn, harMalbilde) {
  if (kortnavn === "nano") return "gemini-2.5-flash-image";
  if (kortnavn === "nano-pro") return "gemini-3-pro-image-preview";
  // DALL-E 3 kan ikke ta malbilde, da bytter koden over til gpt-image-1.
  return harMalbilde ? "gpt-image-1" : "dall-e-3";
}

/* ───────── Konto / token / plan-tak ───────── */

// Inkluderte mengder per plan (dekket av abonnementet, på LMEs egen nøkkel).
// Over taket bruker appen kundens egen nøkkel, så det koster ikke LME noe.
// Inkludert i en betalt plan: 500 tekster og 100 bilder.
//
// Video er 0 med vilje, og det er den samme regelen hele plattformen folger
// (`INNER_CIRCLE_LIMITS` i lme-platform, og `dop-turbo` i AI Core-registeret som
// star oppfort uten pris fordi den selges som forhandskjopt kreditt). Renate skal
// ikke sta for andres genereringskostnad pa video. Kunden bruker egen video-nokkel
// eller kjoper kreditt; se quotaMsg() for beskjeden de faktisk far.
//
// Bilder er billige nok a inkludere: standardmodellen dall-e-3 koster $0,04 per
// bilde, sa 100 bilder er rundt $4 i maneden.
const PLAN_CAPS = {
  free:      { text: 0,   image: 0,   video: 0 },
  app:       { text: 500, image: 100, video: 0 },
  // Planene som faktisk selges. Navnene her MA vaere de samme som
  // AUTOPILOT_PAYMENT_LINKS skriver i lme-platform sin purchase-links.js,
  // ellers faller kunden ned pa `free` og far null av alt. Det var akkurat
  // den feilen som gjorde at en betalende Proff-kunde ikke fikk generere:
  // webhooken skrev "cs-proff", og den fantes ikke i denne tabellen.
  "cs-start": { text: 500, image: 30,  video: 0 },
  "cs-proff": { text: 500, image: 100, video: 0 },
  "cs-pluss": { text: 500, image: 250, video: 0 },
  // Bakoverkompatible aliaser fra tiden for cs-navnene:
  start:     { text: 500, image: 100, video: 0 },
  proff:     { text: 500, image: 100, video: 0 },
  proffplus: { text: 500, image: 100, video: 0 },
  arlig:     { text: 500, image: 100, video: 0 },
};
function planCaps(plan) { return PLAN_CAPS[plan] || PLAN_CAPS.free; }

/* Hvilken plan gjelder for denne kontoen, og hvilke tak har den.
   Webhooken i lme-platform lagrer abonnementet som user.subscription
   ({plan, limits}), mens appen tradisjonelt leste user.plan. Leser vi bare
   user.plan, ser vi aldri et kjop gjort pa /oppgrader. Derfor: subscription
   forst, user.plan som reserve.
   Video tvinges alltid til 0, uansett hva som ligger lagret. Video folger
   ikke med i en plan, og en gammel lagret grense skal ikke kunne apne for
   generering Renate ikke har tenkt a betale for. */
/* Hvor abonnementet ligger, og hvorfor det er to steder.

   Webhooken i lme-platform (grantAutopilot i _lib/purchase-links.js) skriver
   ALLTID `member:<e-post>`, men legger bare abonnementet paa `user:<e-post>`
   hvis den posten allerede finnes. Kjoeper noen FOER de har logget inn i
   appen foerste gang, finnes den ikke, og da staar abonnementet bare i
   member-posten. Leser vi bare user.subscription, faar en fersk kunde null
   av alt, og det er den vanligste rekkefoelgen: hun kjoeper, saa logger hun
   inn.

   Derfor: user.subscription foerst, member-posten som reserve.

   Merk at resultatet med vilje IKKE lagres tilbake paa user-posten. Sies
   abonnementet opp, oppdaterer webhooken member-posten, og en lagret kopi
   ville latt kunden beholde tilgangen. */
async function abonnementFor(env, email, user) {
  if (user && user.subscription) return user.subscription;
  try {
    const raw = await env.ACCOUNTS_KV.get("member:" + email);
    if (raw) {
      const rec = JSON.parse(raw);
      if (rec && rec.plan) return { status: rec.status, plan: rec.plan, limits: rec.limits };
    }
  } catch (e) { /* ingen member-post, eller ulesbar. Faller til planCaps under. */ }
  return null;
}

function capsForSub(sub, user) {
  const aktiv = sub && (sub.status === "active" || sub.status === undefined);
  if (aktiv && sub.limits && typeof sub.limits === "object") {
    const base = planCaps(sub.plan || (user && user.plan) || "free");
    return {
      text:  base.text,
      image: Number(sub.limits.image || 0),
      video: 0,
    };
  }
  return planCaps((sub && aktiv && sub.plan) || (user && user.plan) || "free");
}
// Beholdt for bakoverkompatibilitet i eksisterende kode.
const PLAN_IMAGE_CAP = { free: 0, start: 100, proff: 100, proffplus: 100, arlig: 100, app: 100 };

// Eieren skal aldri stoppes av bilde-taket. Lista ligger i _lib/eier.js.
function isOwner(env, email) {
  return erEierEpost(email, env);
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
  if (!user.credits) user.credits = { video: 0, image: capsForSub(await abonnementFor(env, email, user), user).image };
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
  const caps = capsForSub(await abonnementFor(env, email, user), user);
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
  if (code === "no_" + kind + "_credits") {
    // Har planen aldri hatt en kvote for dette, er "brukt opp" feil. Video
    // folger aldri med i en plan, den betales av kunden selv.
    if (kind === "video") return "Video følger ikke med i planen. Legg inn " + own + " i Innstillinger, så kan du lage så mange du vil.";
    return "Du har brukt opp det inkluderte. Legg inn " + own + " i Innstillinger for å fortsette.";
  }
  return "Logg inn for å bruke det inkluderte, eller legg inn " + own + " i Innstillinger.";
}

/* Er dette leverandøren som sier at kontoen er tom, og ikke en vanlig feil?
   Meldingen kommer på engelsk rett fra OpenAI eller Google, og sto før ordrett
   i appen ("You have no credits remaining..."), som verken sier hvem sin konto
   det gjelder eller hva du skal gjøre. */
function erTomForKreditt(melding) {
  const m = String(melding || "").toLowerCase();
  return m.includes("no credits remaining") || m.includes("insufficient_quota") ||
    m.includes("exceeded your current quota") || m.includes("billing hard limit") ||
    m.includes("quota exceeded") || m.includes("resource_exhausted");
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
    if (erTomForKreditt(lastErr)) return { error: lastErr, tom: true, leverandor: "OpenAI" };
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
    if (!r.ok) {
      const feil = (d.error && d.error.message) || ("Gemini " + r.status);
      if (erTomForKreditt(feil)) return { error: feil, tom: true, leverandor: "Google Gemini" };
      return { error: feil };
    }
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

      const t0 = Date.now();
      let result = await generateImage(env, body, !useServerKey);

      /* Er LMEs egen konto tom for kreditt, skal ikke kunden stoppes hvis hun
         har lagt inn sin egen nøkkel. Da bytter vi til hennes, og bildet blir
         laget. Har hun ingen, sier vi hvem sin konto som er tom og hva som er
         veien videre, i stedet for å sende den engelske råteksten videre. */
      if (result && result.tom && useServerKey) {
        if (body.key) {
          result = await generateImage(env, body, true);
          useServerKey = false;
        } else {
          /* Selve valget ligger som en knapp i appen, så meldingen sier bare
             hva som er galt, ikke hva knappen alt tilbyr. */
          return json({
            error: "Bildekontoen til LME (" + result.leverandor + ") er tom for kreditt, så bildet " +
              "kunne ikke lages. Den andre bildemodellen går på en annen konto, eller du kan legge " +
              "inn din egen nøkkel i Innstillinger.",
            code: "lme_tom_for_kreditt",
            leverandor: result.leverandor,
          }, 200);
        }
      }
      // Bare kall paa LMEs egen nokkel foeres i loggen: det er de som koster
      // Renate penger. Bruker kunden sin egen nokkel, betaler hun direkte.
      if (useServerKey) {
        await loggForbruk(env, {
          task: "image",
          modelId: modellId(body.model, !!body.refData),
          email: (gateUser && gateUser.email) || "",
          units: { images: 1 },
          status: result.imageUrl ? "ok" : "error",
          ms: Date.now() - t0,
          error: result.imageUrl ? "" : (result.error || ""),
          note: gateOwner ? "eier" : "",
        });
      }
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
      const tTekst = Date.now();
      let brukteTokens = {};
      let tekstModell = body.model || (provider === "openai" ? "gpt-4o" : "claude-sonnet-4-6");
      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({ model: body.model || "gpt-4o", max_tokens: body.max_tokens || 1500, messages: [{ role: "user", content: body.prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("OpenAI " + r.status) }, 200);
        text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
        if (d.usage) brukteTokens = { inputTokens: d.usage.prompt_tokens || 0, outputTokens: d.usage.completion_tokens || 0 };
      } else {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: body.model || "claude-sonnet-4-6", max_tokens: body.max_tokens || 1500, messages: [{ role: "user", content: body.prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("Claude " + r.status) }, 200);
        text = (d.content && d.content.map((b) => b.text || "").join("")) || "";
        if (d.usage) brukteTokens = { inputTokens: d.usage.input_tokens || 0, outputTokens: d.usage.output_tokens || 0 };
      }
      if (useServerKey) {
        await loggForbruk(env, {
          task: "text",
          modelId: tekstModell,
          email: (gu && gu.email) || "",
          units: brukteTokens,
          status: "ok",
          ms: Date.now() - tTekst,
          note: go ? "eier" : "",
        });
      }
      if (useServerKey && gu && !go) { try { await consumeCredit(env, gu, "text"); } catch (e) {} }
      return json({ text });
    }

    return json({ error: "ukjent type" }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}
