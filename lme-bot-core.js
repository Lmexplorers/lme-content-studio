/* ============================================================
   LME BOT CORE — Shared UI Engine
   ------------------------------------------------------------
   Used by every LME app. Knows nothing about Content Studio
   or LME Studio directly. Apps configure it like this:

     LMEBot.init({
       appId: 'content-studio',
       endpoint: 'https://lme-ai-brain.renateshobby.workers.dev/api/ai',
       lang: 'no',                              // optional, autodetected
       tasks: ['content', 'imagePrompt', ...],  // which tasks to expose
       defaultTask: 'content',
       suggestions: { content: [...], ... },    // per-task quick prompts
       getProjectBrain: () => ({ ... }),        // app-specific reader
       insertResponse: (text) => { ... },       // app-specific inserter
     });

   Designed to be loaded once, then reused across LME apps with
   different config. Single file, no build step.
   ============================================================ */

(function (global) {
  'use strict';

  // ============================================================
  // INTERNATIONALIZATION (UI chrome only — bot replies are model-driven)
  // ============================================================
  const STRINGS = {
    en: {
      title: 'LME AI',
      subtitle: 'Your publishing & Montessori helper',
      fabLabel: 'Ask LME AI',
      placeholder: 'Ask LME AI...',
      send: 'Send',
      clear: 'Clear chat',
      useBrain: 'Use Project Brain as context',
      provider: 'Provider',
      task: 'Task',
      copy: 'Copy',
      copied: 'Copied!',
      insert: 'Insert',
      inserted: 'Inserted ✓',
      thinking: 'Thinking...',
      error: 'Something went wrong. Check Worker connection.',
      confirmClear: 'Clear all chat history?',
      noInsert: 'No insert handler configured for this app.',
    },
    no: {
      title: 'LME AI',
      subtitle: 'Din publiserings- og Montessori-hjelper',
      fabLabel: 'Spør LME AI',
      placeholder: 'Spør LME AI...',
      send: 'Send',
      clear: 'Tøm chat',
      useBrain: 'Bruk Project Brain som kontekst',
      provider: 'Leverandør',
      task: 'Oppgave',
      copy: 'Kopier',
      copied: 'Kopiert!',
      insert: 'Sett inn',
      inserted: 'Satt inn ✓',
      thinking: 'Tenker...',
      error: 'Noe gikk galt. Sjekk Worker-tilkobling.',
      confirmClear: 'Tøm hele chathistorikken?',
      noInsert: 'Ingen innsettings-handler er satt opp for denne appen.',
    },
  };

  // Default human labels for task types — apps can override
  const DEFAULT_TASK_LABELS = {
    en: {
      general: 'General', content: 'Content', book: 'Book', workbook: 'Workbook',
      imagePrompt: 'Image prompt', curriculum: 'Curriculum', materials: 'Materials',
      timeline: 'Timeline', productBundle: 'Product bundle', educational: 'Lesson',
    },
    no: {
      general: 'Generelt', content: 'Innhold', book: 'Bok', workbook: 'Arbeidsbok',
      imagePrompt: 'Bildeprompt', curriculum: 'Læreplan', materials: 'Materialer',
      timeline: 'Tidslinje', productBundle: 'Produktpakke', educational: 'Leksjon',
    },
  };

  // ============================================================
  // STYLES (LME brand: soft pink #F8D7DA, dark pink #E4A0A8, teal #5FB3B3)
  // ============================================================
  const CSS = `
    .lme-bot-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 99998;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #F8D7DA 0%, #E4A0A8 100%);
      border: none; cursor: pointer;
      box-shadow: 0 6px 20px rgba(228,160,168,0.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      color: white; font-size: 24px;
    }
    .lme-bot-fab:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 10px 28px rgba(228,160,168,0.55); }
    .lme-bot-fab.open { transform: rotate(45deg); }

    .lme-bot-panel {
      position: fixed; bottom: 92px; right: 24px; z-index: 99997;
      width: 380px; max-width: calc(100vw - 32px);
      height: 600px; max-height: calc(100vh - 120px);
      background: #FFFFFF; border-radius: 18px;
      box-shadow: 0 18px 50px rgba(74, 26, 35, 0.18);
      display: none; flex-direction: column;
      font-family: 'Sasson Montessori', 'Playpen Sans', system-ui, sans-serif;
      overflow: hidden; border: 1px solid #FCE9EC;
    }
    .lme-bot-panel.open { display: flex; animation: lmeSlideUp 0.25s ease; }
    @keyframes lmeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

    .lme-bot-header {
      padding: 16px; background: linear-gradient(135deg, #F8D7DA 0%, #E4A0A8 100%);
      color: #4A1A23;
    }
    .lme-bot-header h3 { margin: 0; font-size: 16px; font-weight: 600; font-family: 'Playpen Sans', system-ui, sans-serif; }
    .lme-bot-header p  { margin: 2px 0 0; font-size: 12px; opacity: 0.8; }
    .lme-bot-app-badge {
      display: inline-block; margin-top: 6px; padding: 2px 8px;
      background: rgba(255,255,255,0.5); border-radius: 10px;
      font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase;
    }

    .lme-bot-controls {
      padding: 10px 14px; background: #FFF7F8; border-bottom: 1px solid #FCE9EC;
      display: flex; flex-direction: column; gap: 8px; font-size: 12px;
    }
    .lme-bot-controls .row { display: flex; gap: 8px; align-items: center; }
    .lme-bot-controls label { color: #6B3540; font-weight: 500; min-width: 56px; }
    .lme-bot-controls select {
      flex: 1; padding: 4px 6px; border: 1px solid #F8D7DA; border-radius: 6px;
      background: white; font-size: 12px; color: #4A1A23;
    }
    .lme-bot-controls .toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .lme-bot-controls .toggle input { accent-color: #E4A0A8; }

    .lme-bot-messages {
      flex: 1; overflow-y: auto; padding: 14px; background: #FFFDFD;
      display: flex; flex-direction: column; gap: 10px;
    }
    .lme-msg { padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; max-width: 90%; word-wrap: break-word; }
    .lme-msg.user { background: #E4A0A8; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .lme-msg.bot  { background: #FCE9EC; color: #4A1A23; align-self: flex-start; border-bottom-left-radius: 4px; white-space: pre-wrap; }
    .lme-msg.bot.thinking { font-style: italic; opacity: 0.7; }
    .lme-msg-actions { display: flex; gap: 6px; margin-top: 6px; }
    .lme-msg-actions button {
      font-size: 11px; padding: 3px 8px; border-radius: 6px;
      border: 1px solid #E4A0A8; background: white; color: #6B3540; cursor: pointer;
    }
    .lme-msg-actions button:hover { background: #FCE9EC; }

    .lme-bot-suggestions {
      padding: 8px 14px; display: flex; gap: 6px; flex-wrap: wrap;
      background: #FFFDFD; border-top: 1px solid #FCE9EC;
    }
    .lme-bot-suggestions button {
      font-size: 11px; padding: 5px 10px; border-radius: 14px;
      border: 1px solid #F8D7DA; background: white; color: #6B3540;
      cursor: pointer; transition: background 0.15s;
    }
    .lme-bot-suggestions button:hover { background: #FCE9EC; }

    .lme-bot-input {
      padding: 12px; border-top: 1px solid #FCE9EC; background: white;
      display: flex; gap: 8px; align-items: flex-end;
    }
    .lme-bot-input textarea {
      flex: 1; resize: none; min-height: 38px; max-height: 100px;
      padding: 8px 10px; border: 1px solid #F8D7DA; border-radius: 10px;
      font-size: 13px; font-family: inherit; outline: none; color: #4A1A23;
    }
    .lme-bot-input textarea:focus { border-color: #E4A0A8; }
    .lme-bot-input button.send {
      padding: 8px 14px; border: none; border-radius: 10px;
      background: linear-gradient(135deg, #E4A0A8 0%, #5FB3B3 100%);
      color: white; cursor: pointer; font-weight: 600; font-size: 13px;
    }
    .lme-bot-input button.send:disabled { opacity: 0.5; cursor: not-allowed; }
    .lme-bot-input button.clear {
      padding: 8px 10px; border: 1px solid #F8D7DA; border-radius: 10px;
      background: white; color: #B07480; cursor: pointer; font-size: 12px;
    }

    /* Form controls do not inherit font-family — force LME body font (Sasson Montessori) everywhere */
    .lme-bot-panel select,
    .lme-bot-panel textarea,
    .lme-bot-panel button,
    .lme-bot-fab-label {
      font-family: 'Sasson Montessori', 'Playpen Sans', system-ui, sans-serif;
    }

    /* Liten etikett ved siden av knappen, sa folk ser hva den er */
    .lme-bot-fab-label {
      position: fixed; bottom: 38px; right: 92px; z-index: 99998;
      background: #FFFFFF; color: #6B3540; border: 1px solid #FCE9EC;
      border-radius: 999px; padding: 7px 14px; font-size: 12.5px; font-weight: 700;
      box-shadow: 0 6px 18px rgba(74,26,35,0.16); white-space: nowrap;
      pointer-events: none; max-width: calc(100vw - 110px);
      overflow: hidden; text-overflow: ellipsis;
    }
    .lme-bot-fab-label.hidden { display: none; }
  `;

  // ============================================================
  // CORE STATE (per-app, scoped by appId)
  // ============================================================
  let cfg = null;        // active config from init()
  let T = STRINGS.en;    // active UI strings
  let TASKS = {};        // active task labels
  let history = [];
  let settings = {};
  let isLoading = false;

  // DOM refs (created once on init)
  let fab, fabLabel, panel, $messages, $suggestions, $textarea, $sendBtn, $clearBtn,
      $taskSelect, $provSelect, $brainToggle;

  function lsKey(name) { return `lme_bot_${cfg.appId}_${name}_v1`; }
  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  const LMEBot = {
    init(userCfg) {
      if (cfg) {
        console.warn('[LMEBot] already initialized — ignoring second init() call');
        return;
      }
      cfg = normalizeConfig(userCfg);
      T = STRINGS[cfg.lang] || STRINGS.en;
      TASKS = buildTaskLabels(cfg);
      history  = loadJSON(lsKey('history'), []);
      settings = loadJSON(lsKey('settings'), {
        provider: 'mock',
        model: '',
        taskType: cfg.defaultTask,
        useBrain: true,
      });
      // If saved task is no longer offered by this app, fall back
      if (!cfg.tasks.includes(settings.taskType)) settings.taskType = cfg.defaultTask;

      injectStyles();
      buildUI();
      bindEvents();
    },

    open()  { if (cfg && !panel.classList.contains('open')) fab.click(); },
    close() { if (cfg &&  panel.classList.contains('open')) fab.click(); },

    setTask(taskType) {
      if (!cfg || !cfg.tasks.includes(taskType)) return;
      settings.taskType = taskType;
      $taskSelect.value = taskType;
      saveJSON(lsKey('settings'), settings);
      renderSuggestions();
    },

    ask(text, opts = {}) {
      if (!cfg) return;
      if (opts.taskType) this.setTask(opts.taskType);
      this.open();
      $textarea.value = text;
      send();
    },

    clearHistory() { history = []; saveAndRender(); },
  };

  // ============================================================
  // CONFIG NORMALIZATION
  // ============================================================
  function normalizeConfig(raw) {
    if (!raw || !raw.appId) throw new Error('LMEBot.init: appId is required');
    if (!raw.endpoint)      throw new Error('LMEBot.init: endpoint is required');

    const lang = (raw.lang ||
      (typeof location !== 'undefined' && location.pathname.includes('/no/') ? 'no' :
       (document?.documentElement?.lang === 'no' ? 'no' : 'en'))).toLowerCase();

    const tasks = Array.isArray(raw.tasks) && raw.tasks.length ? raw.tasks : ['general'];
    const defaultTask = raw.defaultTask && tasks.includes(raw.defaultTask) ? raw.defaultTask : tasks[0];

    return {
      appId: raw.appId,
      endpoint: raw.endpoint,
      lang,
      tasks,
      defaultTask,
      suggestions: raw.suggestions || {},
      taskLabels: raw.taskLabels || {},     // optional override
      getProjectBrain: typeof raw.getProjectBrain === 'function' ? raw.getProjectBrain : (() => null),
      insertResponse:  typeof raw.insertResponse  === 'function' ? raw.insertResponse  : null,
      headerBadge: raw.headerBadge || raw.appId,
    };
  }

  function buildTaskLabels(cfg) {
    const base = DEFAULT_TASK_LABELS[cfg.lang] || DEFAULT_TASK_LABELS.en;
    const merged = { ...base, ...(cfg.taskLabels[cfg.lang] || cfg.taskLabels) };
    // Only return labels for tasks this app actually exposes
    const out = {};
    cfg.tasks.forEach(t => { out[t] = merged[t] || t; });
    return out;
  }

  // ============================================================
  // UI BUILD
  // ============================================================
  function injectStyles() {
    if (document.getElementById('lme-bot-styles')) return;
    const style = document.createElement('style');
    style.id = 'lme-bot-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildUI() {
    fab = document.createElement('button');
    fab.className = 'lme-bot-fab';
    fab.setAttribute('aria-label', T.title);
    fab.setAttribute('title', T.fabLabel);
    fab.innerHTML = '🩷';
    document.body.appendChild(fab);

    fabLabel = document.createElement('div');
    fabLabel.className = 'lme-bot-fab-label';
    fabLabel.textContent = T.fabLabel;
    document.body.appendChild(fabLabel);

    panel = document.createElement('div');
    panel.className = 'lme-bot-panel';
    panel.innerHTML = `
      <div class="lme-bot-header">
        <h3>${T.title}</h3>
        <p>${T.subtitle}</p>
        <span class="lme-bot-app-badge">${escapeHtml(cfg.headerBadge)}</span>
      </div>
      <div class="lme-bot-controls">
        <div class="row">
          <label>${T.task}</label>
          <select class="task-select">
            ${cfg.tasks.map(t => `<option value="${t}" ${settings.taskType===t?'selected':''}>${escapeHtml(TASKS[t])}</option>`).join('')}
          </select>
        </div>
        <div class="row">
          <label>${T.provider}</label>
          <select class="provider-select">
            <option value="mock"      ${settings.provider==='mock'?'selected':''}>Mock (test)</option>
            <option value="openai"    ${settings.provider==='openai'?'selected':''}>OpenAI</option>
            <option value="anthropic" ${settings.provider==='anthropic'?'selected':''}>Claude</option>
          </select>
        </div>
        <label class="toggle">
          <input type="checkbox" class="brain-toggle" ${settings.useBrain?'checked':''}>
          <span>${T.useBrain}</span>
        </label>
      </div>
      <div class="lme-bot-messages"></div>
      <div class="lme-bot-suggestions"></div>
      <div class="lme-bot-input">
        <textarea placeholder="${T.placeholder}" rows="1"></textarea>
        <button class="send">${T.send}</button>
        <button class="clear" title="${T.clear}">×</button>
      </div>
    `;
    document.body.appendChild(panel);

    $messages    = panel.querySelector('.lme-bot-messages');
    $suggestions = panel.querySelector('.lme-bot-suggestions');
    $textarea    = panel.querySelector('textarea');
    $sendBtn     = panel.querySelector('.send');
    $clearBtn    = panel.querySelector('.clear');
    $taskSelect  = panel.querySelector('.task-select');
    $provSelect  = panel.querySelector('.provider-select');
    $brainToggle = panel.querySelector('.brain-toggle');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderHistory() {
    $messages.innerHTML = '';
    history.forEach(m => renderMessage(m));
    $messages.scrollTop = $messages.scrollHeight;
  }

  function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = `lme-msg ${msg.role}${msg.thinking ? ' thinking' : ''}`;
    div.textContent = msg.content;
    if (msg.role === 'bot' && !msg.thinking) {
      const actions = document.createElement('div');
      actions.className = 'lme-msg-actions';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = T.copy;
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(msg.content);
          copyBtn.textContent = T.copied;
          setTimeout(() => copyBtn.textContent = T.copy, 1500);
        } catch {}
      };
      actions.appendChild(copyBtn);

      if (cfg.insertResponse) {
        const insertBtn = document.createElement('button');
        insertBtn.textContent = T.insert;
        insertBtn.onclick = () => {
          try {
            cfg.insertResponse(msg.content, { taskType: settings.taskType });
            insertBtn.textContent = T.inserted;
            setTimeout(() => insertBtn.textContent = T.insert, 1500);
          } catch (e) {
            console.error('[LMEBot] insertResponse failed:', e);
          }
        };
        actions.appendChild(insertBtn);
      }
      div.appendChild(actions);
    }
    $messages.appendChild(div);
  }

  function renderSuggestions() {
    $suggestions.innerHTML = '';
    const list = (cfg.suggestions && cfg.suggestions[settings.taskType]) || [];
    list.forEach(text => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => { $textarea.value = text; $textarea.focus(); };
      $suggestions.appendChild(b);
    });
  }

  // ============================================================
  // SEND PIPELINE
  // ============================================================
  async function send() {
    const text = $textarea.value.trim();
    if (!text || isLoading) return;

    history.push({ role: 'user', content: text });
    $textarea.value = '';
    saveAndRender();

    history.push({ role: 'bot', content: T.thinking, thinking: true });
    renderHistory();

    isLoading = true;
    $sendBtn.disabled = true;

    try {
      const brain = settings.useBrain ? safeGetBrain() : null;
      const payload = {
        appId: cfg.appId,
        lang: cfg.lang,
        provider: settings.provider,
        model: settings.model || '',
        taskType: settings.taskType,
        projectContext: brain || {},
        messages: history
          .filter(m => !m.thinking)
          .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })),
      };

      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LME-App': cfg.appId },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const reply = data.reply || data.error || T.error;

      history.pop(); // remove thinking
      history.push({ role: 'bot', content: reply });
    } catch (err) {
      history.pop();
      history.push({ role: 'bot', content: `${T.error}\n\n${err.message || ''}` });
    } finally {
      isLoading = false;
      $sendBtn.disabled = false;
      if (history.length > 40) history = history.slice(-40);
      saveAndRender();
    }
  }

  function safeGetBrain() {
    try { return cfg.getProjectBrain() || null; }
    catch (e) { console.warn('[LMEBot] getProjectBrain threw:', e); return null; }
  }

  function saveAndRender() {
    saveJSON(lsKey('history'),  history);
    saveJSON(lsKey('settings'), settings);
    renderHistory();
  }

  // ============================================================
  // EVENTS
  // ============================================================
  function bindEvents() {
    fab.addEventListener('click', () => {
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      fab.classList.toggle('open', open);
      if (fabLabel) fabLabel.classList.toggle('hidden', open);
      if (open) { renderHistory(); renderSuggestions(); $textarea.focus(); }
    });

    $sendBtn.addEventListener('click', send);
    $textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    $clearBtn.addEventListener('click', () => {
      if (confirm(T.confirmClear)) { history = []; saveAndRender(); }
    });

    $taskSelect.addEventListener('change', () => {
      settings.taskType = $taskSelect.value;
      saveJSON(lsKey('settings'), settings);
      renderSuggestions();
    });
    $provSelect.addEventListener('change', () => {
      settings.provider = $provSelect.value;
      saveJSON(lsKey('settings'), settings);
    });
    $brainToggle.addEventListener('change', () => {
      settings.useBrain = $brainToggle.checked;
      saveJSON(lsKey('settings'), settings);
    });
  }

  // Expose
  global.LMEBot = LMEBot;
})(typeof window !== 'undefined' ? window : globalThis);
