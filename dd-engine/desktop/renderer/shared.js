// ── DD Engine — Shared JS (loaded first by all pages) ──────────────────────────
// IMPORTANT: This file must be loaded BEFORE page-specific scripts.
// It defines all shared globals. Pages call init() at the end of their own script.

// ── Theme ──────────────────────────────────────────────────────────────────────
var CUR_THEME = localStorage.getItem('dd_theme') || 'dark';
var CUR_LANG  = localStorage.getItem('dd_lang')  || 'en';

function applyTheme(t) {
  CUR_THEME = t;
  var el = document.getElementById('__tv__');
  if (!el) {
    el = document.createElement('style');
    el.id = '__tv__';
    document.head.appendChild(el);
  }
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    el.textContent = [
      ':root{',
      '--bg:#f0f2f7!important;',
      '--surf:#ffffff!important;',
      '--surf2:#f4f6fb!important;',
      '--surf3:#edf0f8!important;',
      '--border:#dde1ed!important;',
      '--border2:#c5cbe0!important;',
      '--blue:#2563eb!important;',
      '--blue-d:rgba(37,99,235,.1)!important;',
      '--green:#16a34a!important;',
      '--red:#dc2626!important;',
      '--amber:#d97706!important;',
      '--gold:#b45309!important;',
      '--purple:#7c3aed!important;',
      '--text:#0f172a!important;',
      '--muted:#64748b!important;',
      '--dim:#e2e8f0!important;',
      '}'
    ].join('');
  } else {
    document.documentElement.removeAttribute('data-theme');
    el.textContent = '';
  }
  localStorage.setItem('dd_theme', t);
  var btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = t === 'dark' ? '☀ Light' : '◑ Dark';
}

function toggleTheme() { applyTheme(CUR_THEME === 'dark' ? 'light' : 'dark'); }

function applyLang(l) {
  CUR_LANG = l;
  localStorage.setItem('dd_lang', l);
  var btn = document.getElementById('lang-btn');
  if (btn) btn.textContent = l === 'en' ? '🇫🇷 FR' : '🇬🇧 EN';
}
function toggleLang() { applyLang(CUR_LANG === 'en' ? 'fr' : 'en'); }

// ── Connection ─────────────────────────────────────────────────────────────────
// Migrate old key
(function() {
  var old = localStorage.getItem('pas_connection');
  if (old && !localStorage.getItem('dd_connection')) {
    try {
      var o = JSON.parse(old);
      localStorage.setItem('dd_connection', JSON.stringify({
        anthropicKey: o.apiKey || '', alphacore: o.alphacore || '',
        ddengine: o.ddengine || '', autoops: o.autoops || ''
      }));
    } catch(e) {}
  }
})();

var DD_CONN = {};
try { DD_CONN = JSON.parse(localStorage.getItem('dd_connection') || '{}'); } catch(e) {}

function updateConnectUI() {
  var connected = !!(DD_CONN.anthropicKey || DD_CONN.alphacore);
  var dot  = document.getElementById('connect-dot');
  var lbl  = document.getElementById('connect-label');
  var cbtn = document.querySelector('.connect-btn');
  if (dot)  dot.classList.toggle('on', connected);
  if (lbl)  lbl.textContent = connected ? 'Connected' : 'Connect';
  if (cbtn) cbtn.classList.toggle('connected', connected);
  var fields = { 'cp-anthropic': DD_CONN.anthropicKey, 'cp-ac-url': DD_CONN.alphacore,
                 'cp-dd-url': DD_CONN.ddengine, 'cp-ao-url': DD_CONN.autoops };
  Object.keys(fields).forEach(function(id) {
    var el = document.getElementById(id);
    if (el && fields[id]) el.value = fields[id];
  });
}

function toggleConnect() {
  var p = document.getElementById('connect-panel');
  if (!p) return;
  var open = p.style.display === 'none' || !p.style.display;
  p.style.display = open ? 'block' : 'none';
  if (open) updateConnectUI();
}

