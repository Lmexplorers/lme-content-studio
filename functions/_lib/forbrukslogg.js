/**
 * LME Autopilot — forbrukslogg, samme linje som resten av plattformen.
 *
 * HVORFOR
 * Autopilot kjører som sitt eget Cloudflare-prosjekt, og var derfor den ene
 * appen som IKKE dukket opp på /ai-kostnader. Det var nettopp det Renate
 * hadde bygget kredittregistreringen for: å se hva kundene koster henne.
 * Med mange kunder er det uholdbart å ikke se det.
 *
 * HVORDAN
 * Appen og plattformen deler KV-navnerom (ACCOUNTS_KV her er det samme som
 * BUILDER_KV der), så vi skriver rett inn i den samme loggen. Nøkkelformat
 * og metadata må stemme nøyaktig med lme-platform sin
 * functions/_lib/ai-core/usage.js, ellers leser ikke /ai-kostnader linjene.
 *
 * HVA VI LOGGER
 * Bare kall som går på LMEs EGEN nøkkel. Det er de som koster Renate penger.
 * Bruker kunden sin egen nøkkel, betaler hun AI-en direkte, og linja hører
 * ikke hjemme i Renates kostnadsoversikt.
 *
 * TO REGLER SOM ALDRI BRYTES (de samme som på plattformen)
 * 1. Loggingen kan ALDRI velte en generering. Alt er pakket i try/catch.
 * 2. Logg ETTER at resultatet er sikret, aldri før.
 */

const PREFIX = "ai:usage:";
const TTL = 60 * 60 * 24 * 400; // 400 dager, samme som plattformen

/* Prisene som trengs for de modellene Autopilot faktisk kaller.
 *
 * Fasiten ligger i lme-platform sin functions/_lib/ai-core/registry.js, og
 * tallene under er kopiert derfra. Endres en pris der, endres den her.
 * Modeller vi ikke har pris på gir null, som betyr "vet ikke", ikke
 * "gratis". /ai-kostnader teller dem for seg under "Uten kjent pris", så en
 * ukjent modell blir synlig i stedet for å bli borte i regnestykket. */
const PRISER = {
  "dall-e-3":                 { leverandor: "openai",    enhet: "image",  perStk: 0.04 },
  "gpt-image-1":              { leverandor: "openai",    enhet: "image",  perStk: 0.08 },
  "gemini-2.5-flash-image":   { leverandor: "gemini",    enhet: "image",  perStk: 0.04 },
  // Prisen på Gemini 3 Pro Image er ikke bekreftet, derfor ingen perStk.
  "gemini-3-pro-image-preview": { leverandor: "gemini",  enhet: "image",  perStk: null },
  "claude-opus-5":            { leverandor: "anthropic", enhet: "tokens", innPerM: 5.0, utPerM: 25.0 },
  "claude-sonnet-5":          { leverandor: "anthropic", enhet: "tokens", innPerM: 2.0, utPerM: 10.0 },
  // Modellen appen kaller i dag. Prisen er ikke bekreftet av Renate, så den
  // står uten tall og vises som ukjent pris i stedet for et gjettet beløp.
  "claude-sonnet-4-6":        { leverandor: "anthropic", enhet: "tokens", innPerM: null, utPerM: null },
  "gpt-4o-mini":              { leverandor: "openai",    enhet: "tokens", innPerM: 0.15, utPerM: 0.6 },
};

function rund6(n) { return Math.round(n * 1e6) / 1e6; }

function kostnad(modelId, enheter) {
  const p = PRISER[modelId];
  if (!p) return null;
  const u = enheter || {};
  if (p.enhet === "image") {
    if (p.perStk == null) return null;
    return rund6((Number(u.images) || 1) * p.perStk);
  }
  if (p.enhet === "tokens") {
    if (p.innPerM == null || p.utPerM == null) return null;
    return rund6(((Number(u.inputTokens) || 0) / 1e6) * p.innPerM +
                 ((Number(u.outputTokens) || 0) / 1e6) * p.utPerM);
  }
  return null;
}

function kutt(s, n) {
  const v = String(s == null ? "" : s);
  return v.length > n ? v.slice(0, n) : v;
}

function maned(d) {
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

/**
 * Logg ett AI-kall som gikk på LMEs egen nøkkel.
 *
 *   await loggForbruk(env, {
 *     task: "image",                 // image | text
 *     modelId: "dall-e-3",
 *     email: "kunde@example.com",    // hvem som genererte
 *     units: { images: 1 },          // eller { inputTokens, outputTokens }
 *     status: "ok",                  // "ok" | "error"
 *     ms: 2400,
 *     note: "",                      // valgfritt
 *   });
 */
export async function loggForbruk(env, oppf) {
  try {
    if (!env || !env.ACCOUNTS_KV || !oppf) return;

    const na = new Date();
    const modelId = oppf.modelId || "";
    const pris = PRISER[modelId];
    const enheter = oppf.units || {};
    const c = oppf.status === "error" ? 0 : kostnad(modelId, enheter);

    const meta = {
      a: "autopilot",
      t: kutt(oppf.task, 16),
      p: pris ? pris.leverandor : "ukjent",
      m: kutt(modelId, 48),
      u: kutt(oppf.email, 64),
      c: c == null ? null : c,
      s: oppf.status === "error" ? "error" : "ok",
      d: Math.max(0, Math.round(Number(oppf.ms) || 0)),
      ts: na.toISOString(),
    };

    const full = {
      ...meta,
      units: enheter,
      error: kutt(oppf.error, 200),
      note: kutt(oppf.note, 200),
      unknownModel: !pris,
    };

    const nokkel = PREFIX + maned(na) + ":" + na.getTime() + "-" +
                   Math.random().toString(36).slice(2, 10);
    await env.ACCOUNTS_KV.put(nokkel, JSON.stringify(full), {
      expirationTtl: TTL,
      metadata: meta,
    });
  } catch (e) {
    // Med vilje stille. En mislykket logg skal aldri koste kunden bildet sitt.
  }
}
