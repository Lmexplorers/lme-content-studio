/**
 * LME Autopilot — autoposting via Blotato.
 *
 * Kontrollerbar publiserings-motor.
 * Klienten sender Blotato-nokkel + post-data hit; vi laster opp media til
 * Blotato og publiserer. Auto-deployes med Pages, sa den kan feilsokes/rettes.
 *
 * POST /api/publish
 *  {
 *    blotatoKey: "...",                 // brukerens Blotato API-nokkel (fra appens innstillinger)
 *    accountId: "123",                  // Blotato-konto-id for plattformen
 *    targetType: "instagram",           // instagram|facebook|tiktok|youtube|linkedin|pinterest|threads|twitter|bluesky
 *    text: "bildetekst ...",
 *    mediaUrls: ["https://offentlig-url-til-bilde-eller-video"],  // valgfritt, kilde-URLer Blotato henter og re-hoster
 *    target: { ... },                   // valgfrie ekstra plattform-felt (pageId, title, privacy ...)
 *    scheduledTime: "2026-07-01T09:00:00Z"  // valgfritt
 *  }
 *  -> { ok, postId?, blotato? } eller { error, detail, status }
 */

import {
  lesKobling, finnKonto, offentligMedia, publiserTil, planleggTil,
} from "../_lib/meta-publish.js";

const BLOTATO = "https://backend.blotato.com/v2";

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Blotato/plattformene avviser hele innlegget hvis teksten er for lang eller har for mange
// emneknagger, sa vi tilpasser teksten per plattform for a sende (i stedet for a sende samme
// lange Instagram-tekst overalt og fa en kryptisk feil tilbake fra Blotato).
const TEXT_LIMITS = { twitter: 280, x: 280, bluesky: 300, threads: 500 };
const HASHTAG_LIMITS = { instagram: 5 };

