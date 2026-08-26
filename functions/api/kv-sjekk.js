/**
 * LME Autopilot, sjekk av hvilket KV-lager appen er koblet til.
 *
 * HVORFOR DENNE FILEN FINNES
 *
 * Det finnes to KV-lagre paa Cloudflare-kontoen: `lme-cs-accounts` og
 * `lme-builder`. Betalingswebhooken i lme-platform skriver abonnementet til
 * sin egen binding (BUILDER_KV). Denne appen leser ACCOUNTS_KV. Peker de to
 * bindingene paa hvert sitt lager, ser appen aldri abonnementet, og en kunde
 * som nettopp har betalt faar null bilder.
 *
 * Bindingene ligger i Cloudflare-dashbordet, ikke i repoet, og Pages-prosjekter
 * dukker ikke opp i Workers-API-et. Derfor spoer vi appen selv: den lister
 * noekler i sitt eget lager og ser etter noekler bare plattformen skriver.
 *
 * Aapne https://lme-contentstudio.pages.dev/api/kv-sjekk
 *
 * PERSONVERN: svaret inneholder aldri en hel noekkel. Noekler ser ut som
 * `user:navn@eksempel.no`, altsaa e-postadresser. Bare prefikset foer kolon
 * og et antall gaar ut.
 */

/* Prefikser bare plattformen (lme-builder) skriver. Finner appen en av disse
   i sitt eget lager, deler de to lager, og koblingen virker. */
const PLATTFORM_PREFIKS = [
  "nl",        // nyhetsbrev-abonnenter, functions/_lib/newsletter.js
  "member",    // medlemskap og Autopilot-abonnement, grantAutopilot
  "scust",     // Stripe-kunde til e-post
  "credit",    // kjopt kreditt
  "content",   // rediger tekst paa siden
  "course",    // kursinnhold
  "kurs",      // kursbyggeren
  "gruppe",    // gruppebyggeren
];

/* Prefikser appen selv skriver. Disse alene sier ingenting, siden appen
   skriver dem uansett hvilket lager den er koblet til. */
const APP_PREFIKS = ["user", "code", "store"];

function side(tittel, farge, avsnitt, tabell) {
  const rader = tabell
    .map((r) => `<tr><td>${r[0]}</td><td style="text-align:right">${r[1]}</td></tr>`)
    .join("");
  return new Response(
    `<!DOCTYPE html><html lang="no"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>KV-sjekk, LME Autopilot</title>
<style>
body{font-family:system-ui,sans-serif;line-height:1.7;color:#1A1A1A;background:#FFFAFA;padding:28px 18px 60px;}
.wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:18px;padding:30px 26px;box-shadow:0 10px 40px rgba(200,24,96,.10);}
h1{font-size:22px;color:${farge};margin-bottom:14px;}
p{margin-bottom:14px;font-size:15px;}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px;}
td{padding:7px 4px;border-bottom:1px solid #F0D9E4;}
.liten{font-size:13px;color:#6B6470;margin-top:20px;}
</style></head><body><div class="wrap">
<h1>${tittel}</h1>${avsnitt}
${rader ? `<table>${rader}</table>` : ""}
<p class="liten">Denne siden viser bare prefikset foer kolon og et antall. Hele noekler, som inneholder e-postadresser, kommer aldri ut herfra.</p>
</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.ACCOUNTS_KV) {
    return side(
      "ACCOUNTS_KV er ikke bundet",
      "#C0392B",
      "<p>Appen har ingen KV-binding i det hele tatt. Da virker verken innlogging, lagring eller abonnement. Dette maa fikses i Cloudflare, under Pages, lme-contentstudio, Settings, Bindings.</p>",
      []
    );
  }

  /* Tell noekler per prefiks. Listen er paginert, og vi stopper etter et par
     tusen: vi trenger bare aa vite HVA slags noekler som finnes, ikke alle. */
  const antall = {};
  let totalt = 0;
  let cursor;
  let runder = 0;
  try {
    do {
      const side_ = await env.ACCOUNTS_KV.list({ limit: 1000, cursor });
      for (const n of side_.keys) {
        const i = n.name.indexOf(":");
        const p = i > 0 ? n.name.slice(0, i) : "(uten prefiks)";
        antall[p] = (antall[p] || 0) + 1;
        totalt++;
      }
      cursor = side_.list_complete ? null : side_.cursor;
      runder++;
    } while (cursor && runder < 3);
  } catch (e) {
    return side("Kunne ikke lese lageret", "#C0392B",
      `<p>Feil ved lesing: ${String((e && e.message) || e)}</p>`, []);
  }

  const funnet = Object.keys(antall).sort((a, b) => antall[b] - antall[a]);
  const tabell = funnet.map((p) => [p + ":", antall[p]]);
  const plattform = funnet.filter((p) => PLATTFORM_PREFIKS.includes(p));
  const app = funnet.filter((p) => APP_PREFIKS.includes(p));

  if (plattform.length) {
    return side(
      "Alt henger sammen",
      "#2E7D32",
      `<p>Appen leser <strong>samme lager</strong> som betalingswebhooken skriver til. Da faar en kunde som betaler bildene sine med en gang.</p>
       <p>Jeg ser noekler bare plattformen lager: <strong>${plattform.map((p) => p + ":").join(", ")}</strong>. Det kan bare bety at ACCOUNTS_KV og BUILDER_KV peker paa det samme lageret (lme-builder).</p>
       <p>Ingenting maa gjoeres. Si fra til meg, saa fjerner jeg denne siden.</p>`,
      tabell
    );
  }

  if (totalt === 0) {
    return side(
      "Lageret er tomt, saa jeg kan ikke avgjoere",
      "#B8860B",
      `<p>Det ligger ingen noekler her enda, og da finnes det ingenting aa kjenne igjen. Logg inn i appen én gang, saa lages det en konto, og aapne denne siden paa nytt.</p>`,
      tabell
    );
  }

  return side(
    "To forskjellige lagre",
    "#C0392B",
    `<p>Appen leser et <strong>annet lager</strong> enn betalingswebhooken skriver til. Da ser appen aldri abonnementet, og en kunde som betaler faar null bilder.</p>
     <p>Jeg finner ${totalt} noekler, og bare appens egne typer${app.length ? " (" + app.map((p) => p + ":").join(", ") + ")" : ""}. Ingen av noeklene plattformen lager er her.</p>
     <p><strong>Fiksen:</strong> i Cloudflare, under Pages, lme-contentstudio, Settings, Bindings, settes ACCOUNTS_KV til lageret <strong>lme-builder</strong>. Send meg beskjed naar det er gjort, saa sjekker vi paa nytt.</p>`,
    tabell
  );
}
