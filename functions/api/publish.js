/**
 * LME Content Studio — autoposting via Blotato.
 *
 * Kontrollerbar publiserings-motor (erstatter den gamle SocialBu-proxyen).
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

const BLOTATO = "https://backend.blotato.com/v2";

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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

export async function onRequestPost(context) {
  const { request } = context;
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

  const key = b.blotatoKey;
  if (!key) return json({ error: "Mangler Blotato-nokkel. Legg den inn i Innstillinger." }, 200);
  if (!b.accountId) return json({ error: "Mangler konto. Velg hvilken profil du vil poste til." }, 200);

  try {
    // 1) Last opp hver media-kilde til Blotato (returnerer Blotato-hostet URL)
    const mediaUrls = [];
    for (const src of (b.mediaUrls || [])) {
      if (!src) continue;
      const up = await blotato("/media", key, { url: src });
      if (!up.ok) {
        return json({ error: "Opplasting til Blotato feilet.", step: "media", status: up.status, detail: up.data }, 200);
      }
      const hosted = up.data && (up.data.url || up.data.mediaUrl || (up.data.media && up.data.media.url));
      if (!hosted) return json({ error: "Fant ingen media-URL i Blotato-svaret.", step: "media", detail: up.data }, 200);
      mediaUrls.push(hosted);
    }

    // 2) Publiser posten
    const post = {
      accountId: String(b.accountId),
      target: Object.assign({ targetType: b.targetType || "instagram" }, b.target || {}),
      content: {
        text: b.text || "",
        platform: b.targetType || "instagram",
        mediaUrls,
      },
    };
    const payload = { post };
    if (b.scheduledTime) payload.scheduledTime = b.scheduledTime;

    const pub = await blotato("/posts", key, payload);
    if (!pub.ok) {
      return json({ error: "Publisering feilet.", step: "post", status: pub.status, detail: pub.data, sent: payload }, 200);
    }
    return json({ ok: true, blotato: pub.data });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}
