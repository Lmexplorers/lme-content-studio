/**
 * LME Autopilot — server-lagring per konto (så arbeidet aldri forsvinner selv om
 * mobilens nettleser tømmer localStorage/IndexedDB).
 *
 * POST /api/store  { action:"load", token, slot }          -> { ok, data }
 * POST /api/store  { action:"save", token, slot, data }    -> { ok }
 *
 * "slot" er f.eks. "settings" (Blotato-nøkkel m.m.) eller "stories" (story-lageret).
 * Krever samme KV-binding og AUTH_SECRET som /api/auth.
 *
 * ==========================================================================
 * HEMMELIGHETER KRYPTERES FØR DE LAGRES
 * ==========================================================================
 * "settings" er ikke vanlige innstillinger. Der ligger kundenes egne
 * API-nøkler: Claude, OpenAI, Gemini og Blotato. En API-nøkkel henger
 * sammen med kundens kort, så den som får tak i den, kan generere for
 * hennes regning.
 *
 * Fram til nå ble hele blokken lagret akkurat slik den kom, i klartekst.
 * Med én bruker (Renate selv) var det én nøkkel. Skal appen selges med
 * "legg inn din egen nøkkel" som en bærende del av produktet, blir det
 * mange kunders nøkler, og da holder ikke klartekst.
 *
 * Nå krypteres verdien med AES-GCM før den legges i KV, og dekrypteres
 * ved henting. Nøkkelen utledes av STORE_SECRET, eller av AUTH_SECRET om
 * den ikke er satt, så oppsettet virker uten nye hemmeligheter i
 * Cloudflare.
 *
 * To ting med vilje:
 *
 *  - BARE slots i HEMMELIGE_SLOTS krypteres. "stories" kan være mange MB,
 *    og base64 gjør en verdi en tredjedel større. Krypterte vi alt, kunne
 *    et stort story-lager sprenge KVs grense på 25 MB og slutte å lagres.
 *  - Gammel klartekst leses fortsatt. Verdier som ligger der fra før har
 *    ikke merket foran seg, og leses som de alltid har blitt. Første gang
 *    kunden lagrer på nytt, skrives de kryptert.
 *
 * Byttes STORE_SECRET/AUTH_SECRET ut, kan gamle verdier ikke låses opp
 * igjen. Da svarer /api/store med en tydelig feil i stedet for tom data,
 * slik at appen ikke tror kontoen er tom og overskriver det som lå der.
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

/* ─────────────────────── Kryptering av hemmeligheter ─────────────────────── */

/* Slots som inneholder kundens egne API-nøkler. Legger du en ny slot som
   bærer noe hemmelig, må den inn her, ellers lagres den i klartekst. */
const HEMMELIGE_SLOTS = ["settings"];

/* Merket foran en kryptert verdi. Uten det er verdien gammel klartekst. */
const KRYPT_MERKE = "lmeenc1:";

function krypteringsHemmelighet(env) {
  return env.STORE_SECRET || secret(env);
}

/* Nøkkelen utledes av hemmeligheten med SHA-256, så den alltid blir de 256
   bitene AES-GCM krever, uansett hvor lang hemmeligheten er. */
async function aesKey(env) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(krypteringsHemmelighet(env)));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function krypter(env, klartekst) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(env);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(klartekst));
  return KRYPT_MERKE + b64url(iv) + "." + b64url(new Uint8Array(ct));
}

async function dekrypter(env, lagret) {
  const kropp = lagret.slice(KRYPT_MERKE.length);
  const punkt = kropp.indexOf(".");
  if (punkt < 0) return null;
  const iv = b64urlDecode(kropp.slice(0, punkt));
  const ct = b64urlDecode(kropp.slice(punkt + 1));
  const key = await aesKey(env);
  try {
    const klar = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return dec.decode(klar);
  } catch (e) {
    /* Feil hemmelighet, eller verdien er tuklet med. Begge deler skal
       behandles likt: vi later ikke som om det gikk bra. */
    return null;
  }
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

  const hemmelig = HEMMELIGE_SLOTS.indexOf(slot) !== -1;

  if (body.action === "load") {
    const raw = await env.ACCOUNTS_KV.get(key);
    let tekst = raw;
    if (raw && raw.slice(0, KRYPT_MERKE.length) === KRYPT_MERKE) {
      tekst = await dekrypter(env, raw);
      if (tekst === null) {
        /* Kunne ikke låses opp. Si det rett ut i stedet for å svare med
           tom data: appen fyller tomme felter fra serveren, og en falsk
           "ingenting her" ville fått den til å skrive over det som ligger. */
        return json({ error: "dekryptering_feilet", detail: "Innstillingene kunne ikke låses opp. Er STORE_SECRET eller AUTH_SECRET endret?" }, 200);
      }
    }
    let data = null;
    if (tekst) { try { data = JSON.parse(tekst); } catch (e) { data = null; } }
    return json({ ok: true, data });
  }

  if (body.action === "save") {
    const payload = JSON.stringify(body.data === undefined ? null : body.data);
    /* KV tåler opptil 25 MB per verdi. Krypterte verdier vokser med rundt en
       tredjedel av base64, så taket settes lavere for dem, ellers ville en
       verdi som så grei ut bli avvist av KV etterpå. */
    const tak = hemmelig ? 17 * 1024 * 1024 : 24 * 1024 * 1024;
    if (payload.length > tak) return json({ error: "too_large", detail: "Lageret er for stort til å lagres på serveren." }, 200);
    let lagres = payload;
    if (hemmelig) {
      try { lagres = await krypter(env, payload); }
      catch (e) { return json({ error: "kryptering_feilet", detail: String((e && e.message) || e) }, 200); }
    }
    try { await env.ACCOUNTS_KV.put(key, lagres); }
    catch (e) { return json({ error: String((e && e.message) || e) }, 200); }
    return json({ ok: true });
  }

  return json({ error: "ukjent action" }, 400);
}
