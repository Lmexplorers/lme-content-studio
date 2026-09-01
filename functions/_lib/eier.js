/**
 * Hvem er eieren, ett sted.
 *
 * HVORFOR DENNE FILEN FINNES
 * Lista lå i tre kopier, i auth.js, generate.js og publish.js, og alle tre
 * kjente bare én adresse: renateshobby@hotmail.com. Renate var logget inn i
 * appen som renate@lmexplorers.com, og ble derfor behandlet som en vanlig
 * gratisbruker: null bilder, null video, generering stengt. Det bryter
 * regelen i CLAUDE.md om at eieren aldri skal betale for, eller stenges ute
 * fra, sitt eget produkt.
 *
 * Adressene er de samme fem som plattformen bruker i
 * `functions/_lib/access.js` (OWNER_EMAILS) i lme-platform. Legges en ny til
 * der, legges den til her.
 */

export const OWNER_EMAILS = [
  "renate@lmexplorers.com",
  "hei@lmexplorers.com",
  "hello@lmexplorers.com",
  "support@lmexplorers.com",
  "renateshobby@hotmail.com",
];

/**
 * Er denne e-posten eierens?
 * `env.OWNER_EMAIL` godtas i tillegg, ikke i stedet, slik at en adresse kan
 * legges til fra Cloudflare uten ny utrulling.
 */
export function erEierEpost(epost, env) {
  const e = String(epost || "").trim().toLowerCase();
  if (!e) return false;
  if (OWNER_EMAILS.includes(e)) return true;
  const fraMiljo = String((env && env.OWNER_EMAIL) || "").trim().toLowerCase();
  return !!fraMiljo && e === fraMiljo;
}
