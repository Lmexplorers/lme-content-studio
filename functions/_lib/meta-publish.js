/**
 * LME Autopilot — publisering gjennom LMEs egen Metakobling.
 *
 * HVORFOR DENNE FINNES
 * Autopilot publiserte bare gjennom kundens egen Blotato-konto, og Blotato
 * tar betalt for API-tilgang. Da måtte hver kunde kjøpe et abonnement til
 * for at appen skulle gjøre det den heter, altså legge ut av seg selv.
 * Renate sa nei til det 1. september 2026: det skal ikke finnes en versjon
 * av Autopilot som ikke går på auto.
 *
 * Plattformen har allerede en godkjent Meta-app, brukt av Sosialplanleggeren
 * på /planlegger. Medlemmet kobler til sin egen Facebook-side og Instagram
 * profesjonelle konto der, og tilgangsnøklene ligger i KV under
 * `social:<e-post>`. Appen og plattformen deler KV-navnerom (ACCOUNTS_KV er
 * det samme som BUILDER_KV), så Autopilot kan bruke den samme koblingen.
 *
 * Resultat: Instagram og Facebook virker uten Blotato. Blotato er fortsatt
 * veien til TikTok og de andre, for dem har ikke plattformen egen kobling
 * til ennå.
 *
 * MEDIA
 * Meta henter mediet selv, og krever derfor en offentlig URL. Data-URI-er
 * (base64) fra appen lagres i det delte KV-et under `img:<id>` og serveres
 * av plattformens /api/image. Samme mekanisme som Sosialplanleggeren bruker,
 * og URL-en lever i 30 dager.
 */

/* Plattformen serverer mediet. Endres domenet, endres det her. */
const MEDIA_VERT = "https://lmexplorers.com";

/* KV tar ikke imot verdier over 25 MiB. Vi stopper litt under, med en
   forståelig beskjed, i stedet for at Meta får en halv fil. */
const MAKS_MEDIA = 24 * 1024 * 1024;

function graphBase(env) {
  const v = String((env && env.META_GRAPH_VERSION) || "v23.0").trim();
  return "https://graph.facebook.com/" + v;
}

async function graph(env, sti, params, metode) {
  const url = new URL(graphBase(env) + sti);
  Object.keys(params || {}).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
  });
  const r = await fetch(url.toString(), { method: metode || "GET" });
  const tekst = await r.text();
  let data; try { data = JSON.parse(tekst); } catch (e) { data = { raw: tekst }; }
  // Meta svarer ikke alltid med feil-status. Et svar med `error` er en feil
  // selv om statuslinjen sier 200.
  return { ok: r.ok && !(data && data.error), status: r.status, data };
}

/* Lesbar grunn ut av et Meta-svar, uten å lekke tilgangsnøkler. */
function metaFeil(res) {
  const e = res && res.data && res.data.error;
  if (e && e.error_user_msg) return String(e.error_user_msg);
  if (e && e.message) return String(e.message);
  return "Meta svarte " + ((res && res.status) || "uten status") + ".";
}

/* ---------------------------------------------------------------------- */
/* Tilkoblede kontoer                                                      */
/* ---------------------------------------------------------------------- */

export async function lesKobling(env, email) {
  if (!env || !env.ACCOUNTS_KV || !email) return null;
  try {
    const raw = await env.ACCOUNTS_KV.get("social:" + email);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !Array.isArray(c.accounts)) return null;
    return c;
  } catch (e) { return null; }
}

/* Kontoene slik nettleseren får se dem: aldri med tilgangsnøkler. */
export function offentligeKontoer(kobling) {
  if (!kobling) return [];
  return kobling.accounts.map((a) => ({
    id: a.key, platform: a.platform, name: a.name, picture: a.picture || "", src: "lme",
  }));
}

export function finnKonto(kobling, id) {
  if (!kobling) return null;
  return kobling.accounts.find((a) => a.key === String(id)) || null;
}

/* ---------------------------------------------------------------------- */
/* Media: gjør en data-URI om til en offentlig URL                         */
/* ---------------------------------------------------------------------- */

function base64TilBytes(b64) {
  const bin = atob(b64);
  const ut = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) ut[i] = bin.charCodeAt(i);
  return ut;
}

/**
 * Tar imot enten en ferdig https-URL (returneres som den er) eller en
 * data-URI, som lagres i det delte KV-et og får en offentlig URL.
 * -> { ok, url } eller { ok:false, error }
 */