function capHashtags(text, max) {
  let count = 0;
  return text.replace(/#[^\s#]+/g, (tag) => (++count <= max ? tag : "")).replace(/[ \t]{2,}/g, " ").trim();
}

function fitTextForPlatform(text, plat) {
  let out = text || "";
  const hMax = HASHTAG_LIMITS[plat];
  if (hMax) out = capHashtags(out, hMax);
  const cMax = TEXT_LIMITS[plat];
  if (cMax && out.length > cMax) out = out.slice(0, cMax - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}

async function blotato(path, key, body) {
  const r = await fetch(BLOTATO + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "blotato-api-key": key },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch (e) { data = { raw: await r.text().catch(() => "") }; }
  return { ok: r.ok, status: r.status, data };
}

/* ─────────────────── Hvem far lov til a autopublisere ───────────────────
 *
 * Autopublisering folger med engangskjopet av appen (1490 kr) og med
 * abonnementet, ikke med en gratis konto. Sjekken ligger HER, pa serveren,
 * og ikke bare i knappen: en las som bare finnes i nettleseren er ingen las.
 *
 * Kunden bruker sin EGEN Blotato-nokkel uansett, sa dette koster ikke LME
 * noe. Det er nettopp derfor det kan folge med et engangskjop.
 *
 * Er ikke innloggingen satt opp i det hele tatt (ACCOUNTS_KV eller
 * AUTH_SECRET mangler), slipper vi gjennom. Da er dette et oppsett uten
 * kontoer, og a lase alle ute ville vaert verre enn a la alle publisere.
 */
const OWNER_EMAILS = ["renateshobby@hotmail.com"];

async function harPubliseringstilgang(env, token) {
  if (!env || !env.ACCOUNTS_KV || !env.AUTH_SECRET) return { ok: true };

  const LOGG_INN = {
    ok: false, code: "login_required",
    error: "Logg inn for a publisere. Autopublisering folger med appen (engangskjop) eller et abonnement.",
  };
  if (!token) return LOGG_INN;

  // Samme tokenformat som /api/auth lager: base64url(payload).hmac
  let email = null;
  try {
    const [payload, sig] = String(token).split(".");
    if (!payload || !sig) return LOGG_INN;
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", enc.encode(env.AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", k, enc.encode(payload));
    let bin = ""; const bytes = new Uint8Array(mac);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const ventet = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (sig !== ventet) return LOGG_INN;
    let s = payload.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
    if (o.exp && o.exp < Date.now()) return LOGG_INN;
    email = String(o.email || "").trim().toLowerCase();
  } catch (e) { return LOGG_INN; }
  if (!email) return LOGG_INN;

  // Eieren skal aldri stoppes av en las i sitt eget produkt.
  if (OWNER_EMAILS.includes(email) || (env.OWNER_EMAIL && email === String(env.OWNER_EMAIL).toLowerCase())) {
    return { ok: true, email: email };
  }

  // Kjopet star pa member:<e-post>, speilet til user:<e-post> nar kontoen
  // fantes da kjopet skjedde. Kjoper hun for forste innlogging, finnes bare
  // member-posten. Derfor leses begge.
  let harApp = false;
  try {
    const raw = await env.ACCOUNTS_KV.get("member:" + email);
    if (raw) {
      const rec = JSON.parse(raw);
      if (rec && (rec.appKjopt || (rec.plan && rec.status === "active"))) harApp = true;
    }
  } catch (e) {}
  if (!harApp) {
    try {
      const raw = await env.ACCOUNTS_KV.get("user:" + email);
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.appKjopt || (u.subscription && u.subscription.status === "active"))) harApp = true;
      }
    } catch (e) {}
  }
  if (harApp) return { ok: true, email: email };

  return {
    ok: false, code: "app_required",
    error: "Autopublisering folger med appen. Kjop den en gang for 1490 kr pa " +
           "lmexplorers.com/autopilot-app, eller velg et abonnement.",
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

  const tilgang = await harPubliseringstilgang(env, b.token);
  if (!tilgang.ok) return json({ error: tilgang.error, code: tilgang.code }, 200);

  const key = b.blotatoKey;

  // Bygg konto-liste. Ny vei: b.accounts = [{id, platform}] (flervalg).
  // Bakoverkomp.: enkelt b.accountId + b.targetType.
  let accounts = Array.isArray(b.accounts)
    ? b.accounts.filter((a) => a && a.id).map((a) => ({ id: String(a.id), platform: a.platform || a.targetType || b.targetType || "instagram", pageId: a.pageId, boardId: a.boardId, src: a.src }))
    : [];
  if (!accounts.length && b.accountId) accounts = [{ id: String(b.accountId), platform: b.targetType || "instagram" }];
  if (!accounts.length) return json({ error: "Mangler konto. Velg minst en profil du vil poste til." }, 200);

  const contentKind = b.contentKind || ""; // 'story' | 'reel' | 'post'

  /* To veier ut.
   *
   * LME-kontoer gaar gjennom plattformens egen Metakobling (Instagram og
   * Facebook), den samme kunden koblet til paa lmexplorers.com/planlegger.
   * Da trenger hun ingen Blotato-konto for at Autopilot skal gaa paa auto.
   *
   * Blotato-kontoer gaar som for, og er veien til TikTok og resten. */
  const lmeKontoer = accounts.filter((a) => a.src === "lme");
  const blKontoer = accounts.filter((a) => a.src !== "lme");

  let lmeResultater = [];
  if (lmeKontoer.length) {
    lmeResultater = await publiserViaLME(env, tilgang.email, lmeKontoer, b, contentKind);
  }
  if (!blKontoer.length) return oppsummer(lmeResultater);

  if (!key) {
    return json({ error: "Mangler Blotato-nokkel. Legg den inn i Innstillinger, eller velg kontoene du har koblet til via LME." }, 200);
  }

  try {
    // 1) Last opp hver media-kilde til Blotato EN gang (gjenbrukes for alle kontoer).
    // Blotato tar imot både offentlige URL-er og base64/data-URI-er (opp til 200 MB).
    const mediaUrls = [];
    for (const src of (b.mediaUrls || [])) {
      if (!src) continue;
      const mediaBody = { url: src };
      if (/^data:/.test(src) && b.mediaName) mediaBody.filename = b.mediaName;
      const up = await blotato("/media", key, mediaBody);
      if (!up.ok) {
        return json({ error: "Opplasting til Blotato feilet.", step: "media", status: up.status, detail: up.data }, 200);
      }
      const hosted = up.data && (up.data.url || up.data.mediaUrl || (up.data.media && up.data.media.url));
      if (!hosted) return json({ error: "Fant ingen media-URL i Blotato-svaret.", step: "media", detail: up.data }, 200);
      mediaUrls.push(hosted);
    }

    // 2) Publiser til hver valgt konto.
    const results = [];
    for (const acc of accounts) {
      const plat = acc.platform || "instagram";

      // Facebook krever pageId, Pinterest krever boardId. Uten dem avviser Blotato hele
      // innlegget med en kryptisk feil, sa vi hopper over med en forstaelig beskjed i stedet
      // for a bruke opp et forsok pa et innlegg som uansett aldri kan lykkes.
      if (plat === "facebook" && !acc.pageId) {
        results.push({ accountId: acc.id, platform: plat, ok: false, error: "mangler Facebook-side (pageId). Velg riktig side pa nytt i Innstillinger, sa hent kontoer pa nytt." });
        continue;
      }
      if (plat === "pinterest" && !acc.boardId) {
        results.push({ accountId: acc.id, platform: plat, ok: false, error: "mangler Pinterest-tavle (boardId). Velg riktig tavle pa nytt i Innstillinger, sa hent kontoer pa nytt." });
        continue;
      }

      const target = { targetType: plat };
      // mediaType (story/reel) gjelder kun Instagram og Facebook.
      if ((plat === "instagram" || plat === "facebook") && (contentKind === "story" || contentKind === "reel")) target.mediaType = contentKind;
      // Plattform-spesifikke pakrevde felt (Blotato krever disse, ellers avvises innlegget).
      if (plat === "tiktok") {
        target.privacyLevel = "PUBLIC_TO_EVERYONE";
        target.disabledComments = false;
        target.disabledDuet = false;
        target.disabledStitch = false;
        target.isBrandedContent = false;
        target.isYourBrand = false;
        target.isAiGenerated = false;
      }
      if (plat === "youtube") {
        target.title = ((b.text || "").split("\n")[0] || "Video").slice(0, 95);
        target.privacyStatus = "public";
        target.shouldNotifySubscribers = false;
      }
      if (plat === "facebook") target.pageId = String(acc.pageId);
      if (plat === "pinterest") target.boardId = String(acc.boardId);
      if (b.target && typeof b.target === "object") Object.assign(target, b.target);
      const post = {
        accountId: String(acc.id),
        target,
        // Samme lange bildetekst passer ikke overalt: kutt til plattformens tegngrense
        // og emneknagg-tak (f.eks. Twitter 280 tegn, Bluesky 300, Instagram maks 5 emneknagger).
        content: { text: fitTextForPlatform(b.text || "", plat), platform: plat, mediaUrls },
      };
      const payload = { post };
      if (b.scheduledTime) payload.scheduledTime = b.scheduledTime;

      const pub = await blotato("/posts", key, payload);
      results.push({
        accountId: acc.id,
        platform: plat,
        ok: pub.ok,
        status: pub.status,
        error: pub.ok ? undefined : ((pub.data && (pub.data.message || pub.data.error)) || ("status " + pub.status)),
        data: pub.ok ? pub.data : undefined,
      });
    }

    return oppsummer(lmeResultater.concat(results));
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}

/* ─────────────────────── Publisering via LMEs Metakobling ───────────────
 *
 * Kunden kobler til Instagram og Facebook en gang paa
 * lmexplorers.com/planlegger. Tilgangsnoklene ligger i det delte KV-et
 * under social:<e-post>, og brukes her. Ingen Blotato, ingen ekstra
 * regning for kunden, og appen gjor det den heter.
 */
async function publiserViaLME(env, email, kontoer, b, contentKind) {
  const IKKE_KOBLET =
    "Du har ikke koblet til Instagram eller Facebook enda. Gjor det en gang " +
    "paa lmexplorers.com/planlegger, sa legger appen ut for deg.";

  if (!email || !env.ACCOUNTS_KV) {
    return kontoer.map((a) => ({ accountId: a.id, platform: a.platform, ok: false, error: IKKE_KOBLET }));
  }
  const kobling = await lesKobling(env, email);
  if (!kobling) {
    return kontoer.map((a) => ({ accountId: a.id, platform: a.platform, ok: false, error: IKKE_KOBLET }));
  }

  /* Meta tar ett medium per innlegg. Appen sender som regel ett, og et
     eventuelt nummer to hoppes over i stedet for aa feile hele innlegget. */
  const kilde = (b.mediaUrls || []).filter(Boolean)[0] || "";
  const erVideo = /^data:video\//i.test(kilde) || /\.(mp4|mov)(\?|$)/i.test(kilde) || contentKind === "reel";

  let mediaUrl = "";
  if (kilde) {
    const m = await offentligMedia(env, kilde);
    if (!m.ok) {
      return kontoer.map((a) => ({ accountId: a.id, platform: a.platform, ok: false, error: m.error }));
    }
    mediaUrl = m.url;
  }

  /* Planlagt innlegg legges i plattformens egen ko, og publiseres av
     bakgrunnsjobben som allerede gaar hvert kvarter. */
  if (b.scheduledTime) {
    const mal = [];
    const ukjente = [];
    for (const a of kontoer) {
      if (finnKonto(kobling, a.id)) mal.push(String(a.id));
      else ukjente.push(a);
    }
    const ut = ukjente.map((a) => ({ accountId: a.id, platform: a.platform, ok: false, error: "Kontoen er ikke koblet til lenger." }));
    if (mal.length) {
      try {
        await planleggTil(env, email, {
          nar: b.scheduledTime, mal: mal, tekst: b.text || "",
          mediaUrl: mediaUrl, erVideo: erVideo, kind: contentKind || "post",
        });
        mal.forEach((id) => ut.push({ accountId: id, platform: (kontoer.find((k) => String(k.id) === id) || {}).platform, ok: true, planlagt: true }));
      } catch (e) {
        mal.forEach((id) => ut.push({ accountId: id, ok: false, error: "Klarte ikke aa legge innlegget i koen." }));
      }
    }
    return ut;
  }

  const ut = [];
  for (const a of kontoer) {
    const konto = finnKonto(kobling, a.id);
    if (!konto) {
      ut.push({ accountId: a.id, platform: a.platform, ok: false, error: "Kontoen er ikke koblet til lenger." });
      continue;
    }
    const r = await publiserTil(env, konto, {
      text: b.text || "", mediaUrl: mediaUrl, erVideo: erVideo, kind: contentKind || "post",
    });
    ut.push({ accountId: a.id, platform: konto.platform, ok: r.ok, id: r.id || "", error: r.error || undefined });
  }
  return ut;
}

/* Samme oppsummering uansett hvilken vei innlegget gikk. */
function oppsummer(alle) {
  const okCount = alle.filter((r) => r.ok).length;
  if (okCount === alle.length && okCount > 0) return json({ ok: true, results: alle });
  const failed = alle.filter((r) => !r.ok).map((r) => (r.platform || r.accountId) + (r.error ? " (" + r.error + ")" : "")).join(", ");
  const msg = okCount > 0
    ? "Sendt til " + okCount + " av " + alle.length + ". Feilet: " + failed
    : "Publisering feilet for alle. " + failed;
  return json({ ok: false, error: msg, okCount: okCount, total: alle.length, results: alle }, 200);
}
