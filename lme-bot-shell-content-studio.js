/* ============================================================
   LME BOT SHELL — LME Content Studio
   ------------------------------------------------------------
   This is the bot config for "LME Content Studio" — the social
   content creation app (carousels, reels, posts, scheduling).

   Note: there is a separate app called "LME Studio" for book
   and materials creation. That has its own shell file:
     lme-bot-shell-lme-studio.js

   This shell reads the global `state` object directly. Because
   Content Studio uses `const state = { ... }` at the top level,
   it isn't on window automatically — see the bridge snippet in
   the README (one line: `window.state = state; window.cfg = cfg;`).

   Loaded AFTER lme-bot-core.js:

     <script src="lme-bot-core.js"></script>
     <script src="lme-bot-shell-content-studio.js"></script>
   ============================================================ */

(function () {
  if (typeof LMEBot === 'undefined') {
    console.error('[LMEBot] core not loaded before Content Studio shell');
    return;
  }

  // Content Studio is bilingual (NO/EN). Detect language from:
  //   1. URL path (/en/ or /no/) — most reliable
  //   2. <html lang="..."> attribute
  //   3. URL query (?lang=en)
  function detectLang() {
    const path = location.pathname || '';
    if (path.includes('/en/') || path.endsWith('/en')) return 'en';
    if (path.includes('/no/') || path.endsWith('/no')) return 'no';
    if (/[?&]lang=en\b/.test(location.search)) return 'en';
    if (/[?&]lang=no\b/.test(location.search)) return 'no';
    if (document.documentElement.lang === 'en') return 'en';
    if (document.documentElement.lang === 'no') return 'no';
    return 'no'; // default for LME (Norwegian-first brand)
  }
  const LANG = detectLang();
  const NO = LANG === 'no';

  LMEBot.init({
    appId: 'content-studio',
    headerBadge: 'Content Studio',
    endpoint: 'https://lme-ai-brain.renateshobby.workers.dev/api/ai',
    lang: LANG,

    // Tasks Content Studio cares about
    tasks: ['content', 'imagePrompt', 'curriculum', 'productBundle', 'educational', 'general'],
    defaultTask: 'content',

    suggestions: {
      content: NO
        ? ['Skriv en reel-hook', 'Karusell-tekst, 5 slides', 'Ukens innholdsplan', 'Bildetekst med Comment-CTA']
        : ['Write a reel hook', 'Carousel text, 5 slides', "This week's content plan", 'Caption with Comment CTA'],
      imagePrompt: NO
        ? ['Bildeprompt for dagens post', 'Variant med myk akvarell', 'Negativ prompt']
        : ["Image prompt for today's post", 'Soft watercolor variant', 'Negative prompt'],
      curriculum: NO
        ? ['Foreslå LK20-koblinger (forsiktig)', 'AMI-tradisjon-kobling', 'Aldersgruppe 3-6']
        : ['Suggest LK20 links (cautious)', 'AMI tradition alignment', 'Ages 3-6'],
      productBundle: NO
        ? ['Lag promo-tekst for vårpakken', 'Bundle for nybegynnere', 'Pakke med Mia & Teo-bok']
        : ['Promo text for spring bundle', 'Beginner bundle', 'Bundle with Mia & Teo book'],
      educational: NO
        ? ['Kort leksjonsplan (6-9)', 'Plan for hjemmemiljø']
        : ['Short lesson plan (6-9)', 'Home-environment plan'],
      general: NO
        ? ['Hjelp meg å starte', 'Hva mangler i dagens innhold?']
        : ['Help me start', "What's missing in today's content?"],
    },

    // ---- App-specific Project Brain reader ----
    // Reads window.state directly (after the bridge line in Content Studio).
    // Real fields in this app:
    //   state.format / topic / customTopic / ageGroup / char / tone
    //   state.slideCount / cta / extra / platforms[]
    //   state.result   — current generated content (string OR string[] for slides)
    //   state.slides   — null OR array of slide strings
    //   state.history  — array of past generations (most recent first)
    //
    // Brand voice / niche / audience live in cfg (the user's settings).
    // We send a compact subset — never API keys.
    getProjectBrain() {
      const w = window;

      // Custom hook (preferred)
      if (typeof w.contentStudioGetBrain === 'function') return w.contentStudioGetBrain();

      const s = w.state;
      const c = w.cfg || {};
      if (!s) return null;

      // Resolve topic (custom takes precedence when "Custom topic..." is selected)
      const resolvedTopic = (s.topic === 'Custom topic...' && s.customTopic)
        ? s.customTopic
        : s.topic;

      // Current generated content (may be string or array of slides)
      let currentResult = null;
      if (Array.isArray(s.result))      currentResult = { kind: 'slides', slides: s.result };
      else if (typeof s.result === 'string' && s.result) currentResult = { kind: 'text', text: s.result };

      // Reel fields from the textareas (Content Studio stores these in DOM, not state)
      let reelCaption  = null;
      let reelHashtags = null;
      let reelCTA      = null;
      try {
        const cap = document.getElementById('reel-caption');
        const tags = document.getElementById('reel-hashtags');
        const cta = document.getElementById('reel-cta');
        if (cap  && cap.value)  reelCaption  = cap.value;
        if (tags && tags.value) reelHashtags = tags.value;
        if (cta  && cta.value)  reelCTA      = cta.value;
      } catch {}

      const brain = {
        // ---- Active editing context ----
        format:      s.format,         // 'carousel' | 'reel' | 'story' | ...
        topic:       resolvedTopic,
        ageGroup:    s.ageGroup,       // '3–6 år' | '6-9 år' | ...
        characters:  s.char,           // 'Mia og Teo' | ...
        tone:        s.tone,           // 'Varm og personlig' | ...
        slideCount:  s.slideCount,
        cta:         s.cta,
        extraNotes:  s.extra,
        platforms:   s.platforms,      // ['Instagram', ...]
        currentSlide: s.currentSlide,

        // ---- What's currently in the editor ----
        currentResult,                 // null | { kind, text/slides }
        reelCaption,                   // textarea contents if user is on a reel
        reelHashtags,                  // hashtag textarea (bot can see if NO/EN/both was chosen)
        reelCTA,                       // CTA textarea

        // ---- Recent history (last 5, lightweight) ----
        recentHistory: Array.isArray(s.history) ? s.history.slice(0, 5).map(h => ({
          format: h.format,
          topic: h.topic,
          ageGroup: h.ageGroup,
          ts: h.ts,
          platforms: h.platforms,
          published: !!h.published,
          // Truncate result for context — bot doesn't need full past posts
          resultPreview: typeof h.result === 'string'
            ? h.result.slice(0, 200)
            : Array.isArray(h.result) ? (h.result[0] || '').slice(0, 200) : null,
        })) : [],

        // ---- Brand voice (from cfg, no secrets) ----
        brand: c.brand,
        niche: c.niche,
        voice: c.voice,
        audience: c.audience,
        signature: c.signature,
        charPreset: c.charPreset,
        // profiler intentionally summarized (no detailed account info)
        socialAccounts: Array.isArray(c.profiler)
          ? c.profiler.map(p => p.plattform)
          : null,
      };

      return brain;
    },

    // ---- App-specific insert handler ----
    // Routes the bot's reply to the right Content Studio slot:
    //   - content / general  → state.result + renderResult()
    //                           (for reels, also fills #reel-caption)
    //   - imagePrompt        → appended to extra notes (state.extra)
    //                           and shown as new result
    //   - curriculum         → appended to state.extra (a place to keep notes)
    //   - productBundle      → state.result + renderResult() (treat as new content)
    //   - educational        → state.result + renderResult()
    //
    // Inserts also push to state.history so the user can find them later.
    insertResponse(text, ctx) {
      // Custom hook (preferred)
      if (typeof window.contentStudioInsert === 'function') {
        window.contentStudioInsert(text, ctx);
        return;
      }

      const s = window.state;
      if (!s) {
        console.warn('[LMEBot] no window.state — paste `window.state = state;` into Content Studio');
        return;
      }

      const taskType = ctx && ctx.taskType;
      const stamp = new Date().toLocaleString('nb-NO');

      // For curriculum, just stash in extra notes (it's reference material)
      if (taskType === 'curriculum') {
        s.extra = appendBlock(s.extra, text, `Renate AI · ${stamp}`);
        showToast('Lagt til i ekstra notater 🩷');
        return;
      }

      // For imagePrompt, stash in extra notes too — image prompts go to
      // the user's image generator, not to the post itself
      if (taskType === 'imagePrompt') {
        s.extra = appendBlock(s.extra, text, `Renate AI · imagePrompt · ${stamp}`);
        showToast('Bildeprompt lagt i ekstra notater 🎨');
        return;
      }

      // For content / productBundle / educational / general:
      // replace state.result so it shows up in the result panel,
      // and push to history so it's saved.
      s.result = text;
      s.slides = null;        // bot reply is plain text, not a slide deck
      s.currentSlide = 0;

      const resolvedTopic = (s.topic === 'Custom topic...' && s.customTopic)
        ? s.customTopic
        : s.topic;

      if (Array.isArray(s.history)) {
        s.history.unshift({
          id: Date.now(),
          format: s.format,
          topic: `[Renate AI] ${resolvedTopic || taskType || 'general'}`,
          ageGroup: s.ageGroup,
          result: text,
          ts: stamp,
          platforms: Array.isArray(s.platforms) ? [...s.platforms] : [],
        });
        if (s.history.length > 20) s.history.pop();
      }

      // For reels, also fill the reel caption textarea
      if (s.format === 'reel') {
        try {
          const el = document.getElementById('reel-caption');
          if (el) {
            el.value = text;
            // Trigger Content Studio's saveReelCaption
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch {}
      }

      // Re-render the result panel + history if those functions exist
      try {
        if (typeof window.renderResult === 'function') {
          window.renderResult();
          const box = document.getElementById('result-box');
          if (box) box.style.display = 'block';
        }
        if (typeof window.renderHistory === 'function') window.renderHistory();
      } catch (e) {
        console.warn('[LMEBot] render after insert failed:', e);
      }

      showToast('Innhold satt inn ✨');

      function appendBlock(existing, addition, header) {
        const tag = header ? `\n\n— ${header} —\n${addition}` : `\n\n${addition}`;
        return (existing || '') + tag;
      }

      function showToast(msg) {
        // Use Content Studio's existing toast if it has one
        try {
          if (typeof window.showToast === 'function') return window.showToast(msg);
          if (typeof window.toast === 'function')     return window.toast(msg);
        } catch {}
        // Tiny silent fallback — the bot's own UI already shows "Inserted ✓"
      }
    },
  });
})();