export async function offentligMedia(env, kilde) {
  const s = String(kilde || "").trim();
  if (!s) return { ok: false, error: "Tomt media." };
  if (/^https?:\/\//i.test(s)) return { ok: true, url: s };
  if (!/^data:/i.test(s)) return { ok: false, error: "Ukjent mediaformat." };

  const komma = s.indexOf(",");
  if (komma < 0) return { ok: false, error: "Ugyldig data-URI." };
  const hode = s.slice(5, komma);
  const ct = (hode.split(";")[0] || "image/png").toLowerCase();
  if (!/^(image\/(png|jpe?g|webp|gif)|video\/(mp4|quicktime))$/.test(ct)) {
    return { ok: false, error: "Meta tar ikke imot filtypen " + ct + "." };
  }

  let bytes;
  try { bytes = base64TilBytes(s.slice(komma + 1)); }
  catch (e) { return { ok: false, error: "Klarte ikke å lese mediet." }; }
  if (!bytes.length) return { ok: false, error: "Tom mediafil." };
  if (bytes.length > MAKS_MEDIA) {
    return { ok: false, error: "Filen er for stor til å publiseres direkte (over 24 MB). Kort ned videoen, eller publiser den gjennom Blotato." };
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  try {
    await env.ACCOUNTS_KV.put("img:" + id, bytes, {
      metadata: { ct: ct },
      expirationTtl: 60 * 60 * 24 * 30,
    });
  } catch (e) {
    return { ok: false, error: "Klarte ikke å lagre mediet for publisering." };
  }
  return { ok: true, url: MEDIA_VERT + "/api/image?id=" + id };
}

/* ---------------------------------------------------------------------- */
/* Publisering                                                             */
/* ---------------------------------------------------------------------- */

/* Instagram lager mediet i to steg: først en beholder, så publisering.
   Video må bygges ferdig hos Meta før den kan publiseres, så beholderen
   spørres til den er FINISHED. */
async function ventPaBeholder(env, beholderId, token) {
  for (let i = 0; i < 30; i++) {
    const r = await graph(env, "/" + beholderId, { access_token: token, fields: "status_code,status" });
    const kode = r.ok && r.data && r.data.status_code;
    if (kode === "FINISHED") return { ok: true };
    if (kode === "ERROR" || kode === "EXPIRED") {
      return { ok: false, error: (r.data && r.data.status) || "Meta klarte ikke å behandle videoen." };
    }
    await new Promise((r2) => setTimeout(r2, 2000));
  }
  return { ok: false, error: "Meta ble ikke ferdig med videoen i tide. Prøv igjen om et par minutter." };
}

/**
 * Publiser ett innlegg til én tilkoblet konto.
 *   konto: posten fra social:<e-post> (id, token, platform, name)
 *   post:  { text, mediaUrl, erVideo, kind }  kind: post | story | reel
 */
export async function publiserTil(env, konto, post) {
  const tekst = String(post.text || "").trim();
  const media = String(post.mediaUrl || "").trim();
  const kind = post.kind || "post";
  const erVideo = !!post.erVideo;

  if (konto.platform === "instagram") {
    if (!media) {
      return { ok: false, error: "Instagram krever et bilde eller en video." };
    }
    const params = { access_token: konto.token };
    if (erVideo) {
      params.video_url = media;
      params.media_type = kind === "story" ? "STORIES" : "REELS";
    } else {
      params.image_url = media;
      if (kind === "story") params.media_type = "STORIES";
    }
    // Stories tar ikke bildetekst. Alt annet gjør.
    if (kind !== "story" && tekst) params.caption = tekst;

    const boks = await graph(env, "/" + konto.id + "/media", params, "POST");
    if (!boks.ok || !boks.data.id) return { ok: false, error: metaFeil(boks) };

    if (erVideo) {
      const klar = await ventPaBeholder(env, boks.data.id, konto.token);
      if (!klar.ok) return { ok: false, error: klar.error };
    }

    const pub = await graph(env, "/" + konto.id + "/media_publish", {
      access_token: konto.token, creation_id: boks.data.id,
    }, "POST");
    if (!pub.ok) return { ok: false, error: metaFeil(pub) };
    return { ok: true, id: (pub.data && pub.data.id) || "" };
  }

  // Facebook-side.
  if (erVideo && media) {
    const res = await graph(env, "/" + konto.id + "/videos", {
      access_token: konto.token, file_url: media, description: tekst,
    }, "POST");
    if (!res.ok) return { ok: false, error: metaFeil(res) };
    return { ok: true, id: (res.data && res.data.id) || "" };
  }
  const res = media
    ? await graph(env, "/" + konto.id + "/photos", { access_token: konto.token, url: media, caption: tekst }, "POST")
    : await graph(env, "/" + konto.id + "/feed", { access_token: konto.token, message: tekst }, "POST");
  if (!res.ok) return { ok: false, error: metaFeil(res) };
  return { ok: true, id: (res.data && (res.data.post_id || res.data.id)) || "" };
}

/**
 * Legg et innlegg i plattformens egen kø, i stedet for å publisere med én gang.
 *
 * Sosialplanleggeren har allerede en bakgrunnsjobb som går hvert kvarter og
 * publiserer modne innlegg (functions/api/cron/social.js i lme-platform).
 * Den leser `splan:<e-post>:<id>` fra det samme KV-et, så et planlagt innlegg
 * fra Autopilot havner i den køen og går ut av seg selv. Da har vi én kø og
 * én jobb, i stedet for to som kan komme i utakt.
 *
 * Feltnavnene må stemme med det plattformen leser: when, targets, text,
 * imageUrl, videoUrl, kind, status.
 */
export async function planleggTil(env, email, { nar, mal, tekst, mediaUrl, erVideo, kind }) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const post = {
    id: id,
    when: new Date(nar).toISOString(),
    text: tekst || "",
    imageUrl: erVideo ? "" : (mediaUrl || ""),
    videoUrl: erVideo ? (mediaUrl || "") : "",
    kind: kind || "post",
    targets: mal,
    status: "planlagt",
    kilde: "autopilot",
    createdAt: new Date().toISOString(),
  };
  await env.ACCOUNTS_KV.put("splan:" + email + ":" + id, JSON.stringify(post));
  return post;
}

/**
 * Hvem eier tokenet. Samme format som /api/auth lager: base64url(nyttelast).hmac
 * Returnerer e-posten, eller null hvis signaturen ikke stemmer eller tiden er ute.
 */
export async function epostFraToken(env, token) {
  if (!env || !env.AUTH_SECRET || !token) return null;
  try {
    const [nyttelast, sig] = String(token).split(".");
    if (!nyttelast || !sig) return null;
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", enc.encode(env.AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(nyttelast)));
    let bin = ""; for (let i = 0; i < mac.length; i++) bin += String.fromCharCode(mac[i]);
    const ventet = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (sig !== ventet) return null;
    let s = nyttelast.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
    if (o.exp && o.exp < Date.now()) return null;
    return String(o.email || "").trim().toLowerCase() || null;
  } catch (e) { return null; }
}
