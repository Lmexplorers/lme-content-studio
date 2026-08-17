/* ============================================================
   LME AI BRAIN — Shared Cloudflare Worker
   ------------------------------------------------------------
   ONE Worker, ONE endpoint, used by EVERY LME app:
     - LME Studio          (book & materials builder)
     - LME Content Studio  (Autopilot — social content, any niche)
     - Future LME apps

   Endpoint:  POST /api/ai
   Providers: mock | openai | anthropic
   Secrets:   OPENAI_API_KEY, ANTHROPIC_API_KEY

   Apps identify themselves with `appId` in the payload so the
   Worker can log usage per app and (later) gate features per app.

   Deploy as a SEPARATE Worker from the SocialBu proxy so any
   issue here cannot affect content posting.

   ------------------------------------------------------------
   NISJE-REGEL (viktig — dette var kilden til "Montessori-lekkasjen")
   ------------------------------------------------------------
   Autopilot brukes av mange nisjer (Etsy, kafe, coach, eiendom,
   frisør, SaaS, ...). Montessori og Mia & Teo er BARE EN av dem.

   Derfor er identiteten delt i to:
     CORE_IDENTITY   — alltid med, helt nisjenøytral
     MIA_TEO_MODULE  — legges KUN på når prosjektet faktisk er
                       Montessori / Mia & Teo

   Regelen speiler frontend (`_isMontessoriNiche()` i no.html):
   den frie nisje-teksten er alltid fasit. Karaktervalget brukes
   bare som reserve når nisjefeltet er helt tomt — ellers henger
   et gammelt "Mia & Teo"-valg igjen og drar Montessori inn i
   innhold for en helt annen bransje.
   ============================================================ */

// ============================================================
// SHARED IDENTITY — niche-neutral, used for every task and app
// ============================================================
const CORE_IDENTITY = `You are Nathalie AI, a warm, precise, practical content and production assistant inside LME Studio apps.

You help the user create content, materials, products and campaigns for THEIR brand and THEIR niche — whatever that niche happens to be. You have no niche of your own.

Always use the active Project Brain as context when provided. Be concrete and production-focused.

BRAND RULE (highest priority):
- The brand, niche, voice, audience and characters in the Project Brain define the subject matter. Follow them exactly.
- Never import a niche, pedagogy, product line or cast of characters that the Project Brain does not mention. If the niche is a coffee shop, write about the coffee shop.
- If the Project Brain is empty or the niche is unclear, ask one short clarifying question instead of guessing a niche.

STYLE BASELINE (works for any brand, adjust to the stated voice):
- calm, warm, premium
- respectful of the audience
- organized and ready to use

WORDING RULES:
- Do not invent official source wording (curricula, standards, certifications, legal or medical claims). Paraphrase cautiously and say that you are paraphrasing.
- Do not invent statistics, prices or product details that are not in the Project Brain.`;

// ============================================================
// MIA & TEO MODULE — LME's own Montessori picture-book universe.
// Appended ONLY when the project is actually a Montessori / Mia &
// Teo project. Never applied to other niches.
// ============================================================
const MIA_TEO_MODULE = `MIA & TEO MODE IS ACTIVE (this project is a Montessori / Mia & Teo project).

You are helping Renate create premium Mia & Teo books, workbooks, Montessori-inspired materials, timelines, visual prompts, curriculum-linked resources and product bundles.

Preserve LME style:
- soft watercolor aesthetic
- child-respectful
- Montessori-inspired
- scientifically accurate
- print-ready

LOCKED MIA & TEO CHARACTER RULES (apply whenever they appear, especially in image prompts):
- Pixar/Disney 3D style, exclusively
- Two 6-year-old best friends (NOT siblings)
- Mia: long golden blonde hair in high ponytail, pink dress, pink sandals, white socks, small basket
- Teo: short light brown slightly tousled hair, yellow striped t-shirt, blue shorts, brown shoes, brown backpack

When helping with curriculum:
- distinguish uploaded official curriculum content from Montessori-inspired alignment
- do NOT invent official curriculum wording (LK20, AMI, etc.)
- use cautious wording if exact official goals are not available

CURATED CONTENT RULE:
LME Studio (the book & materials builder) ships with curated databases — AMI tasks,
LK20 competence aims, material types, image style presets. When the Project Brain
contains references to curated entries (e.g. linkedTasks, materials.cards,
curriculum.amiAreas), treat those curated entries as the source of truth. Build on
them; do not invent parallel content that duplicates or contradicts the curated database.`;

