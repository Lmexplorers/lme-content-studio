/**
 * LME Autopilot — hvilke Instagram- og Facebook-kontoer har kunden koblet
 * til gjennom LME?
 *
 * POST /api/lme-accounts  { token }
 *   -> { ok, koblet, accounts: [{ id, platform, name, picture, src:"lme" }],
 *        koblingsUrl }
 *
 * Kontoene kobles til én gang på lmexplorers.com/planlegger, og
 * tilgangsnøklene ligger i det delte KV-et. Nøklene forlater aldri serveren:
 * det som sendes ut herfra er bare navn og id.
 */
import { lesKobling, offentligeKontoer, epostFraToken } from "../_lib/meta-publish.js";

const KOBLE_URL = "https://lmexplorers.com/planlegger";

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: "bad_json" }, 400); }

  if (!env || !env.ACCOUNTS_KV) return json({ ok: true, koblet: false, accounts: [], koblingsUrl: KOBLE_URL });

  const email = await epostFraToken(env, b.token);
  if (!email) {
    return json({ ok: false, code: "login_required", error: "Logg inn for å hente kontoene dine.", koblingsUrl: KOBLE_URL }, 200);
  }

  const kobling = await lesKobling(env, email);
  const kontoer = offentligeKontoer(kobling);
  return json({ ok: true, koblet: kontoer.length > 0, accounts: kontoer, koblingsUrl: KOBLE_URL });
}
