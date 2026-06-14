/**
 * LME Content Studio — generering via Cloudflare (proxy).
 * Unngår CORS ("Failed to fetch") og kan skjule nøkler.
 *
 * POST /api/generate
 *  Bilde: { type:"image", model:"dalle3"|"nano"|"nano-pro", key?, prompt, size?, aspectRatio? }
 *         -> { imageUrl: "data:image/...;base64,..." }
 *  Tekst: { type:"text", provider:"claude"|"openai", key?, prompt, model?, max_tokens? }
 *         -> { text: "..." }
 *
 * Nøkkel hentes fra Cloudflare-hemmelighet hvis satt (OPENAI_API_KEY / GEMINI_API_KEY /
 * ANTHROPIC_API_KEY), ellers fra request-body (BYO-nøkkel fra appen).
 */

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const type = body.type;

  try {
    if (type === "image") {
      const model = body.model || "dalle3";
      if (model === "dalle3") {
        const key = env.OPENAI_API_KEY || body.key;
        if (!key) return json({ error: "OpenAI-nøkkel mangler. Legg den inn i Innstillinger." }, 400);
        const r = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({ model: "dall-e-3", prompt: body.prompt, n: 1, size: body.size || "1024x1024", quality: "standard" }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("OpenAI " + r.status) }, 200);
        const item = d.data && d.data[0];
        if (item && item.b64_json) return json({ imageUrl: "data:image/png;base64," + item.b64_json });
        if (item && item.url) {
          try {
            const ir = await fetch(item.url);
            const buf = await ir.arrayBuffer();
            return json({ imageUrl: "data:image/png;base64," + bufToB64(buf) });
          } catch (e) {
            return json({ imageUrl: item.url });
          }
        }
        return json({ error: "Ingen bilde i svaret" }, 200);
      } else {
        const key = env.GEMINI_API_KEY || body.key;
        if (!key) return json({ error: "Gemini-nøkkel mangler. Legg den inn i Innstillinger." }, 400);
        const gModel = model === "nano-pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + gModel + ":generateContent", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ parts: [{ text: body.prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: body.aspectRatio || "1:1" } } }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("Gemini " + r.status) }, 200);
        const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
        const ip = parts.find((p) => p.inlineData || p.inline_data);
        const inl = ip && (ip.inlineData || ip.inline_data);
        if (!inl || !inl.data) return json({ error: "Ingen bilde i svaret" }, 200);
        return json({ imageUrl: "data:" + (inl.mimeType || inl.mime_type || "image/png") + ";base64," + inl.data });
      }
    }

    if (type === "text") {
      const provider = body.provider || "claude";
      if (provider === "openai") {
        const key = env.OPENAI_API_KEY || body.key;
        if (!key) return json({ error: "OpenAI-nøkkel mangler." }, 400);
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({ model: body.model || "gpt-4o", max_tokens: body.max_tokens || 1500, messages: [{ role: "user", content: body.prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("OpenAI " + r.status) }, 200);
        return json({ text: (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "" });
      } else {
        const key = env.ANTHROPIC_API_KEY || body.key;
        if (!key) return json({ error: "Claude-nøkkel mangler." }, 400);
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: body.model || "claude-sonnet-4-20250514", max_tokens: body.max_tokens || 1500, messages: [{ role: "user", content: body.prompt }] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ error: (d.error && d.error.message) || ("Claude " + r.status) }, 200);
        return json({ text: (d.content && d.content.map((b) => b.text || "").join("")) || "" });
      }
    }

    return json({ error: "ukjent type" }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 200);
  }
}