// ============================================================
// TASK REGISTRY — single source of truth, shared by all apps.
// Apps choose which subset to expose in their UI shell.
//
// `guidance`   is niche-neutral and always applied.
// `miaTeo`     is optional extra guidance applied only in Mia & Teo mode.
//
// To add a new task type: add an entry here. The Worker will
// accept it automatically.
// ============================================================
const TASK_REGISTRY = {
  general: {
    label: { en: 'General', no: 'Generelt' },
    guidance: 'Answer practically and warmly. Stay grounded in the brand and niche from the Project Brain.',
  },

  content: {
    label: { en: 'Content / Social', no: 'Innhold / sosialt' },
    guidance: `Create social/marketing content for the brand and niche in the Project Brain.
- Write about that niche and nothing else. Do not substitute a different industry or add characters that were not requested.
- Match the format requested: post, carousel, reel script, story, hook, hashtag set.
- Match the stated brand voice and audience. If none is stated, stay warm, clear and professional.
- Norwegian output uses warm, natural Bokmål. Bilingual NO/EN only when asked.
- Prefer comment-based CTAs ("Comment GUIDE") over "link in bio".
- Hashtags must match the brand's own niche — never reuse hashtags from another niche.`,
    miaTeo: `- Montessori framing: "buy some, make some, find some free" — never "buy nothing".
- Mia & Teo may appear; keep the locked character rules.`,
  },

  book: {
    label: { en: 'Book page', no: 'Bokside' },
    guidance: `Generate or improve picture-book content.
- Respect selected page count: 24 / 32 / 64 pages.
- Respect age group, language, and book type from the Project Brain.
- Keep characters consistent with the Project Brain.
- One scene per spread. Sensory, observational, calm pacing.
- Provide page text only unless asked for layout notes.`,
    miaTeo: `- Mia and Teo are 6, best friends, not siblings. Keep them consistent across every page.`,
  },

  workbook: {
    label: { en: 'Workbook page', no: 'Arbeidsbokside' },
    guidance: `Design workbook / activity pages.
- State: age group, learning objective, materials, layout description, expected output.
- Isolate one difficulty per page.
- Print-ready: A4 portrait by default, generous margins.`,
    miaTeo: `- Montessori-inspired isolation of difficulty.
- Reminder: Sasson Montessori font is the LME default for print materials.`,
  },

  imagePrompt: {
    label: { en: 'Image prompt', no: 'Bildeprompt' },
    guidance: `Output a complete production-ready image prompt with these labelled sections in order:
STYLE / SUBJECT / COMPOSITION / LIGHTING / BACKGROUND / NEGATIVE PROMPT.

- SUBJECT must come from the Project Brain's brand and niche. Do not insert characters, children or classroom scenes unless the brief asks for them.
- Use the style preset from the Project Brain when present. Otherwise pick a style that fits the niche and say which you picked.
- No text, no labels, no captions inside the image unless explicitly requested.
- Negative prompt always present: "no text, no labels, no extra characters, harsh shadows, distorted anatomy, watermarks".`,
    miaTeo: `- When Mia and/or Teo appear, include the LOCKED character rules verbatim.
- Default style preset: Pixar/Disney 3D + soft watercolor finish.`,
  },

  curriculum: {
    label: { en: 'Curriculum links', no: 'Læreplan-koblinger' },
    guidance: `Suggest curriculum alignments cautiously.

WORDING RULES:
- Clearly mark each suggestion as a cautious paraphrase, not official wording.
- Never quote curriculum text you haven't been given. If uploaded official text is in the Project Brain, you may quote from it briefly.
- Always provide: age band, subject/area, and the suggested learning objective.`,
    miaTeo: `CURATED-FIRST RULE (very important):
LME Studio includes a curated curriculum engine. The Project Brain may contain:
- curriculum.amiAreas[]            (AMI areas already chosen for this project)
- curriculum.lk20Subjects[]        (LK20 subjects already chosen for this project)
- curriculum.linkedTasks[]         (specific curated tasks already linked to the project)
- curriculum.vocabulary            (vocabulary already pulled from linked tasks)
- curriculum.extensionActivities   (extensions already pulled from linked tasks)

If linkedTasks already exists, ALWAYS reference those curated tasks first by their title
and only suggest additional ones if the user explicitly asks for more. Do NOT invent
parallel suggestions that duplicate what is already linked.

If amiAreas or lk20Subjects exist but linkedTasks is empty, suggest tasks that fit those
selected areas/subjects — do not propose unrelated areas.

Mark each suggestion as: "Montessori-inspired (AMI tradition)" / "Norwegian LK20 (cautious paraphrase)" / "Uploaded official source".`,
  },

  materials: {
    label: { en: 'Materials / 3-part cards', no: 'Materialer / 3-deltskort' },
    guidance: `Design printable learning materials such as 3-part cards, nomenclature cards, sorting trays.
- State: subject, age group, accuracy notes, print specs.
- 3-part cards = picture card + label card + picture+label card.
- Print: A4, generous spacing, child-safe color palette.
- Verify accuracy of any species, anatomy, or geography.`,
    miaTeo: `- Montessori-inspired presentation. Sasson Montessori font for print.`,
  },

  timeline: {
    label: { en: 'Timeline', no: 'Tidslinje' },
    guidance: `Build chronological entries for timelines.
- Each entry: title, year/period, one-line audience-respectful description, image-prompt seed.
- Honor scientific and historical consensus on dates.
- Default age band 6-9 unless specified.`,
  },

  productBundle: {
    label: { en: 'Product bundle', no: 'Produktpakke' },
    guidance: `Design or describe product bundles for the brand in the Project Brain.
- State: included items, suggested price tier, target audience, hook, framing copy.
- The items must fit that brand's actual product type — do not assume books or teaching materials unless the Project Brain says so.
- Use NOK and USD when relevant, and a simple entry / mid / pro tier structure when not told otherwise.
- Output should be ready to paste into the user's own shop or listing.`,
    miaTeo: `- Match Renate's existing tier structure (entry / mid / proff) and LME channels (FEA, Etsy, lmexplorers.com).`,
  },

  educational: {
    label: { en: 'Lesson / scope', no: 'Leksjon / plan' },
    guidance: `Plan lessons, units, scope-and-sequence, explainers or learning paths for the stated niche.
- State: audience/age band, prerequisites, objectives, sequence of activities, suggested materials.
- For non-teaching brands, treat this as "teach my audience something useful about my field".`,
    miaTeo: `- Bridge Montessori philosophy with the Norwegian curriculum cautiously, as in 'curriculum'.`,
  },
};

