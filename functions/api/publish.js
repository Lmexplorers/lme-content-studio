/**
 * LME Autopilot — autoposting via Blotato.
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

  // Bygg konto-liste. Ny vei: b.accounts = [{id, platform}] (flervalg).
  // Bakoverkomp.: enkelt b.accountId + b.targetType.
  let accounts = Array.isArray(b.accounts)
    ? b.accounts.filter((a) => a && a.id).map((a) => ({ id: String(a.id), platform: a.platform || a.targetType || b.targetType || "instagram" }))
    : [];
  if (!accounts.length && b.accountId) accounts = [{ id: String(b.accountId), platform: b.targetType || "instagram" }];
  if (!accounts.length) return json({ error: "Mangler konto. Velg minst en profil du vil poste til." }, 200);

  const contentKind = b.contentKind || ""; // 'story' | 'reel' | 'post'

  try {
    // 1) Last opp hver media-kilde til Blotato EN gang (gjenbrukes for alle kontoer).
    // Blotato tar imot både offentlige URL-er og base64/data-URI-er (opp til 200 MB).
    const mediaUrls = [];
    for (const src of (b.mediaUrls || [])) {
      if (!src) continue;
      const mediaBody = { url: src };
      if (/^data:/.test(src) && b.mediaName) mediaBody.filename = b.mediaName;
      const up = await blotato("/media", key, mediaBody);
      if (!up.ok) {
        return json({ error: "Opplasting til Blotato feilet.", step: "media", status: up.status, detail: up.data }, 200);
      }
      const hosted = up.data && (up.data.url || up.data.mediaUrl || (up.data.media && up.data.media.url));
      if (!hosted) return json({ error: "Fant ingen media-URL i Blotato-svaret.", step: "media", detail: up.data }, 200);
      mediaUrls.push(hosted);
    }

    // 2) Publiser til hver valgt konto.
    const results = [];
    for (const acc of accounts) {
      const plat = acc.platform || "instagram";
      const target = { targetType: plat };
      // mediaType (story/reel) gjelder kun Instagram og Facebook.
      if ((plat === "instagram" || plat === "facebook") && (contentKind === "story" || contentKind === "reel")) target.mediaType = contentKind;
      if (b.target && typeof b.target === "object") Object.assign(target, b.target);
      const post = {
        accountId: String(acc.id),
        target,
        content: { text: b.text || "", platform: plat, mediaUrls },
      };
      const payload = { post };
      if (b.scheduledTime) payload.scheduledTime = b.scheduledTime;

      const pub = await blotato("/posts", key, payload);
      results.push({
        accountId: acc.id,
        platform: plat,
        ok: pub.ok,
        status: pub.status,
        error: pub.ok ? undefined : ((pub.data && (pub.data.message || pub.data.error)) || ("status " + pub.status)),
        data: pub.ok ? pub.data : undefined,
      });
    }

    const okCount = results.filter((r) => r.ok).length;
    if (okCount === results.length) return json({ ok: true, results });
    // Delvis eller full feil: gi tydelig, menneskelig oppsummering.
    const failed = results.filter((r) => !r.ok).map((r) => (r.platform || r.accountId) + (r.error ? " (" + r.error + ")" : "")).join(", ");
    const msg = okCount > 0
      ? "Sendt til " + okCount + " av " + results.length + ". Feilet: " + failed
      : "Publisering feilet for alle. " + failed;
    return json({ ok: false, error: msg, okCount, total: results.length, results }, 200);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}