function saveConnect() {
  var ak = (document.getElementById('cp-anthropic') || {}).value || '';
  var ac = (document.getElementById('cp-ac-url')    || {}).value || '';
  var dd = (document.getElementById('cp-dd-url')    || {}).value || '';
  var ao = (document.getElementById('cp-ao-url')    || {}).value || '';
  ak = ak.trim(); ac = ac.trim(); dd = dd.trim(); ao = ao.trim();
  var st = document.getElementById('cp-status');
  if (!ak && !ac) {
    if (st) st.innerHTML = '<span style="color:var(--amber)">Add at least an Anthropic API key.</span>';
    return;
  }
  DD_CONN = { anthropicKey: ak, alphacore: ac, ddengine: dd, autoops: ao };
  localStorage.setItem('dd_connection', JSON.stringify(DD_CONN));
  if (window.ddEngine && window.ddEngine.saveApiKey && ak) window.ddEngine.saveApiKey(ak);
  if (window.ddEngine && window.ddEngine.saveConfig) window.ddEngine.saveConfig(DD_CONN);
  updateConnectUI();
  if (st) st.innerHTML = '<span style="color:var(--green)">✓ Saved</span>';
  setTimeout(function() {
    var p = document.getElementById('connect-panel');
    if (p) p.style.display = 'none';
  }, 1400);
}

function clearConnect() {
  DD_CONN = {};
  localStorage.removeItem('dd_connection');
  ['cp-anthropic','cp-ac-url','cp-dd-url','cp-ao-url'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  updateConnectUI();
}

// ── Anthropic API ──────────────────────────────────────────────────────────────
async function getAnthropicKey() {
  if (window.ddEngine && window.ddEngine.getApiKey) {
    var k = await window.ddEngine.getApiKey();
    if (k) return k;
  }
  return DD_CONN.anthropicKey || '';
}

async function callAnthropic(messages, sys, maxTok) {
  var key = await getAnthropicKey();
  if (!key) throw new Error('No Anthropic API key — click Connect and enter your sk-ant-… key.');
  var resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTok || 2500,
      system: sys || 'Return ONLY valid JSON. No markdown fences.',
      messages: messages
    })
  });
  if (!resp.ok) {
    var e = await resp.json().catch(function() { return {}; });
    throw new Error((e.error && e.error.message) || ('API error ' + resp.status));
  }
  var data = await resp.json();
  var text = (data.content || []).map(function(c) { return c.text || ''; }).join('');
  text = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(text); } catch(e) { return { raw: text, parse_error: true }; }
}

// ── Storage ────────────────────────────────────────────────────────────────────
var STORE_KEY = 'dd_reviews_v2';

async function saveReview(entry) {
  // Electron IPC
  if (window.ddEngine && window.ddEngine.saveReview) {
    try { await window.ddEngine.saveReview(entry); } catch(e) {}
  }
  // localStorage
  var all = getAllReviewsLocal();
  var idx = all.findIndex(function(r) { return r.key === entry.key; });
  if (idx !== -1) all[idx] = entry; else all.unshift(entry);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch(e) {}
}

function getAllReviewsLocal() {
  var stored = [];
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch(e) {}
  // Also scan legacy keys
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.startsWith('PAS_DD_') || k.startsWith('pas_dd_'))) {
        try {
          var r = JSON.parse(localStorage.getItem(k));
          if (r && r.key && !stored.find(function(x) { return x.key === r.key; })) stored.push(r);
        } catch(e) {}
      }
    }
  } catch(e) {}
  return stored;
}

