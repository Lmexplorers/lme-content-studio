/**
 * LME Autopilot — Stripe webhook: fyller pa kreditter automatisk ved betaling.
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
 * Planen kjennes igjen pa `tier` i Stripe-metadata, med belopet bare som reserve
 * for gamle abonnementer som ble opprettet for tier ble satt.
 *
 * VIKTIG: kredittene defineres IKKE her. De er de samme som PLAN_CAPS i
 * functions/api/generate.js, og det er den ene kilden. For hadde begge filene
 * egne tall: generate.js sa 100 bilder og 5 video, webhooken sa 200 bilder og 12
 * video. Webhooken kjorte sist ved kjop, sa den skrev over de riktige tallene.
 * Skal en kvote endres, endre PLAN_CAPS, ikke denne filen.
 */

// Samme tall som PLAN_CAPS i generate.js. Video er 0 fordi den aldri folger med i
// en plan, kunden bruker egen nokkel eller kjoper kreditt.
const PLAN_CREDITS = {
  start:     { image: 100, video: 0 },
  proff:     { image: 100, video: 0 },
  proffplus: { image: 100, video: 0 },
  arlig:     { image: 100, video: 0 },
  app:       { image: 100, video: 0 },
};

// Reserve for abonnementer uten `tier`: bare planNAVN, aldri egne kredittall.
const PLAN_BY_AMOUNT = {
  29900:  "start",
  49900:  "proff",
  69900:  "proffplus",
  699000: "arlig",
};

/** Finn planen: tier forst, belop som reserve. */
function resolvePlan(obj, amount) {
  const meta = (obj && obj.metadata) || {};
  const sub = (obj && obj.subscription_details && obj.subscription_details.metadata) || {};
  const tier = String(meta.tier || meta.plan || sub.tier || sub.plan || "").toLowerCase();
  if (tier && PLAN_CREDITS[tier]) return tier;
  return PLAN_BY_AMOUNT[amount] || null;
}

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

async function grantCredits(env, email, plan, source) {
  const credits = PLAN_CREDITS[plan];
  if (!credits) return;
  email = String(email || "").trim().toLowerCase();
  if (!email) return;
  const raw = await env.ACCOUNTS_KV.get("user:" + email);
  let user = null;
  if (raw) { try { user = JSON.parse(raw); } catch (e) {} }
  if (!user) user = { email, createdAt: Date.now() };
  user.plan = plan;
  user.credits = { image: credits.image, video: credits.video };
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

  const plan = resolvePlan(obj, amount);
  if (email && plan) {
    await grantCredits(env, email, plan, event.type);
  } else {
    // Gikk en betaling gjennom uten at vi fant planen, star kunden uten
    // kreditter. For svarte vi bare "ok" og ingen fikk vite det.
    console.error("stripe-webhook: fant ingen plan", {
      event: event.type, amount, harEpost: !!email,
      tier: (obj && obj.metadata && obj.metadata.tier) || null,
    });
  }
  return new Response("ok", { status: 200 });
}
