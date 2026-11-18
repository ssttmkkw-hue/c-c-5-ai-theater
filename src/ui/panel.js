import { EXPERIMENT_IDS } from '../runtime/live.js';
import { formatWarning, t } from './i18n.js';
import { performanceToJson } from '../performance/schema.js';

const EXP_KEYS = {
  idle: 'expIdle',
  lookAt: 'expLookAt',
  lips: 'expLips',
  spotlight: 'expSpotlight',
  marks: 'expMarks',
  posture: 'expPosture',
  audience: 'expAudience',
  curtains: 'expCurtains',
  ikTargets: 'expIkTargets',
};

export function mountUI(api) {
  const panel = document.getElementById('panel');
  const help = document.getElementById('help');
  const tab = document.getElementById('panel-tab');
  const subtitle = document.getElementById('subtitle');
  const transport = document.getElementById('transport');

  panel.innerHTML = `
    <header class="brand">
      <p class="brand-kicker" data-i18n="subtitle"></p>
      <h1 data-i18n="title"></h1>
      <button type="button" id="lang-btn" class="text-btn"></button>
    </header>
    <label class="field"><span data-i18n="paste"></span>
      <textarea id="script" rows="6" spellcheck="false"></textarea>
    </label>
    <button type="button" id="perform-now" class="primary"></button>
    <p id="live-status" class="live-status"></p>
    <label class="field"><span data-i18n="samples"></span>
      <select id="sample-select">
        <option value="hamlet-a3s1"></option>
        <option value="hamlet-a1s5"></option>
        <option value="demo"></option>
        <option value="hamlet-a3s1-curated"></option>
      </select>
    </label>
    <button type="button" id="load-play" class="primary"></button>
    <label class="field"><span data-i18n="parser"></span>
      <select id="parser-select">
        <option value="rule"></option>
        <option value="ai"></option>
      </select>
    </label>
    <div class="row">
      <button type="button" id="parse-btn"></button>
      <button type="button" id="play-btn" class="primary"></button>
    </div>
    <label class="field"><span data-i18n="speed"></span>
      <select id="speed">
        <option value="0.75">0.75</option>
        <option value="1" selected>1</option>
        <option value="1.25">1.25</option>
      </select>
    </label>
    <div class="row wrap">
      <button type="button" id="mute-btn"></button>
      <label class="check"><input type="checkbox" id="subs-zh" checked /> <span data-i18n="subs"></span></label>
    </div>
    <div class="field">
      <span data-i18n="camera"></span>
      <div class="row wrap">
        <button type="button" data-cam="audience"></button>
        <button type="button" data-cam="cinematic"></button>
        <button type="button" data-cam="free"></button>
        <button type="button" id="sit-btn"></button>
      </div>
    </div>
    <fieldset class="experiments">
      <legend data-i18n="experiments"></legend>
      <div id="exp-list"></div>
    </fieldset>
    <details id="json-details">
      <summary data-i18n="showJson"></summary>
      <div class="row">
        <button type="button" id="download-json"></button>
        <label class="text-btn file-btn"><span data-i18n="importJson"></span><input id="import-json" type="file" accept="application/json,.json,text/plain" /></label>
      </div>
      <pre id="json-view"></pre>
    </details>
    <div class="log">
      <span data-i18n="warnings"></span>
      <ul id="warn-list"></ul>
    </div>
  `;

  transport.innerHTML = `
    <button type="button" id="prev-btn"></button>
    <button type="button" id="t-play" class="primary"></button>
    <button type="button" id="next-btn"></button>
    <button type="button" id="stop-btn"></button>
    <button type="button" id="restart-btn"></button>
    <span id="beat-count"></span>
  `;

  const expList = panel.querySelector('#exp-list');
  for (const id of EXPERIMENT_IDS) {
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = `<input type="checkbox" data-exp="${id}" /> <span data-exp-label="${id}"></span>`;
    expList.appendChild(label);
  }

  const direct = document.getElementById('direct');
  if (direct) {
    direct.innerHTML = `
      <span id="direct-label"></span>
      <button type="button" data-act="angrier"></button>
      <button type="button" data-act="replay"></button>
      <button type="button" data-act="faster"></button>
      <button type="button" data-act="hold"></button>
      <button type="button" data-act="ending" class="later"></button>
    `;
    direct.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      api.intervene({ type: btn.dataset.act });
    });
  }

  const q = (sel) => panel.querySelector(sel) || document.querySelector(sel);
  const script = q('#script');

  q('#perform-now').addEventListener('click', () => api.liveStart(script.value));
  q('#lang-btn').addEventListener('click', () => api.setLang(api.getState().lang === 'zh' ? 'en' : 'zh'));
  q('#load-play').addEventListener('click', () => api.loadAndPlay(q('#sample-select').value));
  q('#parser-select').addEventListener('change', (e) => api.setParser(e.target.value));
  q('#parse-btn').addEventListener('click', () => api.parseIntoShow(script.value));
  q('#play-btn').addEventListener('click', () => api.playFromPanel(script.value));
  q('#speed').addEventListener('change', (e) => api.setSpeed(Number(e.target.value)));
  q('#mute-btn').addEventListener('click', () => api.setMuted(!api.getState().muted));
  q('#subs-zh').addEventListener('change', (e) => api.setSubs(e.target.checked ? 'zh' : 'en'));
  panel.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.addEventListener('click', () => api.setCamera(btn.dataset.cam));
  });
  q('#sit-btn').addEventListener('click', () => api.setCamera('audience'));
  expList.addEventListener('change', (e) => {
    const input = e.target.closest('[data-exp]');
    if (!input) return;
    api.setExperiment(input.dataset.exp, input.checked);
  });
  q('#download-json').addEventListener('click', () => api.downloadJson());
  q('#import-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    script.value = text;
    await api.parseIntoShow(text);
    e.target.value = '';
  });

  document.getElementById('prev-btn').addEventListener('click', () => api.prevBeat());
  document.getElementById('next-btn').addEventListener('click', () => api.nextBeat());
  document.getElementById('t-play').addEventListener('click', () => api.togglePlay(script.value));
  document.getElementById('stop-btn').addEventListener('click', () => api.stop());
  document.getElementById('restart-btn').addEventListener('click', () => api.restart());
  tab.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    tab.setAttribute('aria-expanded', panel.classList.contains('collapsed') ? 'false' : 'true');
  });

  help.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss]')) api.dismissHelp();
  });

  function liveStatusText(state, L) {
    const sketch = (state.parseWarnings || []).includes('local-sketch');
    const prefix = sketch ? `${t(L, 'sketchLabel')} · ` : '';
    const n = state.beatCount
      ? Math.min(state.beatCount, (state.playing || state.paused) ? state.beatIndex + 1 : state.beatIndex)
      : 0;
    if (state.streaming && n > 0) return prefix + t(L, 'liveOn').replace('{n}', String(n));
    if (state.streaming) return prefix + t(L, 'liveWait');
    if (state.holding) return prefix + t(L, 'liveHold');
    if (sketch) return t(L, 'sketchLabel');
    return '';
  }

  function lang() {
    return api.getState().lang === 'en' ? 'en' : 'zh';
  }

  function applyLang() {
    const L = lang();
    document.documentElement.lang = L === 'zh' ? 'zh-CN' : 'en';
    document.title = t(L, 'docTitle');
    panel.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(L, el.dataset.i18n);
    });
    transport.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(L, el.dataset.i18n);
    });
    help.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(L, el.dataset.i18n);
    });
    const titles = {
      'hamlet-a3s1': 'sampleHamlet31',
      'hamlet-a1s5': 'sampleHamlet15',
      demo: 'sampleDemo',
      'hamlet-a3s1-curated': 'sampleCurated',
    };
    for (const [value, key] of Object.entries(titles)) {
      const opt = panel.querySelector(`#sample-select option[value="${value}"]`);
      if (opt) opt.textContent = t(L, key);
    }
    panel.querySelector('#parser-select option[value="rule"]').textContent = t(L, 'parserRule');
    panel.querySelector('#parser-select option[value="ai"]').textContent = t(L, 'parserAi');
    script.placeholder = t(L, 'placeholder');
    panel.querySelector('#lang-btn').textContent = t(L, 'lang');
    for (const id of EXPERIMENT_IDS) {
      const el = panel.querySelector(`[data-exp-label="${id}"]`);
      if (el) el.textContent = t(L, EXP_KEYS[id]);
    }
    const cams = { audience: 'camAudience', cinematic: 'camCinematic', free: 'camFree' };
    panel.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.textContent = t(L, cams[btn.dataset.cam]);
    });
    help.innerHTML = `
      <div class="help-card" role="dialog" aria-labelledby="help-title">
        <p class="brand-kicker">AI Theater · 演戏</p>
        <h2 id="help-title">${t(L, 'helpTitle')}</h2>
        <p lang="zh-CN">${t(L, 'helpZh')}</p>
        <p lang="en">${t(L, 'helpEn')}</p>
        <p class="keys">${t(L, 'helpKeys')}</p>
        <button type="button" class="primary" data-dismiss>${t(L, 'dismiss')}</button>
      </div>
    `;
    sync();
  }

  function sync() {
    const state = api.getState();
    const L = state.lang === 'en' ? 'en' : 'zh';
    const playing = state.playing && !state.paused;
    q('#play-btn').textContent = playing ? t(L, 'pause') : (state.paused ? t(L, 'resume') : t(L, 'play'));
    document.getElementById('t-play').textContent = playing ? t(L, 'pause') : (state.paused ? t(L, 'resume') : t(L, 'play'));
    document.getElementById('prev-btn').textContent = t(L, 'prev');
    document.getElementById('next-btn').textContent = t(L, 'next');
    document.getElementById('stop-btn').textContent = t(L, 'stop');
    document.getElementById('restart-btn').textContent = t(L, 'restart');
    q('#parse-btn').textContent = t(L, 'parse');
    q('#perform-now').textContent = t(L, 'performNow');
    q('#load-play').textContent = t(L, 'loadPlay');
    const status = document.getElementById('live-status');
    if (status) status.textContent = liveStatusText(state, L);
    const acts = {
      angrier: 'actAngrier',
      replay: 'actReplay',
      faster: 'actFaster',
      hold: 'actHold',
      ending: 'actEnding',
    };
    const label = document.getElementById('direct-label');
    if (label) label.textContent = t(L, 'directing');
    for (const [act, key] of Object.entries(acts)) {
      const btn = document.querySelector(`#direct [data-act="${act}"]`);
      if (btn) btn.textContent = t(L, key);
    }
    q('#mute-btn').textContent = state.muted ? t(L, 'speechOff') : t(L, 'speechOn');
    q('#mute-btn').setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    q('#sit-btn').textContent = t(L, 'sit');
    q('#download-json').textContent = t(L, 'download');
    const current = state.beatCount ? Math.min(state.beatCount, state.playing || state.paused ? state.beatIndex + 1 : state.beatIndex) : 0;
    document.getElementById('beat-count').textContent = state.beatCount ? `${current} / ${state.beatCount}` : '';
    panel.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.dataset.cam === state.camera);
    });
    for (const id of EXPERIMENT_IDS) {
      const input = panel.querySelector(`[data-exp="${id}"]`);
      if (input) input.checked = Boolean(state.experiments[id]);
    }
    tab.textContent = panel.classList.contains('collapsed') ? (L === 'zh' ? '剧本' : 'Script') : (L === 'zh' ? '收起' : 'Hide');
    const title = document.getElementById('show-title');
    if (title) title.textContent = state.title || '';
  }

  function setSubtitle(payload) {
    if (!payload || !payload.text) {
      const L = lang();
      subtitle.innerHTML = `<p class="sub-idle">${t(L, 'idleLine')}</p>`;
      return;
    }
    const name = document.createElement('span');
    name.className = 'sub-name';
    name.textContent = payload.name || '';
    name.style.color = payload.color || '#f0d48a';
    const line = document.createElement('p');
    line.className = 'sub-line';
    line.textContent = payload.text;
    subtitle.replaceChildren(name, line);
  }

  function setWarnings(list) {
    const ul = q('#warn-list');
    ul.replaceChildren();
    const L = lang();
    for (const item of list || []) {
      const li = document.createElement('li');
      li.textContent = formatWarning(L, item);
      ul.appendChild(li);
    }
  }

  function setJson(perf) {
    q('#json-view').textContent = perf ? performanceToJson(perf) : '';
  }

  function setScript(text) {
    script.value = text;
  }

  function helpOpen(open) {
    help.hidden = !open;
  }

  applyLang();
  return { applyLang, sync, setSubtitle, setWarnings, setJson, setScript, helpOpen, script };
}