async function deleteReviewByKey(key) {
  if (window.ddEngine && window.ddEngine.deleteReview) {
    try { await window.ddEngine.deleteReview(key); } catch(e) {}
  }
  var all = getAllReviewsLocal().filter(function(r) { return r.key !== key; });
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch(e) {}
  try { localStorage.removeItem(key); } catch(e) {}
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function toast(msg, col) {
  var wrap = document.getElementById('toasts');
  if (!wrap) return;
  var d = document.createElement('div');
  d.className = 'toast';
  d.style.borderLeftColor = col || 'var(--green)';
  d.textContent = msg;
  wrap.appendChild(d);
  setTimeout(function() { if (d.parentNode) d.parentNode.removeChild(d); }, 3500);
}

function tag(label, c) {
  c = c || '#4a7cff';
  return '<span class="tag" style="background:' + c + '18;color:' + c + ';border:1px solid ' + c + '44">' + label + '</span>';
}

function recLabel(val) {
  var m = {
    en: { proceed:'Proceed', proceed_with_caution:'Proceed with caution',
          further_diligence_required:'Further diligence', do_not_proceed:'Do not proceed',
          approve:'Approve', reject:'Reject' },
    fr: { proceed:'Approuver', proceed_with_caution:'Approuver avec prudence',
          further_diligence_required:'Diligence supplémentaire', do_not_proceed:'Ne pas investir',
          approve:'Approuver', reject:'Rejeter' }
  };
  var l = CUR_LANG || 'en';
  var norm = (val || '').toLowerCase().replace(/ /g, '_').trim();
  return (m[l] && m[l][norm]) || (m[l] && m[l][val]) || (m.en[norm]) || val || '';
}

// ── Connect panel HTML ─────────────────────────────────────────────────────────
function renderConnectPanel() {
  return '<div class="connect-panel" id="connect-panel" style="display:none">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<div style="font-size:13px;font-weight:700">Company connection</div>' +
      '<button onclick="toggleConnect()" style="font-size:16px;color:var(--muted);line-height:1">&#10005;</button>' +
    '</div>' +
    '<p style="font-size:11px;color:var(--muted);line-height:1.6;margin-bottom:14px">Add your keys to enable live AI analysis. Works offline without them.</p>' +
    '<div style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid var(--border)">AI Analysis</div>' +
    '<div style="margin-bottom:10px"><label class="cp-lbl">Anthropic API key</label><input id="cp-anthropic" type="password" placeholder="sk-ant-..." class="cp-input"></div>' +
    '<div style="font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:12px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--border)">AlphaCore (optional)</div>' +
    '<div style="margin-bottom:8px"><label class="cp-lbl">AlphaCore URL</label><input id="cp-ac-url" placeholder="http://localhost:8080" class="cp-input"></div>' +
    '<div style="margin-bottom:8px"><label class="cp-lbl">DD Engine URL</label><input id="cp-dd-url" placeholder="http://localhost:8081" class="cp-input"></div>' +
    '<div style="margin-bottom:8px"><label class="cp-lbl">AutoOps URL</label><input id="cp-ao-url" placeholder="http://localhost:8082" class="cp-input"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button class="cp-save" onclick="saveConnect()">Save &amp; connect</button>' +
      '<button class="cp-cancel" onclick="toggleConnect()">Cancel</button>' +
      '<button class="cp-clear" onclick="clearConnect()">Disconnect</button>' +
    '</div>' +
    '<div id="cp-status" style="font-size:11px;margin-top:8px"></div>' +
  '</div>';
}

function renderNav(active) {
  var pages = [
    ['documents.html', '◆ Documents'],
    ['intake.html',    '＋ New Intake'],
    ['reviews.html',   '📄 DD Reviews']
  ];
  var links = pages.map(function(p) {
    return '<a class="nav-item' + (p[0] === active ? ' active' : '') + '" href="' + p[0] + '">' + p[1] + '</a>';
  }).join('\n');
  return '<nav class="topnav">' +
    '<div class="nav-brand"><span class="nav-logo">DD Engine</span><span class="nav-sep">|</span><span class="nav-sub">Automated Due Diligence</span></div>' +
    '<div class="nav-links">' + links + '</div>' +
    '<div class="nav-right">' +
      '<button id="theme-btn" class="tl-btn" onclick="toggleTheme()">☀ Light</button>' +
      '<button id="lang-btn"  class="tl-btn" onclick="toggleLang()">🇫🇷 FR</button>' +
      '<div class="connect-btn" onclick="toggleConnect()">' +
        '<span class="connect-dot" id="connect-dot"></span>' +
        '<span id="connect-label">Connect</span>' +
        '<span style="font-size:10px;opacity:.6">&#9660;</span>' +
      '</div>' +
    '</div>' +
  '</nav>' + renderConnectPanel();
}
