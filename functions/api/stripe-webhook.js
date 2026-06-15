/**
 * LME Content Studio — Stripe webhook: fyller pa kreditter automatisk ved betaling.
 *
 * Stripe sender hit ved betaling/fornyelse. Vi bekrefter signaturen (STRIPE_WEBHOOK_SECRET),
 * finner kundens e-post og hvilken plan de betalte for (utfra belopet), og setter
 * manedens kreditter (bilder + video) pa kontoen i ACCOUNTS_KV.
 *
 * Oppsett (i Stripe + Cloudflare):
 *  1. Stripe Dashboard -> Developers -> Webhooks -> Add endpoint:
 *     URL = https://<studio-domenet>/api/stripe-webhook
 *     Hendelser: checkout.session.completed, invoice.paid
 *  2. Kopier "Signing secret" (whsec_...) og legg inn som STRIPE_WEBHOOK_SECRET i Cloudflare.
 *
 * Planer kjennes igjen pa belopet (i ore). Endre tallene her for a justere kreditter.
 */

const PLAN_BY_AMOUNT = {
  29900:  { plan: "start",     image: 0,   video: 0 },   // Start 299 kr
  49900:  { plan: "proff",     image: 100, video: 6 },   // Proff 499 kr
  69900:  { plan: "proffplus", image: 200, video: 12 },  // Proff + Fellesskap 699 kr
  699000: { plan: "arlig",     image: 250, video: 15 },  // Arlig 6 990 kr
};

const enc = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Bekreft Stripe-signaturen pa raden ("t=...,v1=...")
async function verifyStripe(secret, payload, sigHeader) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = await hmacHex(secret, `${parts.t}.${payload}`);
  return timingSafeEqual(expected, parts.v1);
}

async function grantCredits(env, email, planInfo, source) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return;
  const raw = await env.ACCOUNTS_KV.get("user:" + email);
  let user = null;
  if (raw) { try { user = JSON.parse(raw); } catch (e) {} }
  if (!user) user = { email, createdAt: Date.now() };
  user.plan = planInfo.plan;
  user.credits = { image: planInfo.image, video: planInfo.video };
  user.lastPayment = { at: Date.now(), source };
  await env.ACCOUNTS_KV.put("user:" + email, JSON.stringify(user));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ACCOUNTS_KV) return new Response("KV mangler", { status: 200 });

  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");

  // Bekreft signatur hvis hemmeligheten er satt (ellers avvis, sa ingen kan jukse)
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("STRIPE_WEBHOOK_SECRET mangler", { status: 200 });
  if (!(await verifyStripe(env.STRIPE_WEBHOOK_SECRET, payload, sig))) {
    return new Response("ugyldig signatur", { status: 400 });
  }

  let event;
  try { event = JSON.parse(payload); } catch (e) { return new Response("bad json", { status: 400 }); }
  const obj = event.data && event.data.object ? event.data.object : {};

  let email = null, amount = null;
  if (event.type === "checkout.session.completed") {
    email = (obj.customer_details && obj.customer_details.email) || obj.customer_email;
    amount = obj.amount_total;
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    email = obj.customer_email || (obj.customer_details && obj.customer_details.email);
    amount = obj.amount_paid != null ? obj.amount_paid : obj.amount_due;
  } else {
    return new Response("ignored", { status: 200 }); // andre hendelser bryr vi oss ikke om
  }

  const planInfo = PLAN_BY_AMOUNT[amount];
  if (email && planInfo) {
    await grantCredits(env, email, planInfo, event.type);
  }
  return new Response("ok", { status: 200 });
}
