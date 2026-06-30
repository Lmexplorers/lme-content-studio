// Henter de tilkoblede Blotato-kontoene (Instagram, Facebook, TikTok, Bluesky osv.)
// slik at brukeren kan velge profil i stedet for å lete etter konto-ID-er.
const BLOTATO = "https://backend.blotato.com/v2";
function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export async function onRequestPost(context) {
  const { request } = context;
  let b = {};
  try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const key = b.blotatoKey;
  if (!key) return json({ error: "Mangler Blotato-nøkkel. Legg den inn i Innstillinger." }, 200);
  try {
    const r = await fetch(BLOTATO + "/users/me/accounts", {
      headers: { "blotato-api-key": key },
    });
    let data = null;
    try { data = await r.json(); } catch (e) { data = { raw: await r.text().catch(() => "") }; }
    if (!r.ok) return json({ error: "Kunne ikke hente kontoer fra Blotato.", status: r.status, detail: data }, 200);
    // Normaliser: Blotato kan returnere {items:[...]} eller en liste direkte.
    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data && Array.isArray(data.items)) items = data.items;
    else if (data && Array.isArray(data.accounts)) items = data.accounts;
    else if (data && Array.isArray(data.data)) items = data.data;
    const accounts = items.map((a) => ({
      id: a.id || a.accountId || a.account_id || "",
      platform: a.platform || a.targetType || a.target || "",
      name: a.username || a.fullname || a.fullName || a.name || a.handle || "",
    })).filter((a) => a.id);
    return json({ ok: true, accounts, raw: accounts.length ? undefined : data });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}