// ============================================================
// CORS
// ============================================================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, X-LME-App',
  'Access-Control-Max-Age': '86400',
};

// Apps that ARE the Mia & Teo publishing house — always in Mia & Teo mode.
const MIA_TEO_APPS = ['lme-studio', 'studio', 'book-builder'];

// ============================================================
// MAIN HANDLER
// ============================================================
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // GET /api/tasks — lets app shells discover available task types.
    // Useful for future apps that want to auto-build their task UI.
    if (url.pathname === '/api/tasks' && request.method === 'GET') {
      const out = Object.fromEntries(
        Object.entries(TASK_REGISTRY).map(([k, v]) => [k, { label: v.label }])
      );
      return json({ tasks: out });
    }

    if (url.pathname !== '/api/ai') {
      return json({ error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST only' }, 405);
    }

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    const provider     = (payload.provider || 'mock').toLowerCase();
    const model        = payload.model || '';
    const taskType     = payload.taskType || 'general';
    const projectCtx   = payload.projectContext || {};
    const userMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const appId        = payload.appId || request.headers.get('X-LME-App') || 'unknown';
    const lang         = (payload.lang || 'en').toLowerCase();

    if (!TASK_REGISTRY[taskType]) {
      return json({ error: `Unknown taskType: ${taskType}` }, 400);
    }
    if (userMessages.length === 0) {
      return json({ error: 'messages array is required' }, 400);
    }

    const miaTeoMode   = isMiaTeoProject(projectCtx, appId);
    const systemPrompt = buildSystemPrompt(taskType, projectCtx, appId, lang, miaTeoMode);

    try {
      let reply;
      if (provider === 'mock') {
        reply = mockProvider(taskType, userMessages, projectCtx, appId, miaTeoMode);
      } else if (provider === 'openai') {
        if (!env.OPENAI_API_KEY) return json({ error: 'OpenAI key not configured on this Worker.' }, 503);
        reply = await openaiProvider(env.OPENAI_API_KEY, model, systemPrompt, userMessages);
      } else if (provider === 'anthropic') {
        if (!env.ANTHROPIC_API_KEY) return json({ error: 'Anthropic key not configured on this Worker.' }, 503);
        reply = await anthropicProvider(env.ANTHROPIC_API_KEY, model, systemPrompt, userMessages);
      } else {
        return json({ error: `Unknown provider: ${provider}` }, 400);
      }
      // miaTeoMode is echoed back so the app shells can show/debug which
      // brand mode the Worker actually used for this reply.
      return json({ provider, taskType, appId, miaTeoMode, reply });
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  },
};

// ============================================================
// HELPERS
// ============================================================
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Should the Mia & Teo / Montessori module be applied?
 *
 * Mirrors `_isMontessoriNiche()` in the Autopilot frontend: the free-text
 * niche field is authoritative whenever it has a value. The character
 * selection is only a fallback for an empty niche field, otherwise a stale
 * "Mia & Teo" choice keeps Montessori alive after a niche switch.
 */
function isMiaTeoProject(ctx, appId) {
  if (MIA_TEO_APPS.includes(String(appId || '').toLowerCase())) return true;

  const niche = String(ctx?.niche || '').trim().toLowerCase();
  if (niche) return niche.includes('montessori');

  if (String(ctx?.charPreset || '').toLowerCase() === 'miateo') return true;

  const chars = String(ctx?.characters || '').toLowerCase();
  return chars.includes('mia') && chars.includes('teo');
}

/**
 * Drop a stale Mia & Teo character selection when the project is not a
 * Mia & Teo project.
 *
 * The frontend clears `state.char` / `cfg.charPreset` on a niche switch, but an
 * older tab, a cached shell or a restored localStorage snapshot can still ship
 * "Mia & Teo" in the brain. Trusting it here would put the characters back into
 * the prompt for a café or an Etsy shop — the exact leak this Worker is meant
 * to stop. The niche field already decided; the character fields do not get a
 * second vote.
 */
function sanitizeBrain(ctx, miaTeoMode) {
  if (miaTeoMode || !ctx || typeof ctx !== 'object') return ctx || {};

  const namesMiaTeo = (v) => {
    const s = String(v || '').toLowerCase();
    return s === 'miateo' || (s.includes('mia') && s.includes('teo'));
  };

  const out = { ...ctx };
  if (namesMiaTeo(out.characters)) delete out.characters;
  if (namesMiaTeo(out.charPreset)) delete out.charPreset;
  return out;
}

/** Pull the brand fields out of the brain so they lead the prompt instead of
 *  being buried somewhere in a large JSON dump. */
function buildBrandBlock(ctx) {
  const lines = [];
  const add = (label, value) => {
    if (value === null || value === undefined) return;
    const v = Array.isArray(value) ? value.join(', ') : String(value).trim();
    if (v) lines.push(`- ${label}: ${v}`);
  };

  add('Brand', ctx?.brand);
  add('Niche', ctx?.niche);
  add('Voice', ctx?.voice);
  add('Audience', ctx?.audience);
  add('Characters', ctx?.characters);

  if (!lines.length) {
    return 'BRAND & NICHE: not provided. Ask the user which brand and niche this is for before writing niche-specific content.';
  }
  return `BRAND & NICHE (this is the subject matter — do not substitute another one):\n${lines.join('\n')}`;
}

function buildSystemPrompt(taskType, projectCtx, appId, lang, miaTeoMode) {
  const task = TASK_REGISTRY[taskType] || TASK_REGISTRY.general;
  const langLine = lang === 'no'
    ? 'Respond in Norwegian Bokmål unless the user clearly writes in English.'
    : 'Respond in the same language the user writes in (English or Norwegian Bokmål).';

  const brain = sanitizeBrain(projectCtx, miaTeoMode);
  const hasBrain = brain && Object.keys(brain).length > 0;
  const brainBlock = hasBrain
    ? `\n\nACTIVE PROJECT BRAIN (from ${appId}):\n${JSON.stringify(brain, null, 2)}`
    : `\n\n(No active Project Brain provided by ${appId}.)`;

  const guidance = miaTeoMode && task.miaTeo
    ? `${task.guidance}\n${task.miaTeo}`
    : task.guidance;

  const identity = miaTeoMode
    ? `${CORE_IDENTITY}\n\n${MIA_TEO_MODULE}`
    : CORE_IDENTITY;

  return `${identity}

CURRENT APP: ${appId}
CURRENT TASK: ${taskType}
LANGUAGE PREFERENCE: ${langLine}

${buildBrandBlock(brain)}

TASK GUIDANCE:
${guidance}${brainBlock}`;
}

// ============================================================
// MOCK PROVIDER — works without any API keys
// ============================================================
function mockProvider(taskType, messages, ctx, appId, miaTeoMode) {
  const last = messages[messages.length - 1]?.content || '';
  const hasBrain = ctx && Object.keys(ctx).length > 0;
  const brainNote = hasBrain
    ? `(Project Brain detected from ${appId}: ${Object.keys(ctx).slice(0, 6).join(', ')})`
    : `(No Project Brain attached from ${appId}.)`;

  const brand = String(ctx?.brand || '').trim() || 'your brand';
  const niche = String(ctx?.niche || '').trim() || 'your niche';
  const modeNote = miaTeoMode ? 'Mia & Teo mode: ON' : `Niche mode: ${niche}`;
  const head = `${brainNote}\n${modeNote}`;

  const samples = {
    general:   `🩷 Mock Nathalie AI\n${head}\n\nYou said: "${last}"\n\nMock provider — no API keys needed. Switch to OpenAI or Claude in the panel for real output.`,
    content:   `📱 Mock content reply\n${head}\n\nHook: a curiosity-opening first line about ${niche}.\nBody: 3 concrete, useful points for ${brand}'s audience.\nCTA: Comment GUIDE for the free checklist.\nHashtags: tags matched to ${niche} (live mode generates real ones).`,
    book:      `📖 Mock book page\n${head}\n\nIn live mode I will generate page text matched to your selected page count, age group, language, and book type.`,
    workbook:  `📓 Mock workbook page\n${head}\n\nAge: 6-9 · Objective: trace + label · Materials: pencil, watercolor pencils · Layout: header / illustration / 3 tracing lines / label box.`,
    imagePrompt: miaTeoMode
      ? `🎨 Mock image prompt\n${head}\n\nSTYLE: Pixar/Disney 3D, soft watercolor finish\nSUBJECT: Mia (golden blonde ponytail, pink dress, basket) and Teo (yellow striped tee, blue shorts, brown backpack), both 6 years old\nCOMPOSITION: medium two-shot, golden ratio\nLIGHTING: warm afternoon, soft rim light\nBACKGROUND: meadow with wildflowers, soft bokeh\nNEGATIVE PROMPT: no text, no labels, no extra characters, harsh shadows, distorted anatomy, watermarks`
      : `🎨 Mock image prompt\n${head}\n\nSTYLE: clean, premium, matched to ${brand}\nSUBJECT: a scene from ${niche}\nCOMPOSITION: rule of thirds, generous negative space\nLIGHTING: soft natural light\nBACKGROUND: simple, uncluttered, on-brand\nNEGATIVE PROMPT: no text, no labels, no extra characters, harsh shadows, distorted anatomy, watermarks`,
    curriculum:`📚 Mock curriculum reply\n${head}\n\n• Cautious paraphrase only — live mode never invents official wording.\n• Always states age band, subject/area and the suggested learning objective.`,
    materials: `🃏 Mock materials\n${head}\n\n3-part cards · A4 print · subject placeholder.\nLive mode produces the full picture/label/picture+label set with accuracy notes.`,
    timeline:  `🕰 Mock timeline\n${head}\n\n1. Entry one — period — short description — image-prompt seed\n2. Entry two — period — short description — image-prompt seed\n3. Entry three — period — short description — image-prompt seed`,
    productBundle: `🎁 Mock product bundle\n${head}\n\nName: ${brand} Starter Set\nIncludes: 3-4 items matched to ${niche}\nTier: mid\nFraming: one warm sentence that makes the bundle feel like an easy yes.`,
    educational: `🎓 Mock lesson plan\n${head}\n\nAudience placeholder · Sequence: invitation → guided walkthrough → independent practice → reflection · Materials: see materials task.`,
  };
  return samples[taskType] || samples.general;
}

// ============================================================
// OPENAI PROVIDER
// ============================================================
async function openaiProvider(apiKey, model, systemPrompt, messages) {
  const body = {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ],
    temperature: 0.7,
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '(empty OpenAI response)';
}

// ============================================================
// ANTHROPIC PROVIDER
// ============================================================
async function anthropicProvider(apiKey, model, systemPrompt, messages) {
  const body = {
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const reply = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
  return reply || '(empty Claude response)';
}
