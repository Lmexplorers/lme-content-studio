/**
 * TOM MED VILJE. Denne appen har ingen Stripe-webhook.
 *
 * Her lå det en egen webhook med sin egen tabell over hvilket beløp som
 * tilsvarte hvilken plan (299, 499 og 699 kroner). Den var aldri registrert
 * i Stripe, så den kjørte aldri, men den var et annet svar på det samme
 * spørsmålet som resten av systemet svarer på, og beløpene stemte ikke med
 * prisene som faktisk selges (199, 549 og 999). To steder som kan si hver
 * sin ting er nettopp slikt som skaper feil senere, så innholdet er tatt bort.
 *
 * Verifisert mot Stripe sin liste over webhook-endepunkter 5. september
 * 2026: bare to endepunkter mottar hendelser, og ingen av dem peker hit.
 *   1. lmexplorers.com/api/oppskrift-webhook
 *   2. lme-inner-circle.lmexplorers.workers.dev/webhook/stripe
 *
 * Hvilken plan en kunde har avgjøres ett sted: betalingslenken kunden
 * brukte, slått opp i lme-platform sin functions/_lib/purchase-links.js.
 * Den skriver cs-start, cs-proff eller cs-pluss på kontoen. Kvotene som
 * hører til står i PLAN_CAPS i functions/api/generate.js her i appen.
 *
 * Skal noe endres om planer eller kvoter, endre de to stedene over.
 * Ikke bygg en ny webhook her.
 *
 * Renate 5. september 2026.
 */
export async function onRequest() {
  return new Response(
    JSON.stringify({
      error:
        "Denne appen har ingen Stripe-webhook. Betalinger håndteres av lmexplorers.com/api/oppskrift-webhook og Inner Circle-workeren.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}
