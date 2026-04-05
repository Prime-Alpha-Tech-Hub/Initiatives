import { useState, useEffect, useCallback } from 'react';
import { dealsApi, ddApi, committeeApi, portfolioApi, docsApi, accountsApi, reportingApi, knowledgeApi } from './utils/api';
import { SignUpPage, SignInPage, OnboardingWizard, PendingApprovalScreen } from './pages/Auth.jsx';
import MembersPage from './pages/Members.jsx';
import { useStore } from './store/index';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// ── Design tokens ─────────────────────────────────────────────────────────────
const THEME = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&family=DM+Mono:wght@300;400;500&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #0b0e17;
  --surface:  #111520;
  --surface2: #161b2a;
  --border:   #1e2540;
  --border2:  #252d45;
  --blue:     #3b6bff;
  --blue-dim: rgba(59,107,255,0.12);
  --blue-glow:rgba(59,107,255,0.25);
  --gold:     #f8ce56;
  --gold-dim: rgba(248,206,86,0.12);
  --green:    #2dd4a0;
  --red:      #ff4d6a;
  --amber:    #f8a742;
  --text:     #e2e8f8;
  --muted:    #6b7599;
  --dimmer:   #3a4263;
  --ff:       'DM Sans', sans-serif;
  --ffm:      'DM Mono', monospace;
  --r:        6px;
  --rl:       10px;
  --sh:       0 2px 12px rgba(0,0,0,0.4);
  --sh-lg:    0 8px 40px rgba(0,0,0,0.6);
}

html, body, #root { height: 100%; font-family: var(--ff); background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.55; -webkit-font-smoothing: antialiased; }
button { cursor: pointer; border: none; background: none; font-family: inherit; color: inherit; }
input, textarea, select { font-family: inherit; color: var(--text); background: var(--surface2); border: 1px solid var(--border); border-radius: var(--r); padding: 9px 12px; outline: none; width: 100%; font-size: 13px; }
input:focus, textarea:focus, select:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-dim); }
a { color: inherit; text-decoration: none; }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--surface); }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

@keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes spin   { to { transform: rotate(360deg); } }
.fade-up { animation: fadeUp 0.3s ease both; }
.fade-in { animation: fadeIn 0.2s ease both; }
`;

// ── Light theme CSS vars ──────────────────────────────────────────────────────
const THEME_LIGHT = `
  :root {
    --bg:       #f0f2f7;
    --surface:  #ffffff;
    --surface2: #f4f6fb;
    --border:   #dde1ed;
    --border2:  #c5cbe0;
    --blue:     #2563eb;
    --blue-dim: rgba(37,99,235,.1);
    --green:    #16a34a;
    --red:      #dc2626;
    --amber:    #d97706;
    --gold:     #b45309;
    --purple:   #7c3aed;
    --text:     #0f172a;
    --muted:    #64748b;
    --dimmer:   #94a3b8;
    --sh-lg:    0 4px 24px rgba(0,0,0,.12);
  }
  body { color-scheme: light; }
`;

// ── i18n strings ──────────────────────────────────────────────────────────────
const I18N = {
  en: {
    dashboard:'Dashboard', deals:'Deal Pipeline', diligence:'Due Diligence',
    committee:'IC Workflow', reporting:'Reporting', portfolio:'Portfolio',
    documents:'Documents', knowledge:'Knowledge', members:'Team & Access',
    integrations:'Integrations', apikeys:'API Keys',
    myProfile:'My Profile', signOut:'Sign Out',
    firmDashboard:'Firm Dashboard', language:'Language', theme:'Theme',
    light:'Light', dark:'Dark', english:'English', french:'French',
    settings:'Settings',
  },
  fr: {
    dashboard:'Tableau de bord', deals:'Pipeline deals', diligence:'Due Diligence',
    committee:'Comité IC', reporting:'Rapports', portfolio:'Portefeuille',
    documents:'Documents', knowledge:'Base de connaissances', members:'Équipe & Accès',
    integrations:'Intégrations', apikeys:'Clés API',
    myProfile:'Mon profil', signOut:'Déconnexion',
    firmDashboard:'Tableau de bord', language:'Langue', theme:'Thème',
    light:'Clair', dark:'Sombre', english:'Anglais', french:'Français',
    settings:'Paramètres',
  },
};


// ── Style tokens ──────────────────────────────────────────────────────────────
const S = {
  btnP:  { background:'var(--blue)', color:'#fff', padding:'8px 18px', borderRadius:'var(--r)', fontWeight:600, fontSize:13, cursor:'pointer', border:'none', whiteSpace:'nowrap', transition:'opacity 0.15s' },
  btnO:  { background:'transparent', color:'var(--blue)', border:'1.5px solid var(--blue)', padding:'7px 18px', borderRadius:'var(--r)', fontWeight:600, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' },
  btnG:  { background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'7px 16px', borderRadius:'var(--r)', fontSize:13, cursor:'pointer' },
  btnD:  { background:'rgba(255,77,106,0.15)', color:'var(--red)', border:'1px solid rgba(255,77,106,0.3)', padding:'7px 16px', borderRadius:'var(--r)', fontSize:13, cursor:'pointer' },
  card:  { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rl)', padding:20, boxShadow:'var(--sh)' },
  lbl:   { display:'block', fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', marginBottom:6, fontWeight:600 },
  tag:   (c='var(--blue)', bg='var(--blue-dim)') => ({ display:'inline-flex', alignItems:'center', background:bg, color:c, border:`1px solid ${c}33`, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', whiteSpace:'nowrap' }),
  hdg:   { fontWeight:700, color:'var(--text)', letterSpacing:'-0.2px' },
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmt$ = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', notation:'compact', maximumFractionDigits:1 }).format(n);
const fmtPct = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;
const uid = () => Math.random().toString(36).slice(2,9);

const STRATEGY_LABELS = { pe:'Private Equity', private_credit:'Private Credit', commodities:'Commodities', real_estate:'Real Estate' };
const STRATEGY_COLORS = { pe:'#3b6bff', private_credit:'#2dd4a0', commodities:'#f8ce56', real_estate:'#f8a742' };
const STAGE_LABELS = { sourcing:'Sourcing', screening:'Screening', due_diligence:'Due Diligence', ic_review:'IC Review', negotiation:'Negotiation', closed_won:'Closed ✓', closed_lost:'Closed ✗', on_hold:'On Hold' };
const STAGE_COLORS = { sourcing:'var(--muted)', screening:'var(--blue)', due_diligence:'var(--amber)', ic_review:'var(--gold)', negotiation:'#a78bfa', closed_won:'var(--green)', closed_lost:'var(--red)', on_hold:'var(--dimmer)' };

// ── Shared components ─────────────────────────────────────────────────────────
function Spinner({ size=28 }) {
  return <div style={{ width:size, height:size, border:'3px solid var(--border)', borderTop:`3px solid var(--blue)`, borderRadius:'50%', animation:'spin 0.7s linear infinite', flexShrink:0 }} />;
}

function Inp({ label, ...p }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={S.lbl}>{label}</label>}
      <input {...p} />
    </div>
  );
}

function Sel({ label, options, ...p }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={S.lbl}>{label}</label>}
      <select {...p}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  );
}

function TA({ label, ...p }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={S.lbl}>{label}</label>}
      <textarea style={{ minHeight:88, resize:'vertical' }} {...p} />
    </div>
  );
}

function Modal({ open, onClose, title, width=600, children }) {
  if (!open) return null;
  return (
    <div className="fade-in" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div className="fade-up" style={{ ...S.card, maxWidth:width, width:'100%', maxHeight:'90vh', overflowY:'auto', padding:28 }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, paddingBottom:14, borderBottom:'1px solid var(--border)' }}>
          <h3 style={{ ...S.hdg, fontSize:17 }}>{title}</h3>
          <button onClick={onClose} style={{ color:'var(--muted)', fontSize:18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => {
        const c = t.type === 'error' ? 'var(--red)' : t.type === 'warning' ? 'var(--amber)' : 'var(--green)';
        return (
          <div key={t.id} className="fade-up" style={{ background:'var(--surface)', border:`1px solid ${c}44`, borderLeft:`3px solid ${c}`, padding:'10px 16px', borderRadius:'var(--r)', fontSize:13, fontWeight:500, maxWidth:320, boxShadow:'var(--sh)' }}>
            {t.msg}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, accent, trend }) {
  const c = accent ? 'var(--blue)' : 'var(--text)';
  return (
    <div style={{ ...S.card, borderTop:`2px solid ${accent ? 'var(--blue)' : 'var(--border)'}` }}>
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:'var(--ffm)', fontSize:26, fontWeight:600, color:c, letterSpacing:'-0.5px', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'var(--muted)', marginTop:6 }}>{sub}</div>}
      {trend != null && <div style={{ fontSize:12, fontWeight:700, color: trend >= 0 ? 'var(--green)' : 'var(--red)', marginTop:4 }}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%</div>}
    </div>
  );
}

function PageHeader({ title, sub, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
      <div>
        <h1 style={{ fontSize:24, fontWeight:700, letterSpacing:'-0.4px', marginBottom:4 }}>{title}</h1>
        {sub && <p style={{ color:'var(--muted)', fontSize:13 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginPage() {
  const [form, setForm] = useState({ username:'', password:'' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const login = useStore(s => s.login);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await login(form.username, form.password);
    } catch {
      setError('Invalid credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Left panel */}
      <div style={{ width:420, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', justifyContent:'space-between', padding:52 }}>
        <div>
          <div style={{ fontFamily:'var(--ffm)', fontSize:13, fontWeight:600, color:'var(--blue)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:48 }}>AlphaCore</div>
          <h1 style={{ fontSize:38, fontWeight:700, lineHeight:1.1, letterSpacing:'-1px', marginBottom:16 }}>Central Investment<br/>Data Platform</h1>
          <p style={{ color:'var(--muted)', lineHeight:1.8, fontSize:14 }}>One system for your entire investment operation — deal pipeline, due diligence, IC workflow, portfolio monitoring, and document repository.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {[['5', 'Modules'],['15', 'Initiatives'],['4', 'Strategies'],['∞', 'Scale']].map(([v,l]) => (
            <div key={l} style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'14px 16px', border:'1px solid var(--border)' }}>
              <div style={{ fontFamily:'var(--ffm)', fontSize:22, fontWeight:600, color:'var(--blue)' }}>{v}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Right panel */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:'100%', maxWidth:380 }} className="fade-up">
          <h2 style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>Sign in</h2>
          <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>Enter your credentials to access the platform.</p>
          <Inp label="Username / Email" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} placeholder="analyst@firm.com" />
          <Inp label="Password" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="••••••••" />
          {error && <div style={{ color:'var(--red)', fontSize:13, marginBottom:14, padding:'8px 12px', background:'rgba(255,77,106,0.1)', borderRadius:'var(--r)', border:'1px solid rgba(255,77,106,0.25)' }}>{error}</div>}
          <button style={{ ...S.btnP, width:'100%', padding:'11px', fontSize:14 }} onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
          <div style={{ marginTop:20, padding:12, background:'var(--surface2)', borderRadius:'var(--r)', fontSize:12, color:'var(--muted)', border:'1px solid var(--border)' }}>
            <strong style={{ color:'var(--text)' }}>Default admin:</strong> admin / admin123
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
const NAV = [
  { key:'dashboard',  icon:'⬡', label:'Dashboard',           labelKey:'dashboard'  },
  { key:'deals',      icon:'◈', label:'Deal Pipeline',        labelKey:'deals'      },
  { key:'diligence',  icon:'◎', label:'Due Diligence',        labelKey:'diligence'  },
  { key:'committee',  icon:'⊞', label:'IC Workflow',          labelKey:'committee'  },
  { key:'reporting',  icon:'⊙', label:'Reporting',            labelKey:'reporting'  },
  { key:'portfolio',  icon:'◉', label:'Portfolio',            labelKey:'portfolio'  },
  { key:'documents',  icon:'◧', label:'Documents',            labelKey:'documents'  },
  { key:'knowledge',  icon:'◎', label:'Knowledge',            labelKey:'knowledge'  },
  { key:'members',    icon:'◈', label:'Team & Access',        labelKey:'members'    },
];

function Sidebar({ active, setActive, user, logout, company, membership, theme, setTheme, lang, setLang, t }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name     = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'User';
  const role     = membership?.role_label || membership?.role_name
    || (typeof membership?.role === 'string' ? membership.role : membership?.role?.label)
    || 'Member';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);

  const menuItems = [
    { icon:'◎', label:'My Profile',   key:'profile'      },
    { icon:'◈', label:'Team & Access',key:'members'      },
    { icon:'⬡', label:'Integrations', key:'integrations' },
    { icon:'⊙', label:'API Keys',     key:'apikeys'      },
  ];

  return (
    <div style={{ width:220, background:'var(--surface)', borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column', position:'fixed', top:0, bottom:0, left:0,
      zIndex:100, overflow:'visible' }}>

      {/* Logo */}
      <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--blue)',
          letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:4 }}>AlphaCore</div>
        {company && (
          <div style={{ fontSize:12, color:'var(--text)', fontWeight:600,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{company.name}</div>
        )}
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>Investment Platform</div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        {NAV.map(n => (
          <button key={n.key} onClick={() => setActive(n.key)} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
            padding:'9px 12px', borderRadius:'var(--r)', marginBottom:2,
            color:      active === n.key ? 'var(--blue)' : 'var(--muted)',
            background: active === n.key ? 'var(--blue-dim)' : 'none',
            borderLeft: active === n.key ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize:13, fontWeight: active === n.key ? 600 : 400,
            transition:'all 0.12s', border:'none', cursor:'pointer',
          }}>
            <span style={{ fontSize:14 }}>{n.icon}</span>{t ? t(n.labelKey || n.key) : n.label}
          </button>
        ))}
      </nav>

      {/* Profile area — popup rendered in a portal via fixed positioning */}
      <div style={{ padding:'10px', borderTop:'1px solid var(--border)', flexShrink:0 }}>

        {/* Popup — absolutely positioned relative to viewport bottom-left */}
        {menuOpen && (
          <>
            {/* Invisible overlay to catch outside clicks */}
            <div
              style={{ position:'fixed', inset:0, zIndex:9998 }}
              onClick={() => setMenuOpen(false)}
            />
            {/* Menu card */}
            <div style={{
              position:'fixed', bottom:64, left:8, width:214,
              background:'var(--surface2)', border:'1px solid var(--border)',
              borderRadius:10, overflow:'hidden',
              boxShadow:'0 -4px 32px rgba(0,0,0,.6)', zIndex:9999,
            }}>
              {/* Identity */}
              <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)',
                background:'var(--surface)' }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{user?.email || ''}</div>
                <div style={{ display:'inline-block', fontSize:10, color:'var(--blue)',
                  background:'var(--blue-dim)', padding:'2px 7px', borderRadius:4,
                  marginTop:5, fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'0.06em' }}>{role}</div>
              {/* Theme + Language toggles */}
              <div style={{ display:'flex', gap:6, padding:'8px 14px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                <button
                  onClick={() => setTheme && setTheme(v => v === 'dark' ? 'light' : 'dark')}
                  style={{ flex:1, padding:'5px 0', fontSize:11, borderRadius:4,
                    border:'1px solid var(--border)', background:'var(--surface2)',
                    color:'var(--muted)', cursor:'pointer' }}>
                  {theme === 'dark' ? '☀ Light' : '◑ Dark'}
                </button>
                <button
                  onClick={() => setLang && setLang(v => v === 'en' ? 'fr' : 'en')}
                  style={{ flex:1, padding:'5px 0', fontSize:11, borderRadius:4,
                    border:'1px solid var(--border)', background:'var(--surface2)',
                    color:'var(--muted)', cursor:'pointer' }}>
                  {lang === 'en' ? '🇫🇷 FR' : '🇬🇧 EN'}
                </button>
              </div>
              {/* Items */}
              {menuItems.map(item => (
                <button key={item.key}
                  onClick={() => { setActive(item.key); setMenuOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:10, width:'100%',
                    textAlign:'left', padding:'10px 14px', fontSize:13, color:'var(--text)',
                    background:'none', border:'none', borderBottom:'1px solid var(--border)',
                    cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}>
                  <span style={{ fontSize:13, color:'var(--muted)', width:18,
                    textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%',
                  textAlign:'left', padding:'10px 14px', fontSize:13, color:'var(--red)',
                  background:'none', border:'none', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,.06)'}
                onMouseLeave={e => e.currentTarget.style.background='none'}>
                <span style={{ fontSize:13, width:18, textAlign:'center', flexShrink:0 }}>⬡</span>
                Sign Out
              </button>
            </div>
          </>
        )}

        {/* User row button */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px',
            borderRadius:'var(--r)', border:'none', cursor:'pointer',
            background: menuOpen ? 'var(--blue-dim)' : 'var(--surface2)',
            transition:'background 0.12s' }}>
          <div style={{ width:32, height:32, background:'var(--blue)', borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text)',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{role}</div>
          </div>
          <span style={{ fontSize:9, color:'var(--muted)', flexShrink:0 }}>
            {menuOpen ? '▲' : '▼'}
          </span>
        </button>
      </div>
    </div>
  );
}


// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const [pipeline, setPipeline] = useState(null);
  const [portSummary, setPortSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [memos, setMemos] = useState([]);

  useEffect(() => {
    dealsApi.pipeline().then(r => setPipeline(r.data));
    portfolioApi.summary().then(r => setPortSummary(r.data));
    portfolioApi.alerts({ status:'open' }).then(r => setAlerts(r.data.results || r.data));
    committeeApi.list({ status:'voting' }).then(r => setMemos(r.data.results || r.data));
  }, []);

  const byStrategy = pipeline ? Object.entries(STRATEGY_LABELS).map(([key, label]) => ({
    name: label,
    count: pipeline.filter(p => p.strategy === key).reduce((s, p) => s + p.count, 0),
    value: pipeline.filter(p => p.strategy === key).reduce((s, p) => s + (p.total_size || 0), 0),
    color: STRATEGY_COLORS[key],
  })) : [];

  return (
    <div className="fade-up">
      <PageHeader title="Firm Dashboard" sub={new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} />

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        <StatCard label="Portfolio AUM" value={portSummary ? fmt$(portSummary.total_current) : '—'} sub="Current NAV" accent />
        <StatCard label="Total Return" value={portSummary ? fmtPct(portSummary.total_return_pct) : '—'} trend={portSummary?.total_return_pct} />
        <StatCard label="Active Deals" value={pipeline ? pipeline.reduce((s,p) => s + p.count, 0) : '—'} sub="Across all strategies" />
        <StatCard label="Open Alerts" value={portSummary?.open_alerts ?? '—'} sub="Require attention" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:14, marginBottom:14 }}>
        {/* Pipeline by strategy — horizontal rows, no chart library */}
        <div style={{ ...S.card, padding:'12px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, marginBottom:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Pipeline by Strategy</div>
          {byStrategy.length ? (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {(() => {
                const maxCount = Math.max(...byStrategy.map(s => s.count), 1);
                return byStrategy.map((s, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:80, fontSize:11, color:'var(--muted)', flexShrink:0, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name}</div>
                    <div style={{ flex:1, background:'var(--border)', borderRadius:3, height:8, position:'relative' }}>
                      <div style={{ position:'absolute', left:0, top:0, bottom:0, borderRadius:3,
                        width:`${Math.max(s.count/maxCount*100, s.count > 0 ? 4 : 0)}%`,
                        background:s.color, transition:'width .5s ease' }} />
                    </div>
                    <div style={{ width:24, fontFamily:'var(--ffm)', fontSize:12, fontWeight:700, color:s.color, flexShrink:0 }}>{s.count}</div>
                  </div>
                ));
              })()}
            </div>
          ) : <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>}
        </div>

        {/* AUM allocation — compact inline */}
        <div style={{ ...S.card, padding:'12px 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, marginBottom:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>AUM Allocation</div>
          {portSummary ? (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={Object.entries(portSummary.by_strategy).map(([k,v]) => ({ name: STRATEGY_LABELS[k] || k, value: v.current, color: STRATEGY_COLORS[k] || '#3b6bff' }))} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={2} dataKey="value">
                    {Object.keys(portSummary.by_strategy).map((k, i) => <Cell key={i} fill={STRATEGY_COLORS[k] || '#3b6bff'} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt$(v)} contentStyle={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                {Object.entries(portSummary.by_strategy).map(([k,v]) => {
                  const total = Object.values(portSummary.by_strategy).reduce((s,x) => s + (x.current||0), 0);
                  const pct = total > 0 ? Math.round((v.current||0)/total*100) : 0;
                  return (
                    <div key={k} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:STRATEGY_COLORS[k], flexShrink:0 }} />
                      <span style={{ fontSize:10, color:'var(--muted)', flex:1 }}>{STRATEGY_LABELS[k]}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--text)' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <div style={{ height:100, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>
        {/* IC memos pending vote */}
        <div style={S.card}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:14, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>IC Memos — Voting Open</div>
          {memos.length === 0 ? <p style={{ color:'var(--muted)', fontSize:13 }}>No memos pending vote.</p> : memos.map(m => (
            <div key={m.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:3 }}>{m.title}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{m.prepared_by_name} · {fmt$(m.recommended_amount)}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <span style={S.tag('var(--green)')}>{m.vote_summary?.approve} ✓</span>
                <span style={S.tag('var(--red)')}>{m.vote_summary?.reject} ✗</span>
              </div>
            </div>
          ))}
        </div>

        {/* Open alerts */}
        <div style={S.card}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:14, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Portfolio Alerts</div>
          {alerts.length === 0 ? <p style={{ color:'var(--muted)', fontSize:13 }}>No open alerts.</p> : alerts.slice(0,5).map(a => {
            const c = a.severity === 'critical' ? 'var(--red)' : a.severity === 'warning' ? 'var(--amber)' : 'var(--blue)';
            return (
              <div key={a.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
                  <span style={S.tag(c)}>{a.severity}</span>
                  <span style={{ fontWeight:600, fontSize:13 }}>{a.title}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{a.detail}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── DEAL PIPELINE ─────────────────────────────────────────────────────────────
function DealPipeline({ toast }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ strategy:'', stage:'', search:'' });
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name:'', strategy:'pe', stage:'sourcing', sector:'', geography:'', deal_size:'', equity_check:'', summary:'', investment_thesis:'', key_risks:'', company_name:'', contact_email:'' });

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter.strategy) params.strategy = filter.strategy;
    if (filter.stage)    params.stage    = filter.stage;
    if (filter.search)   params.search   = filter.search;
    dealsApi.list(params).then(r => { setDeals(r.data.results || r.data); setLoading(false); });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await dealsApi.create(form);
      setShowAdd(false);
      toast('Deal created.');
      load();
    } catch { toast('Failed to create deal.', 'error'); }
  };

  // Group by stage for kanban view
  const stages = ['sourcing', 'screening', 'due_diligence', 'ic_review', 'negotiation', 'closed_won'];
  const grouped = stages.reduce((acc, s) => { acc[s] = deals.filter(d => d.stage === s); return acc; }, {});

  return (
    <div className="fade-up">
      <PageHeader title="Deal Pipeline" sub={`${deals.length} active deals`}
        action={<button style={S.btnP} onClick={() => setShowAdd(true)}>+ New Deal</button>} />

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        <input value={filter.search} onChange={e => setFilter(f => ({...f, search:e.target.value}))} placeholder="Search deals…" style={{ width:220 }} />
        <select value={filter.strategy} onChange={e => setFilter(f => ({...f, strategy:e.target.value}))} style={{ width:160 }}>
          <option value="">All Strategies</option>
          {Object.entries(STRATEGY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.stage} onChange={e => setFilter(f => ({...f, stage:e.target.value}))} style={{ width:160 }}>
          <option value="">All Stages</option>
          {Object.entries(STAGE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner /></div>
      ) : (
        /* Kanban board */
        <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:12 }}>
          {stages.map(stage => (
            <div key={stage} style={{ minWidth:240, flex:'0 0 240px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:STAGE_COLORS[stage], flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{STAGE_LABELS[stage]}</span>
                <span style={{ fontSize:11, color:'var(--dimmer)', marginLeft:'auto' }}>{grouped[stage].length}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {grouped[stage].map(d => (
                  <div key={d.id} onClick={() => setSelected(d)} style={{ ...S.card, padding:14, cursor:'pointer', borderLeft:`3px solid ${STRATEGY_COLORS[d.strategy] || 'var(--border)'}`, transition:'box-shadow 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 20px rgba(59,107,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow='var(--sh)'}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:5 }}>{d.name}</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                      <span style={S.tag(STRATEGY_COLORS[d.strategy], `${STRATEGY_COLORS[d.strategy]}18`)}>{STRATEGY_LABELS[d.strategy]}</span>
                    </div>
                    {d.deal_size && <div style={{ fontFamily:'var(--ffm)', fontSize:12, color:'var(--blue)' }}>{fmt$(d.deal_size)}</div>}
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{d.lead_analyst_name || 'Unassigned'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add deal modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Deal" width={640}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}><Inp label="Deal Name *" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))} /></div>
          <Sel label="Strategy" value={form.strategy} onChange={e => setForm(f => ({...f, strategy:e.target.value}))} options={Object.entries(STRATEGY_LABELS).map(([k,v]) => ({value:k,label:v}))} />
          <Sel label="Stage" value={form.stage} onChange={e => setForm(f => ({...f, stage:e.target.value}))} options={Object.entries(STAGE_LABELS).map(([k,v]) => ({value:k,label:v}))} />
          <Inp label="Sector" value={form.sector} onChange={e => setForm(f => ({...f, sector:e.target.value}))} />
          <Inp label="Geography" value={form.geography} onChange={e => setForm(f => ({...f, geography:e.target.value}))} />
          <Inp label="Deal Size (USD)" type="number" value={form.deal_size} onChange={e => setForm(f => ({...f, deal_size:e.target.value}))} />
          <Inp label="Equity Check (USD)" type="number" value={form.equity_check} onChange={e => setForm(f => ({...f, equity_check:e.target.value}))} />
          <Inp label="Company Name" value={form.company_name} onChange={e => setForm(f => ({...f, company_name:e.target.value}))} />
          <Inp label="Contact Email" type="email" value={form.contact_email} onChange={e => setForm(f => ({...f, contact_email:e.target.value}))} />
          <div style={{ gridColumn:'1/-1' }}><TA label="Summary" value={form.summary} onChange={e => setForm(f => ({...f, summary:e.target.value}))} /></div>
          <div style={{ gridColumn:'1/-1' }}><TA label="Investment Thesis" value={form.investment_thesis} onChange={e => setForm(f => ({...f, investment_thesis:e.target.value}))} /></div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button style={S.btnP} onClick={create}>Create Deal</button>
          <button style={S.btnG} onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Deal detail modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={selected.name} width={700}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
            <span style={S.tag(STRATEGY_COLORS[selected.strategy], `${STRATEGY_COLORS[selected.strategy]}18`)}>{STRATEGY_LABELS[selected.strategy]}</span>
            <span style={S.tag(STAGE_COLORS[selected.stage])}>{STAGE_LABELS[selected.stage]}</span>
            {selected.deal_size && <span style={S.tag('var(--gold)','var(--gold-dim)')}>{fmt$(selected.deal_size)}</span>}
          </div>
          {[['Sector', selected.sector], ['Geography', selected.geography], ['Equity Check', fmt$(selected.equity_check)], ['Analyst', selected.lead_analyst_name]].map(([k,v]) => v ? (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
              <span style={{ color:'var(--muted)' }}>{k}</span>
              <span style={{ fontWeight:500 }}>{v}</span>
            </div>
          ) : null)}
          {selected.summary && <div style={{ marginTop:16 }}><div style={S.lbl}>Summary</div><p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.75 }}>{selected.summary}</p></div>}
          {selected.investment_thesis && <div style={{ marginTop:14 }}><div style={S.lbl}>Investment Thesis</div><p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.75 }}>{selected.investment_thesis}</p></div>}
        </Modal>
      )}
    </div>
  );
}

// ── DUE DILIGENCE ─────────────────────────────────────────────────────────────
function DueDiligence({ toast }) {
  const [deals, setDeals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dealsApi.list({ stage:'due_diligence' }).then(r => { setDeals(r.data.results || r.data); setLoading(false); });
  }, []);

  const loadChecklist = async (deal) => {
    setSelected(deal);
    setChecklist(null);
    try {
      const r = await ddApi.getChecklist(deal.id);
      const items = r.data.results || r.data;
      if (items.length) { setChecklist(items[0]); }
      else {
        const created = await ddApi.createFromDeal(deal.id);
        setChecklist(created.data);
      }
    } catch { toast('Failed to load checklist.', 'error'); }
  };

  const openInDDEngine = async (deal) => {
    // Get integration config from localStorage (set by IntegrationsPage)
    const ddUrl = localStorage.getItem('alphacore_dd_engine_url');
    if (ddUrl) {
      // POST deal context to connected DD Engine instance
      try {
        await fetch(`${ddUrl}/dd/api/documents/deal_context/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deal_id: deal.id, deal_name: deal.name,
            strategy: deal.strategy, stage: deal.stage,
          }),
        });
        window.open(`${ddUrl}/dd/demo.html`, '_blank');
      } catch {
        window.open(`${ddUrl}/dd/demo.html`, '_blank');
      }
    } else {
      // Standalone — open local demo file
      window.open('/dd-engine/demo.html', '_blank');
    }
  };

  const toggleItem = async (item) => {
    const newStatus = item.status === 'complete' ? 'pending' : 'complete';
    await ddApi.updateItem(item.id, { status: newStatus });
    setChecklist(c => ({ ...c, items: c.items.map(i => i.id === item.id ? {...i, status:newStatus} : i) }));
  };

  const CATEGORY_COLORS = { financial:'var(--blue)', legal:'var(--amber)', commercial:'var(--green)', operational:'var(--gold)', esg:'#2dd4a0', technical:'#a78bfa', other:'var(--muted)' };

  const completion = checklist ? Math.round((checklist.items?.filter(i => i.status === 'complete').length / (checklist.items?.length || 1)) * 100) : 0;

  return (
    <div className="fade-up">
      <PageHeader title="Due Diligence" sub="Checklists, findings, and AI-powered analysis via DD Engine" />
      <DDEngineConnectionBanner />
      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:18, height:'calc(100vh - 160px)' }}>
        {/* Deal list */}
        <div style={{ ...S.card, overflowY:'auto' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Deals in DD</div>
          {loading ? <Spinner /> : deals.length === 0 ? <p style={{ color:'var(--muted)', fontSize:13 }}>No deals in due diligence.</p> : deals.map(d => (
            <div key={d.id} style={{ borderRadius:'var(--r)', marginBottom:4,
              background: selected?.id === d.id ? 'var(--blue-dim)' : 'none',
              borderLeft: selected?.id === d.id ? '2px solid var(--blue)' : '2px solid transparent',
              transition:'all 0.12s' }}>
              <div onClick={() => loadChecklist(d)} style={{ padding:'10px 12px', cursor:'pointer' }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{d.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{STRATEGY_LABELS[d.strategy]}</div>
              </div>
              <div style={{ padding:'0 12px 8px', display:'flex', gap:5 }}>
                <button style={{ ...S.btnG, fontSize:10, padding:'3px 9px' }}
                  onClick={() => openInDDEngine(d)}>
                  ◎ DD Engine
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Checklist */}
        {!selected ? (
          <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
            Select a deal to view its due diligence checklist.
          </div>
        ) : !checklist ? (
          <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>
        ) : (
          <div style={{ ...S.card, overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:700 }}>{selected.name}</h3>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{checklist.items?.length || 0} items · {completion}% complete</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'var(--ffm)', fontSize:24, fontWeight:600, color: completion === 100 ? 'var(--green)' : 'var(--blue)' }}>{completion}%</div>
                <div style={{ height:4, width:80, background:'var(--border)', borderRadius:2, marginTop:4 }}>
                  <div style={{ width:`${completion}%`, height:'100%', background: completion === 100 ? 'var(--green)' : 'var(--blue)', borderRadius:2, transition:'width 0.5s' }} />
                </div>
              </div>
            </div>

            {Object.entries(
              (checklist.items || []).reduce((acc, item) => {
                if (!acc[item.category]) acc[item.category] = [];
                acc[item.category].push(item);
                return acc;
              }, {})
            ).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:CATEGORY_COLORS[cat] || 'var(--muted)', flexShrink:0 }} />
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{cat}</span>
                </div>
                {items.map(item => (
                  <div key={item.id} onClick={() => toggleItem(item)} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 12px', borderRadius:'var(--r)', cursor:'pointer', marginBottom:3, background: item.status === 'complete' ? 'rgba(45,212,160,0.06)' : 'var(--surface2)', border:`1px solid ${item.status === 'complete' ? 'rgba(45,212,160,0.2)' : 'var(--border)'}`, transition:'all 0.15s' }}>
                    <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${item.status === 'complete' ? 'var(--green)' : 'var(--border2)'}`, background: item.status === 'complete' ? 'var(--green)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, color:'#000', fontWeight:700 }}>
                      {item.status === 'complete' ? '✓' : ''}
                    </div>
                    <span style={{ fontSize:13, flex:1, textDecoration: item.status === 'complete' ? 'line-through' : 'none', color: item.status === 'complete' ? 'var(--muted)' : 'var(--text)' }}>{item.title}</span>
                    <span style={S.tag(item.priority === 'high' ? 'var(--red)' : item.priority === 'medium' ? 'var(--amber)' : 'var(--muted)')}>{item.priority}</span>
                  </div>
                ))}
              </div>
            ))}

            {/* Findings */}
            {(checklist.findings || []).length > 0 && (
              <div style={{ marginTop:20, paddingTop:20, borderTop:'1px solid var(--border)' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Findings</div>
                {checklist.findings.map(f => (
                  <div key={f.id} style={{ ...S.card, marginBottom:8, padding:12, borderLeft:`3px solid ${f.severity === 'critical' ? 'var(--red)' : f.severity === 'high' ? 'var(--amber)' : 'var(--blue)'}` }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                      <span style={S.tag(f.severity === 'critical' ? 'var(--red)' : 'var(--amber)')}>{f.severity}</span>
                      <strong style={{ fontSize:13 }}>{f.title}</strong>
                    </div>
                    <p style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>{f.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── IC WORKFLOW ───────────────────────────────────────────────────────────────
function ICWorkflow({ toast }) {
  const [memos, setMemos]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [tab, setTab]             = useState('overview');
  const [filterStatus, setFilter] = useState('all');
  const [search, setSearch]       = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showDecide, setShowDecide] = useState(false);
  const [deals, setDeals]         = useState([]);
  const [members, setMembers]     = useState([]);
  const [voteRationale, setVoteRationale] = useState('');
  const [showVoteBox, setShowVoteBox]     = useState(false);
  const [comment, setComment]     = useState('');
  const [isDissent, setIsDissent] = useState(false);
  const user = useStore(s => s.user);

  const BLANK = {
    deal:'', title:'', memo_type:'initial', recommended_amount:'',
    executive_summary:'', investment_thesis:'', transaction_summary:'',
    financial_analysis:'', risk_factors:'', esg_considerations:'', recommendation:'',
    quorum_required: 3,
  };
  const [form, setForm]       = useState(BLANK);
  const [formStep, setFormStep] = useState(0);
  const [submitForm, setSubmitForm] = useState({ member_ids:[], deadline:'', quorum_required:3 });
  const [decideForm, setDecideForm] = useState({ decision:'approved', approved_amount:'', conditions:'' });

  const STATUS_COLOR = {
    draft:'var(--muted)', submitted:'var(--blue)', voting:'var(--amber)',
    approved:'var(--green)', rejected:'var(--red)', deferred:'var(--gold)', withdrawn:'var(--muted)',
  };
  const MEMO_TYPE_LABEL = {
    initial:'Initial Investment', follow_on:'Follow-on', exit:'Exit Approval',
    write_off:'Write-off', amendment:'Amendment',
  };

  const load = () => {
    setLoading(true);
    committeeApi.list().then(r => { setMemos(r.data.results || r.data); setLoading(false); });
  };
  useEffect(() => {
    load();
    dealsApi.list().then(r => setDeals(r.data.results || r.data));
    accountsApi.members().then(r => setMembers(r.data.results || r.data)).catch(() => {});
  }, []);

  const selectMemo = async (m) => {
    setTab('overview');
    const r = await committeeApi.get(m.id);
    setSelected(r.data);
    setVoteRationale(''); setShowVoteBox(false);
  };

  const createMemo = async () => {
    try {
      await committeeApi.create(form);
      setShowNew(false); setForm(BLANK); setFormStep(0);
      toast('IC memo created'); load();
    } catch { toast('Failed', 'error'); }
  };

  const submitMemo = async () => {
    if (!submitForm.member_ids.length) { toast('Select at least one IC member', 'error'); return; }
    try {
      const r = await committeeApi.submit(selected.id, submitForm);
      setSelected(r.data); setShowSubmit(false);
      toast('Submitted — IC members notified via email');
    } catch { toast('Submit failed', 'error'); }
  };

  const castVote = async (v) => {
    try {
      const r = await committeeApi.vote(selected.id, { vote:v, rationale:voteRationale });
      setSelected(r.data); setShowVoteBox(false); setVoteRationale('');
      toast('Vote cast: ' + v);
    } catch { toast('Vote failed', 'error'); }
  };

  const decide = async () => {
    try {
      const r = await committeeApi.decide(selected.id, decideForm);
      setSelected(r.data); setShowDecide(false);
      toast('Decision recorded: ' + decideForm.decision);
    } catch { toast('Failed', 'error'); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await committeeApi.addComment(selected.id, { content:comment, is_dissent:isDissent });
      const r = await committeeApi.get(selected.id);
      setSelected(r.data); setComment(''); setIsDissent(false);
      toast('Comment added');
    } catch { toast('Failed', 'error'); }
  };

  const sendReminders = async () => {
    try {
      const r = await committeeApi.sendReminders(selected.id);
      toast(r.data.reminders_sent + ' reminder(s) sent');
    } catch { toast('Failed', 'error'); }
  };

  const filtered = memos.filter(m => {
    const statusOk = filterStatus === 'all' || m.status === filterStatus;
    const q = search.toLowerCase();
    const ok = !q || m.title.toLowerCase().includes(q) ||
      (m.deal_name||'').toLowerCase().includes(q) ||
      (m.prepared_by_name||'').toLowerCase().includes(q);
    return statusOk && ok;
  });

  const renderStepper = (memo) => {
    const statuses = ['draft','voting','decided'];
    const getIdx = s => s === 'approved'||s === 'rejected'||s === 'deferred' ? 2 : s === 'voting' ? 1 : 0;
    const cur = getIdx(memo.status);
    const labels = ['Draft','Voting Open', memo.status === 'approved' ? 'Approved' : memo.status === 'rejected' ? 'Rejected' : memo.status === 'deferred' ? 'Deferred' : 'Decision'];
    return (
      <div style={{ display:'flex', alignItems:'center', marginBottom:18 }}>
        {labels.map((l, i) => {
          const done   = i < cur;
          const active = i === cur;
          const dc = active ? (memo.status === 'rejected' ? 'var(--red)' : memo.status === 'deferred' ? 'var(--amber)' : 'var(--blue)') : done ? 'var(--green)' : 'var(--border)';
          return (
            <React.Fragment key={i}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:dc, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:(done||active)?'#fff':'var(--muted)' }}>
                  {done ? '✓' : i+1}
                </div>
                <div style={{ fontSize:10, color:active?'var(--text)':done?'var(--green)':'var(--muted)', fontWeight:active?700:400, whiteSpace:'nowrap' }}>{l}</div>
              </div>
              {i < labels.length-1 && <div style={{ flex:1, height:2, background:done?'var(--green)':'var(--border)', margin:'0 6px', marginBottom:14 }} />}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderVoteBar = (vs, quorum) => {
    if (!vs || !vs.total) return null;
    const t = vs.total;
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', height:7, borderRadius:4, overflow:'hidden', marginBottom:7, gap:1 }}>
          {vs.approve > 0 && <div style={{ width:`${vs.approve/t*100}%`, background:'var(--green)' }} />}
          {vs.reject  > 0 && <div style={{ width:`${vs.reject/t*100}%`, background:'var(--red)' }} />}
          {vs.abstain > 0 && <div style={{ width:`${vs.abstain/t*100}%`, background:'var(--muted)' }} />}
          {vs.pending > 0 && <div style={{ width:`${vs.pending/t*100}%`, background:'var(--border)' }} />}
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
          {[['Approve',vs.approve,'var(--green)'],['Reject',vs.reject,'var(--red)'],['Abstain',vs.abstain,'var(--muted)'],['Pending',vs.pending,'var(--border)']].map(([l,v,c]) => (
            <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:7, height:7, borderRadius:2, background:c }} />
              <span style={{ fontSize:11, color:'var(--muted)' }}>{l}</span>
              <span style={{ fontSize:13, fontWeight:700, fontFamily:'var(--ffm)', color:c }}>{v}</span>
            </div>
          ))}
          <div style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
            Quorum: <span style={{ fontWeight:700, color:(t - vs.pending) >= quorum ? 'var(--green)' : 'var(--amber)' }}>{t - vs.pending}/{quorum}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = (memo) => {
    if (tab === 'overview') return (
      <div>
        {renderVoteBar(memo.vote_summary, memo.quorum_required)}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
          {[['Deal',memo.deal_name||'—'],['Type',MEMO_TYPE_LABEL[memo.memo_type]||memo.memo_type],
            ['Recommended',memo.recommended_amount?fmt$(memo.recommended_amount):'—'],
            ['Prepared by',memo.prepared_by_name||'—'],
            ['Submitted',memo.submitted_at?new Date(memo.submitted_at).toLocaleDateString('en-GB'):'—'],
            ['Deadline',memo.voting_deadline?new Date(memo.voting_deadline).toLocaleDateString('en-GB'):'—'],
          ].map(([l,v]) => (
            <div key={l} style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'9px 11px', border:'1px solid var(--border)' }}>
              <div style={S.lbl}>{l}</div>
              <div style={{ fontWeight:600, fontSize:13 }}>{v}</div>
            </div>
          ))}
        </div>
        {memo.status === 'approved' && memo.approved_amount && (
          <div style={{ background:'rgba(34,211,160,.06)', border:'1px solid rgba(34,211,160,.25)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:12, display:'flex', gap:12, alignItems:'center' }}>
            <span style={{ color:'var(--green)', fontSize:18 }}>✓</span>
            <div>
              <div style={{ fontWeight:700, color:'var(--green)', fontSize:13 }}>Approved</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Amount: <strong>{fmt$(memo.approved_amount)}</strong></div>
            </div>
          </div>
        )}
        {memo.executive_summary && (
          <div style={{ marginBottom:12 }}>
            <div style={S.lbl}>Executive Summary</div>
            <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8, background:'var(--surface2)', padding:'11px 13px', borderRadius:'var(--r)', border:'1px solid var(--border)', margin:0 }}>{memo.executive_summary}</p>
          </div>
        )}
        {memo.attachments?.length > 0 && (
          <div>
            <div style={S.lbl}>Attachments ({memo.attachments.length})</div>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {memo.attachments.map(a => <span key={a.id} style={{ ...S.tag('var(--blue)') }}>📎 {a.filename}</span>)}
            </div>
          </div>
        )}
      </div>
    );
    if (tab === 'sections') return (
      <div>
        {[['Investment Thesis',memo.investment_thesis],['Transaction Summary',memo.transaction_summary],
          ['Financial Analysis',memo.financial_analysis],['Risk Factors',memo.risk_factors],
          ['ESG Considerations',memo.esg_considerations],['Recommendation',memo.recommendation],
        ].map(([t,c]) => c ? (
          <div key={t} style={{ marginBottom:16 }}>
            <div style={S.lbl}>{t}</div>
            <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.85, background:'var(--surface2)', padding:'11px 13px', borderRadius:'var(--r)', border:'1px solid var(--border)', margin:0, whiteSpace:'pre-wrap' }}>{c}</p>
          </div>
        ) : null)}
      </div>
    );
    if (tab === 'votes') return (
      <div>
        {memo.status === 'voting' && (
          <div style={{ ...S.card, marginBottom:14, border:'1px solid var(--blue)', background:'rgba(59,107,255,.04)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--blue)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Cast Your Vote</div>
            {showVoteBox ? (
              <>
                <textarea placeholder="Rationale (optional — visible to all IC members)..." value={voteRationale}
                  onChange={e => setVoteRationale(e.target.value)}
                  style={{ ...S.input, marginBottom:8, resize:'vertical', minHeight:65 }} />
                <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                  <button style={{ ...S.btnP, background:'var(--green)', fontSize:12 }} onClick={() => castVote('approve')}>✓ Approve</button>
                  <button style={{ ...S.btnP, background:'var(--red)', fontSize:12 }} onClick={() => castVote('reject')}>✗ Reject</button>
                  <button style={{ ...S.btnG, fontSize:12 }} onClick={() => castVote('abstain')}>Abstain</button>
                  <button style={{ ...S.btnG, fontSize:12 }} onClick={() => castVote('more_info')}>Request info</button>
                  <button style={{ ...S.btnG, fontSize:12 }} onClick={() => setShowVoteBox(false)}>Cancel</button>
                </div>
              </>
            ) : (
              <button style={{ ...S.btnP, fontSize:12 }} onClick={() => setShowVoteBox(true)}>Vote on this memo</button>
            )}
          </div>
        )}
        {!memo.votes?.length && <p style={{ color:'var(--muted)', fontSize:13 }}>No votes yet.</p>}
        {memo.votes?.map(v => (
          <div key={v.id} style={{ padding:'11px 13px', borderRadius:'var(--r)', marginBottom:7,
            background:'var(--surface2)', border:'1px solid var(--border)',
            borderLeft:`3px solid ${v.vote==='approve'?'var(--green)':v.vote==='reject'?'var(--red)':'var(--muted)'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:v.rationale?5:0 }}>
              <div>
                <span style={{ fontWeight:600, fontSize:13 }}>{v.member_name}</span>
                <span style={{ fontSize:11, color:'var(--muted)', marginLeft:7 }}>{v.member_email}</span>
              </div>
              <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                <span style={S.tag(v.vote==='approve'?'var(--green)':v.vote==='reject'?'var(--red)':v.vote==='more_info'?'var(--amber)':'var(--muted)')}>{v.vote}</span>
                {v.voted_at && <span style={{ fontSize:10, color:'var(--muted)' }}>{new Date(v.voted_at).toLocaleDateString('en-GB')}</span>}
              </div>
            </div>
            {v.rationale && <p style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7, margin:0 }}>{v.rationale}</p>}
            {v.conditions && <p style={{ fontSize:12, color:'var(--amber)', margin:'3px 0 0' }}>Conditions: {v.conditions}</p>}
          </div>
        ))}
        {memo.status === 'voting' && (
          <button style={{ ...S.btnG, marginTop:7, fontSize:11 }} onClick={sendReminders}>Send reminders to pending voters</button>
        )}
      </div>
    );
    if (tab === 'versions') return (
      <div>
        {!memo.versions?.length && <p style={{ color:'var(--muted)', fontSize:13 }}>No versions yet.</p>}
        {memo.versions?.map(v => (
          <div key={v.id} style={{ padding:'9px 13px', borderRadius:'var(--r)', marginBottom:7, background:'var(--surface2)', border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
              <span style={{ fontFamily:'var(--ffm)', fontSize:12, color:'var(--blue)', fontWeight:700 }}>v{v.version_num}</span>
              <span style={{ fontSize:10, color:'var(--muted)' }}>{new Date(v.created_at).toLocaleString('en-GB')}</span>
            </div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:2 }}>{v.change_note}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>by {v.changed_by_name}</div>
          </div>
        ))}
      </div>
    );
    if (tab === 'comments') return (
      <div>
        {memo.comments?.map(c => (
          <div key={c.id} style={{ padding:'10px 13px', borderRadius:'var(--r)', marginBottom:7,
            background:c.is_dissent?'rgba(244,63,94,.05)':'var(--surface2)',
            border:`1px solid ${c.is_dissent?'rgba(244,63,94,.3)':'var(--border)'}`,
            borderLeft:`3px solid ${c.is_dissent?'var(--red)':'var(--border)'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontWeight:600, fontSize:12 }}>{c.author_name}</span>
              <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                {c.is_dissent && <span style={S.tag('var(--red)')}>formal dissent</span>}
                <span style={{ fontSize:10, color:'var(--muted)' }}>{new Date(c.created_at).toLocaleString('en-GB')}</span>
              </div>
            </div>
            <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, margin:0 }}>{c.content}</p>
          </div>
        ))}
        <div style={{ marginTop:10 }}>
          <textarea placeholder="Add comment..." value={comment} onChange={e => setComment(e.target.value)}
            style={{ ...S.input, resize:'vertical', minHeight:65, marginBottom:7 }} />
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button style={{ ...S.btnP, fontSize:12 }} onClick={addComment}>Add comment</button>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--muted)', cursor:'pointer' }}>
              <input type="checkbox" checked={isDissent} onChange={e => setIsDissent(e.target.checked)} />
              Log as formal dissent
            </label>
          </div>
        </div>
      </div>
    );
    return null;
  };

  const counts = memos.reduce((a, m) => { a[m.status]=(a[m.status]||0)+1; return a; }, {});

  return (
    <div className="fade-up">
      <PageHeader title="IC Workflow" sub="Investment committee approvals · full audit trail · Resend notifications"
        action={<button style={S.btnP} onClick={() => setShowNew(true)}>+ New memo</button>} />

      <div style={{ display:'grid', gridTemplateColumns:'290px 1fr', gap:16, height:'calc(100vh - 160px)' }}>
        {/* Left */}
        <div style={{ ...S.card, display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
          <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search memos..."
              style={{ ...S.input, fontSize:12 }} />
          </div>
          <div style={{ display:'flex', gap:3, padding:'7px 12px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
            {[['all','All'],['draft','Draft'],['voting','Voting'],['approved','Approved'],['rejected','Rejected'],['deferred','Deferred']].map(([k,l]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{ fontSize:10, padding:'3px 7px', borderRadius:4, fontWeight:600, cursor:'pointer',
                  background:filterStatus===k?STATUS_COLOR[k]||'var(--blue)':'var(--surface2)',
                  color:filterStatus===k?'#fff':'var(--muted)',
                  border:`1px solid ${filterStatus===k?STATUS_COLOR[k]||'var(--blue)':'var(--border)'}` }}>
                {l}{k==='all'?` (${memos.length})`:counts[k]?` (${counts[k]})`:''}

              </button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'7px 9px' }}>
            {loading ? <Spinner /> : filtered.length === 0 ? (
              <p style={{ color:'var(--muted)', fontSize:12, padding:8 }}>No memos.</p>
            ) : filtered.map(m => (
              <div key={m.id} onClick={() => selectMemo(m)}
                style={{ padding:'9px 11px', borderRadius:'var(--r)', cursor:'pointer', marginBottom:5,
                  background:selected?.id===m.id?'var(--blue-dim)':'var(--surface2)',
                  border:`1px solid ${selected?.id===m.id?'var(--blue)':'var(--border)'}`,
                  borderLeft:`3px solid ${STATUS_COLOR[m.status]||'var(--muted)'}`,
                  transition:'all .12s' }}>
                <div style={{ fontWeight:600, fontSize:12, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.title}</div>
                <div style={{ display:'flex', gap:4, alignItems:'center', marginBottom:3, flexWrap:'wrap' }}>
                  <span style={S.tag(STATUS_COLOR[m.status]||'var(--muted)')}>{m.status}</span>
                  <span style={S.tag('var(--gold)')}>{MEMO_TYPE_LABEL[m.memo_type]||m.memo_type}</span>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{m.deal_name} · {m.prepared_by_name}</div>
                {m.vote_summary && m.status === 'voting' && (
                  <div style={{ display:'flex', gap:5, marginTop:3 }}>
                    <span style={{ fontSize:10, color:'var(--green)' }}>✓{m.vote_summary.approve}</span>
                    <span style={{ fontSize:10, color:'var(--red)' }}>✗{m.vote_summary.reject}</span>
                    <span style={{ fontSize:10, color:'var(--muted)' }}>·{m.vote_summary.pending} pending</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        {!selected ? (
          <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--muted)' }}>
            <div style={{ fontSize:28, opacity:.2 }}>⊞</div>
            <div style={{ fontSize:13 }}>Select a memo to review</div>
          </div>
        ) : (
          <div style={{ ...S.card, display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
              {renderStepper(selected)}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
                <div>
                  <div style={{ display:'flex', gap:5, marginBottom:5, flexWrap:'wrap' }}>
                    <span style={S.tag(STATUS_COLOR[selected.status]||'var(--muted)')}>{selected.status}</span>
                    <span style={S.tag('var(--gold)')}>{MEMO_TYPE_LABEL[selected.memo_type]}</span>
                    {selected.recommended_amount && <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'var(--ffm)', alignSelf:'center' }}>{fmt$(selected.recommended_amount)}</span>}
                  </div>
                  <div style={{ fontSize:17, fontWeight:700, lineHeight:1.3 }}>{selected.title}</div>
                </div>
                <div style={{ display:'flex', gap:7, flexWrap:'wrap', flexShrink:0 }}>
                  {selected.status === 'draft' && (
                    <button style={{ ...S.btnP, fontSize:12 }} onClick={() => setShowSubmit(true)}>Submit for voting</button>
                  )}
                  {selected.status === 'voting' && <>
                    <button style={{ ...S.btnG, fontSize:12 }} onClick={() => setShowDecide(true)}>Record decision</button>
                    <button style={{ ...S.btnG, fontSize:12 }} onClick={async () => {
                      const r = await committeeApi.requestRevision(selected.id, { note:'Returned for revision' });
                      setSelected(r.data); toast('Returned for revision');
                    }}>Return for revision</button>
                  </>}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:2, padding:'7px 12px', borderBottom:'1px solid var(--border)' }}>
              {[['overview','Overview'],['sections','Sections'],['votes','Votes'],['versions','Versions'],['comments','Comments']].map(([k,l]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ fontSize:12, padding:'4px 11px', borderRadius:'var(--r)', cursor:'pointer', fontWeight:tab===k?600:400,
                    background:tab===k?'var(--blue-dim)':'transparent',
                    color:tab===k?'var(--blue)':'var(--muted)',
                    border:`1px solid ${tab===k?'var(--blue)':'transparent'}` }}>
                  {l}{k==='votes'&&selected.votes?.length?` (${selected.votes.length})`:''}
                  {k==='comments'&&selected.comments?.length?` (${selected.comments.length})`:''}
                </button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>
              {renderTabContent(selected)}
            </div>
          </div>
        )}
      </div>

      {/* New memo modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setFormStep(0); setForm(BLANK); }} title="New IC Memo" width={700}>
        <div style={{ display:'flex', marginBottom:18 }}>
          {['Deal & basics','Memo content','Review'].map((s,i) => (
            <React.Fragment key={i}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:21, height:21, borderRadius:'50%', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center',
                  background:i<=formStep?'var(--blue)':'var(--surface2)',
                  border:`1.5px solid ${i<=formStep?'var(--blue)':'var(--border)'}`,
                  color:i<=formStep?'#fff':'var(--muted)' }}>{i<formStep?'✓':i+1}</div>
                <span style={{ fontSize:12, color:i===formStep?'var(--text)':'var(--muted)', fontWeight:i===formStep?600:400 }}>{s}</span>
              </div>
              {i<2 && <div style={{ flex:1, height:1.5, background:i<formStep?'var(--blue)':'var(--border)', margin:'10px 7px 0' }} />}
            </React.Fragment>
          ))}
        </div>
        {formStep === 0 && <>
          <Sel label="Deal *" value={form.deal} onChange={e => setForm(f=>({...f,deal:e.target.value}))}
            options={[{value:'',label:'Select deal…'},...deals.map(d=>({value:d.id,label:d.name}))]} />
          <Inp label="Memo Title *" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="Initial Investment — Acme Manufacturing SA" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Sel label="Type" value={form.memo_type} onChange={e => setForm(f=>({...f,memo_type:e.target.value}))}
              options={[{value:'initial',label:'Initial Investment'},{value:'follow_on',label:'Follow-on'},{value:'exit',label:'Exit Approval'},{value:'write_off',label:'Write-off'},{value:'amendment',label:'Amendment'}]} />
            <Inp label="Recommended Amount (USD)" type="number" value={form.recommended_amount} onChange={e => setForm(f=>({...f,recommended_amount:e.target.value}))} placeholder="2500000" />
          </div>
          <Inp label="Quorum (votes required)" type="number" value={form.quorum_required} onChange={e => setForm(f=>({...f,quorum_required:parseInt(e.target.value)||3}))} />
        </>}
        {formStep === 1 && <>
          <TA label="Executive Summary" value={form.executive_summary} onChange={e => setForm(f=>({...f,executive_summary:e.target.value}))} />
          <TA label="Investment Thesis" value={form.investment_thesis} onChange={e => setForm(f=>({...f,investment_thesis:e.target.value}))} />
          <TA label="Transaction Summary" value={form.transaction_summary} onChange={e => setForm(f=>({...f,transaction_summary:e.target.value}))} />
          <TA label="Financial Analysis" value={form.financial_analysis} onChange={e => setForm(f=>({...f,financial_analysis:e.target.value}))} />
          <TA label="Risk Factors" value={form.risk_factors} onChange={e => setForm(f=>({...f,risk_factors:e.target.value}))} />
          <TA label="ESG Considerations" value={form.esg_considerations} onChange={e => setForm(f=>({...f,esg_considerations:e.target.value}))} />
          <TA label="Recommendation" value={form.recommendation} onChange={e => setForm(f=>({...f,recommendation:e.target.value}))} />
        </>}
        {formStep === 2 && (
          <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'14px', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Review</div>
            {[['Deal',deals.find(d=>String(d.id)===String(form.deal))?.name||'—'],['Title',form.title||'—'],
              ['Type',MEMO_TYPE_LABEL[form.memo_type]],['Amount',form.recommended_amount?fmt$(form.recommended_amount):'—'],
              ['Quorum',form.quorum_required+' votes']].map(([l,v]) => (
              <div key={l} style={{ display:'flex', gap:10, padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ color:'var(--muted)', width:120, flexShrink:0 }}>{l}</span>
                <span style={{ fontWeight:600 }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:14 }}>
          <div>{formStep > 0 && <button style={S.btnG} onClick={() => setFormStep(s=>s-1)}>← Back</button>}</div>
          <div style={{ display:'flex', gap:8 }}>
            {formStep < 2 && <button style={S.btnP} onClick={() => {
              if (formStep===0&&(!form.deal||!form.title)){toast('Deal and title required','error');return;}
              setFormStep(s=>s+1);
            }}>Next →</button>}
            {formStep === 2 && <button style={S.btnP} onClick={createMemo}>Create memo</button>}
            <button style={S.btnG} onClick={() => { setShowNew(false); setFormStep(0); setForm(BLANK); }}>Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Submit modal */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Submit for Voting" width={500}>
        <div style={S.lbl}>Select IC Members</div>
        <div style={{ maxHeight:180, overflowY:'auto', marginBottom:10 }}>
          {!members.length && <p style={{ color:'var(--muted)', fontSize:12 }}>No members loaded.</p>}
          {members.map(m => (
            <label key={m.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
              <input type="checkbox"
                checked={submitForm.member_ids.includes(m.user||m.id)}
                onChange={e => {
                  const uid = m.user||m.id;
                  setSubmitForm(f => ({ ...f, member_ids: e.target.checked ? [...f.member_ids,uid] : f.member_ids.filter(x=>x!==uid) }));
                }} />
              <span style={{ fontSize:13 }}>{m.user_name||m.email||m.id}</span>
              {m.role_label && <span style={S.tag('var(--blue)')}>{m.role_label}</span>}
            </label>
          ))}
        </div>
        <Inp label="Voting Deadline" type="datetime-local" value={submitForm.deadline}
          onChange={e => setSubmitForm(f=>({...f,deadline:e.target.value}))} />
        <Inp label="Quorum required" type="number" value={submitForm.quorum_required}
          onChange={e => setSubmitForm(f=>({...f,quorum_required:parseInt(e.target.value)||3}))} />
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button style={S.btnP} onClick={submitMemo}>Submit &amp; notify members</button>
          <button style={S.btnG} onClick={() => setShowSubmit(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Decide modal */}
      <Modal open={showDecide} onClose={() => setShowDecide(false)} title="Record Decision" width={460}>
        <Sel label="Decision" value={decideForm.decision} onChange={e => setDecideForm(f=>({...f,decision:e.target.value}))}
          options={[{value:'approved',label:'✓ Approved'},{value:'rejected',label:'✗ Rejected'},{value:'deferred',label:'⊘ Deferred'}]} />
        {decideForm.decision === 'approved' && (
          <Inp label="Approved Amount (USD)" type="number" value={decideForm.approved_amount}
            onChange={e => setDecideForm(f=>({...f,approved_amount:e.target.value}))}
            placeholder={selected?.recommended_amount||''} />
        )}
        <TA label="Conditions / Notes" value={decideForm.conditions}
          onChange={e => setDecideForm(f=>({...f,conditions:e.target.value}))}
          placeholder="Any conditions attached to this decision..." />
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button style={{ ...S.btnP, background:decideForm.decision==='approved'?'var(--green)':decideForm.decision==='rejected'?'var(--red)':'var(--amber)' }} onClick={decide}>
            Confirm decision
          </button>
          <button style={S.btnG} onClick={() => setShowDecide(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

// ── PORTFOLIO MONITORING ──────────────────────────────────────────────────────
function PortfolioMonitor({ toast }) {
  const [positions, setPositions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([portfolioApi.list(), portfolioApi.summary()]).then(([p, s]) => {
      setPositions(p.data.results || p.data);
      setSummary(s.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const loadDetail = async (pos) => {
    const r = await portfolioApi.get(pos.id);
    setSelected(r.data);
  };

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner /></div>;

  return (
    <div className="fade-up">
      <PageHeader title="Portfolio Monitoring" sub={`${positions.length} active positions`} />

      {/* Summary row */}
      {summary && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
          <StatCard label="Total AUM" value={fmt$(summary.total_current)} accent />
          <StatCard label="Total Invested" value={fmt$(summary.total_invested)} />
          <StatCard label="Unrealised Gain" value={fmt$(summary.total_gain)} trend={summary.total_return_pct} />
          <StatCard label="Positions" value={summary.total_positions} sub={`${summary.open_alerts} alerts`} />
        </div>
      )}

      {/* Positions table */}
      <div style={S.card}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Deal', 'Strategy', 'Entry Value', 'Current Value', 'Gain / Loss', 'MOIC', ''].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map(p => {
              const gain = p.current_value - p.entry_value;
              const gainPct = p.entry_value > 0 ? (gain / p.entry_value * 100) : 0;
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}>
                  <td style={{ padding:'12px', fontWeight:600 }}>{p.deal_name}</td>
                  <td style={{ padding:'12px' }}><span style={S.tag(STRATEGY_COLORS[p.strategy], `${STRATEGY_COLORS[p.strategy]}18`)}>{STRATEGY_LABELS[p.strategy]}</span></td>
                  <td style={{ padding:'12px', fontFamily:'var(--ffm)', fontSize:13 }}>{fmt$(p.entry_value)}</td>
                  <td style={{ padding:'12px', fontFamily:'var(--ffm)', fontSize:13 }}>{fmt$(p.current_value)}</td>
                  <td style={{ padding:'12px', fontFamily:'var(--ffm)', fontSize:13, color: gain >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
                    {gain >= 0 ? '+' : ''}{fmt$(gain)} ({gainPct.toFixed(1)}%)
                  </td>
                  <td style={{ padding:'12px', fontFamily:'var(--ffm)', fontSize:13 }}>{p.moic ? `${p.moic}x` : '—'}</td>
                  <td style={{ padding:'12px' }}>
                    <button style={{ ...S.btnG, padding:'5px 12px', fontSize:11 }} onClick={() => loadDetail(p)}>Detail</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {positions.length === 0 && <p style={{ textAlign:'center', color:'var(--muted)', padding:40 }}>No portfolio positions. Add positions when deals close.</p>}
      </div>

      {/* Position detail modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={selected.deal_name} width={640}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <StatCard label="Entry Value"   value={fmt$(selected.entry_value)} />
            <StatCard label="Current Value" value={fmt$(selected.current_value)} accent />
            <StatCard label="Unrealised Gain" value={fmt$(selected.unrealised_gain)} trend={selected.moic ? (selected.moic - 1) * 100 : undefined} />
            <StatCard label="MOIC" value={selected.moic ? `${selected.moic}x` : '—'} />
          </div>
          {/* Snapshot history chart */}
          {selected.snapshots?.length > 1 && (
            <div style={{ marginBottom:20 }}>
              <div style={S.lbl}>NAV History</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={[...selected.snapshots].reverse()} margin={{ top:5, right:0, bottom:0, left:0 }}>
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="period_end" tick={{ fontSize:10, fill:'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:10, fill:'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt$(v)} />
                  <Tooltip formatter={v => fmt$(v)} contentStyle={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:12 }} />
                  <Area type="monotone" dataKey="nav" stroke="var(--blue)" fill="url(#navGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {selected.notes && <div><div style={S.lbl}>Notes</div><p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.75 }}>{selected.notes}</p></div>}
        </Modal>
      )}
    </div>
  );
}

// ── DOCUMENT REPOSITORY ───────────────────────────────────────────────────────
function DocumentRepository({ toast }) {
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ category:'', search:'' });
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title:'', description:'', category:'other', access_level:'team' });
  const [file, setFile] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter.category) params.category = filter.category;
    if (filter.search)   params.search   = filter.search;
    Promise.all([docsApi.list(params), docsApi.stats()]).then(([d, s]) => {
      setDocs(d.data.results || d.data);
      setStats(s.data);
      setLoading(false);
    });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    if (!file) { toast('Select a file first.', 'error'); return; }
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(uploadForm).forEach(([k,v]) => fd.append(k, v));
    try { await docsApi.upload(fd); setShowUpload(false); toast('Document uploaded.'); load(); }
    catch { toast('Upload failed.', 'error'); }
  };

  const CATEGORY_COLORS = { deal:'var(--blue)', dd:'var(--amber)', ic_memo:'var(--gold)', legal:'var(--red)', financial:'var(--green)', report:'var(--blue)', portfolio:'var(--green)', compliance:'var(--amber)', other:'var(--muted)' };
  const fmt_size = (b) => { if (!b) return '—'; for (const u of ['B','KB','MB','GB']) { if (b < 1024) return `${b.toFixed(0)} ${u}`; b /= 1024; } return `${b.toFixed(1)} GB`; };

  return (
    <div className="fade-up">
      <PageHeader title="Document Repository" sub={stats ? `${stats.total_documents} documents · ${fmt_size(stats.total_size_bytes)}` : ''}
        action={<button style={S.btnP} onClick={() => setShowUpload(true)}>+ Upload</button>} />

      {/* Stats by category */}
      {stats && (
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          {stats.by_category?.map(c => (
            <div key={c.category} style={{ ...S.card, padding:'10px 14px', display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:CATEGORY_COLORS[c.category] || 'var(--muted)', flexShrink:0 }} />
              <span style={{ fontSize:12, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)' }}>{c.category}</span>
              <span style={{ fontFamily:'var(--ffm)', fontSize:13, fontWeight:600, color:'var(--text)' }}>{c.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:18 }}>
        <input value={filter.search} onChange={e => setFilter(f => ({...f, search:e.target.value}))} placeholder="Search documents…" style={{ width:220 }} />
        <select value={filter.category} onChange={e => setFilter(f => ({...f, category:e.target.value}))} style={{ width:180 }}>
          <option value="">All Categories</option>
          {['deal','dd','ic_memo','legal','financial','report','portfolio','compliance','other'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Document list */}
      {loading ? <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner /></div> : (
        <div style={{ display:'grid', gap:8 }}>
          {docs.length === 0 ? <p style={{ textAlign:'center', color:'var(--muted)', padding:40 }}>No documents found.</p> : docs.map(doc => (
            <div key={doc.id} style={{ ...S.card, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:40, height:40, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                {doc.mime_type?.includes('pdf') ? '📄' : doc.mime_type?.includes('image') ? '🖼' : doc.mime_type?.includes('spreadsheet') || doc.mime_type?.includes('excel') ? '📊' : '📁'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:13, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span style={S.tag(CATEGORY_COLORS[doc.category] || 'var(--muted)')}>{doc.category}</span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>v{doc.version} · {doc.file_size_display}</span>
                  {doc.deal && <span style={{ fontSize:11, color:'var(--muted)' }}>· Deal #{doc.deal}</span>}
                </div>
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', textAlign:'right', flexShrink:0 }}>
                <div>{doc.uploaded_by_name}</div>
                <div>{new Date(doc.created_at).toLocaleDateString()}</div>
              </div>
              <a href={doc.file} target="_blank" rel="noreferrer">
                <button style={{ ...S.btnG, padding:'6px 12px', fontSize:12 }}>↓</button>
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document" width={500}>
        <Inp label="Title *" value={uploadForm.title} onChange={e => setUploadForm(f => ({...f, title:e.target.value}))} />
        <TA label="Description" value={uploadForm.description} onChange={e => setUploadForm(f => ({...f, description:e.target.value}))} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Sel label="Category" value={uploadForm.category} onChange={e => setUploadForm(f => ({...f, category:e.target.value}))} options={['deal','dd','ic_memo','legal','financial','report','portfolio','compliance','other'].map(c => ({value:c,label:c}))} />
          <Sel label="Access Level" value={uploadForm.access_level} onChange={e => setUploadForm(f => ({...f, access_level:e.target.value}))} options={[{value:'all',label:'All Users'},{value:'team',label:'Deal Team'},{value:'ic',label:'IC Only'},{value:'admin',label:'Admin Only'}]} />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={S.lbl}>File *</label>
          <input type="file" onChange={e => setFile(e.target.files[0])} style={{ background:'var(--surface2)', padding:'8px 12px' }} />
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button style={S.btnP} onClick={upload}>Upload</button>
          <button style={S.btnG} onClick={() => setShowUpload(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default 
// ── REPORTING ─────────────────────────────────────────────────────────────────
function Reporting({ toast }) {
  const [reports, setReports]         = useState([]);
  const [recipients, setRecipients]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('reports');   // reports | recipients
  const [showGen, setShowGen]         = useState(false);
  const [showAddRec, setShowAddRec]   = useState(false);
  const [preview, setPreview]         = useState(null);        // {id, html}
  const [sending, setSending]         = useState(null);        // report id being sent
  const [exporting, setExporting]     = useState(null);        // report id being exported to S3
  const [genForm, setGenForm]         = useState({
    title:'', report_type:'quarterly', period:'Q1',
    period_year: new Date().getFullYear(),
    include_pe:true, include_credit:true, include_commodities:true, include_re:true,
  });
  const [recForm, setRecForm] = useState({ name:'', email:'', organisation:'', language:'en' });
  const [generating, setGenerating]   = useState(false);

  const STATUS_COLOR = {
    draft:'var(--muted)', ready:'var(--blue)', sent:'var(--green)', failed:'var(--red)',
  };
  const TYPE_LABEL = {
    quarterly:'Quarterly Report', annual:'Annual Report',
    flash:'Flash Update', custom:'Custom Report',
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      reportingApi.listReports(),
      reportingApi.listRecipients(),
    ]).then(([r, rec]) => {
      setReports(r.data.results || r.data);
      setRecipients(rec.data.results || rec.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    if (!genForm.title) { toast('Enter a report title', 'error'); return; }
    setGenerating(true);
    try {
      const r = await reportingApi.generateReport(genForm);
      setShowGen(false);
      setPreview({ id: r.data.report.id, html: r.data.html });
      toast('Report generated — preview ready');
      load();
    } catch { toast('Generation failed', 'error'); }
    finally { setGenerating(false); }
  };

  const sendReport = async (id, recipientIds) => {
    setSending(id);
    try {
      const r = await reportingApi.sendReport(id, { recipient_ids: recipientIds });
      toast(`Sent: ${r.data.sent} · Failed: ${r.data.failed}`);
      load();
    } catch { toast('Send failed', 'error'); }
    finally { setSending(null); }
  };

  const exportPdf = async (id) => {
    setExporting(id);
    try {
      const r = await reportingApi.exportPdf(id);
      if (r.data.s3_uri) {
        toast(`Saved to S3: ${r.data.s3_key}`);
      } else {
        toast(r.data.note || 'Export complete', 'info');
      }
      load();
    } catch { toast('Export failed', 'error'); }
    setExporting(null);
  };

  const downloadPdf = (id) => {
    // Opens the download endpoint — browser triggers Save As dialog
    window.open(reportingApi.downloadPdfUrl(id), '_blank');
  };

  const addRecipient = async () => {
    if (!recForm.name || !recForm.email) { toast('Name and email required', 'error'); return; }
    try {
      await reportingApi.createRecipient(recForm);
      setShowAddRec(false); setRecForm({ name:'', email:'', organisation:'', language:'en' });
      toast('Recipient added'); load();
    } catch { toast('Failed', 'error'); }
  };

  const removeRecipient = async (id) => {
    try {
      await reportingApi.deleteRecipient(id);
      toast('Recipient removed'); load();
    } catch { toast('Failed', 'error'); }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title="Investor Reporting"
        sub="Citadel-style LP reports · built from live portfolio data · delivered via Resend"
        action={
          <div style={{ display:'flex', gap:8 }}>
            <button style={S.btnG} onClick={() => setTab(tab === 'recipients' ? 'reports' : 'recipients')}>
              {tab === 'recipients' ? '← Reports' : '⊙ Recipients (' + recipients.length + ')'}
            </button>
            {tab === 'reports' && (
              <button style={S.btnP} onClick={() => setShowGen(true)}>+ Generate report</button>
            )}
            {tab === 'recipients' && (
              <button style={S.btnP} onClick={() => setShowAddRec(true)}>+ Add recipient</button>
            )}
          </div>
        }
      />

      {/* Preview panel */}
      {preview && (
        <div style={{ ...S.card, marginBottom:18, padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontWeight:600, fontSize:13 }}>Report Preview</div>
            <div style={{ display:'flex', gap:8 }}>
              <button style={{ ...S.btnP, fontSize:12 }}
                onClick={() => sendReport(preview.id, [])}>
                {sending === preview.id ? '⟳ Sending…' : '↗ Send to all recipients'}
              </button>
              <button style={{ ...S.btnG, fontSize:12 }}
                onClick={() => exportPdf(preview.id)}>
                {exporting === preview.id ? '⟳ Saving…' : '☁ Save to S3'}
              </button>
              <button style={{ ...S.btnG, fontSize:12 }}
                onClick={() => downloadPdf(preview.id)}>
                ↓ Download PDF
              </button>
              <button style={{ ...S.btnG, fontSize:12 }} onClick={() => setPreview(null)}>✕ Close</button>
            </div>
          </div>
          <iframe
            srcDoc={preview.html}
            style={{ width:'100%', height:600, border:'none', background:'#07090f' }}
            title="Report preview"
          />
        </div>
      )}

      {tab === 'reports' && (
        <div>
          {loading ? <Spinner /> : reports.length === 0 ? (
            <div style={{ ...S.card, textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
              <div style={{ fontSize:28, opacity:.2, marginBottom:12 }}>⊙</div>
              <div style={{ fontWeight:600, marginBottom:6 }}>No reports yet</div>
              <div style={{ fontSize:12 }}>Generate your first LP report to get started</div>
            </div>
          ) : reports.map(r => (
            <div key={r.id} style={{ ...S.card, marginBottom:10,
              borderLeft:`3px solid ${STATUS_COLOR[r.status]||'var(--muted)'}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                <div>
                  <div style={{ display:'flex', gap:6, marginBottom:6, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={S.tag(STATUS_COLOR[r.status]||'var(--muted)')}>{r.status}</span>
                    <span style={S.tag('var(--gold)')}>{TYPE_LABEL[r.report_type]||r.report_type}</span>
                    <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'var(--ffm)' }}>
                      {r.period} {r.period_year}
                    </span>
                  </div>
                  <div style={{ fontSize:16, fontWeight:700 }}>{r.title}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                    Prepared by {r.prepared_by_name}
                    {r.sent_at && ` · Sent ${new Date(r.sent_at).toLocaleDateString('en-GB')}`}
                    {r.sent_count > 0 && ` · ${r.sent_count} delivered`}
                    {r.failed_count > 0 && ` · ${r.failed_count} failed`}
                  </div>
                </div>
                <div style={{ display:'flex', gap:7, flexShrink:0 }}>
                  <button style={{ ...S.btnG, fontSize:12 }}
                    onClick={async () => {
                      const res = await reportingApi.getReport(r.id);
                      setPreview({ id: r.id, html: res.data.html_content });
                    }}>
                    Preview
                  </button>
                  <button style={{ ...S.btnG, fontSize:12 }}
                    onClick={() => downloadPdf(r.id)}
                    title="Download PDF to local computer">
                    ↓ PDF
                  </button>
                  <button style={{ ...S.btnG, fontSize:12 }}
                    onClick={() => exportPdf(r.id)}
                    title="Save PDF to S3">
                    {exporting === r.id ? '⟳…' : '☁ S3'}
                  </button>
                  {r.s3_key && (
                    <span style={{ fontSize:10, color:'var(--green)', fontFamily:'var(--ffm)',
                      alignSelf:'center', maxWidth:180, overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                      title={r.s3_key}>
                      ✓ {r.s3_key.split('/').pop()}
                    </span>
                  )}
                  {r.status !== 'sent' && (
                    <button style={{ ...S.btnP, fontSize:12 }}
                      onClick={() => sendReport(r.id, [])}>
                      {sending === r.id ? '⟳ Sending…' : '↗ Send'}
                    </button>
                  )}
                  {r.failed_count > 0 && (
                    <button style={{ ...S.btnG, fontSize:12 }}
                      onClick={async () => {
                        const res = await reportingApi.retryFailed(r.id);
                        toast(`Retried ${res.data.retried} delivery(ies)`); load();
                      }}>
                      Retry failed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'recipients' && (
        <div>
          {loading ? <Spinner /> : recipients.length === 0 ? (
            <div style={{ ...S.card, textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
              <div style={{ fontSize:28, opacity:.2, marginBottom:12 }}>⊙</div>
              <div style={{ fontWeight:600, marginBottom:6 }}>No recipients yet</div>
              <div style={{ fontSize:12 }}>Add LP and investor email addresses</div>
            </div>
          ) : (
            <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Name','Email','Organisation','Language',''].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10,
                        color:'var(--muted)', fontWeight:700, textTransform:'uppercase',
                        letterSpacing:'0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recipients.map(rec => (
                    <tr key={rec.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'11px 14px', fontWeight:600, fontSize:13 }}>{rec.name}</td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)', fontFamily:'var(--ffm)' }}>{rec.email}</td>
                      <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>{rec.organisation||'—'}</td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={S.tag(rec.language==='fr'?'var(--blue)':'var(--green)')}>
                          {rec.language==='fr'?'FR':'EN'}
                        </span>
                      </td>
                      <td style={{ padding:'11px 14px', textAlign:'right' }}>
                        <button onClick={() => removeRecipient(rec.id)}
                          style={{ fontSize:12, color:'var(--red)', background:'rgba(239,68,68,.06)',
                            border:'1px solid rgba(239,68,68,.2)', borderRadius:'var(--r)',
                            padding:'4px 10px', cursor:'pointer' }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Generate report modal */}
      <Modal open={showGen} onClose={() => setShowGen(false)} title="Generate LP Report" width={580}>
        <Inp label="Report title *" value={genForm.title}
          onChange={e => setGenForm(f=>({...f,title:e.target.value}))}
          placeholder={`Q${new Date().getMonth()>8?4:new Date().getMonth()>5?3:new Date().getMonth()>2?2:1} ${new Date().getFullYear()} LP Report`} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Sel label="Report type" value={genForm.report_type}
            onChange={e => setGenForm(f=>({...f,report_type:e.target.value}))}
            options={[{value:'quarterly',label:'Quarterly'},{value:'annual',label:'Annual'},
                      {value:'flash',label:'Flash Update'},{value:'custom',label:'Custom'}]} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <Sel label="Period" value={genForm.period}
              onChange={e => setGenForm(f=>({...f,period:e.target.value}))}
              options={['Q1','Q2','Q3','Q4','annual','custom'].map(v=>({value:v,label:v.toUpperCase()}))} />
            <Inp label="Year" type="number" value={genForm.period_year}
              onChange={e => setGenForm(f=>({...f,period_year:parseInt(e.target.value)}))} />
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={S.lbl}>Include strategies</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {[['include_pe','Private Equity'],['include_credit','Private Credit'],
              ['include_commodities','Commodities'],['include_re','Real Estate']].map(([k,l]) => (
              <label key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer' }}>
                <input type="checkbox" checked={genForm[k]}
                  onChange={e => setGenForm(f=>({...f,[k]:e.target.checked}))} />
                {l}
              </label>
            ))}
          </div>
        </div>
        <div style={{ background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.2)', borderRadius:'var(--r)', padding:'10px 14px', marginBottom:14, fontSize:12, color:'var(--muted)' }}>
          ⊙ The report will pull live portfolio data, build a Citadel-style HTML report, and show a preview before sending.
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={S.btnP} onClick={generate} disabled={generating}>
            {generating ? '⟳ Generating…' : 'Generate report'}
          </button>
          <button style={S.btnG} onClick={() => setShowGen(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Add recipient modal */}
      <Modal open={showAddRec} onClose={() => setShowAddRec(false)} title="Add LP Recipient" width={460}>
        <Inp label="Full name *" value={recForm.name} onChange={e => setRecForm(f=>({...f,name:e.target.value}))} placeholder="Jean-Baptiste Kamga" />
        <Inp label="Email *" type="email" value={recForm.email} onChange={e => setRecForm(f=>({...f,email:e.target.value}))} placeholder="jb@fundname.com" />
        <Inp label="Organisation" value={recForm.organisation} onChange={e => setRecForm(f=>({...f,organisation:e.target.value}))} placeholder="Emergence Capital Partners" />
        <Sel label="Language preference" value={recForm.language} onChange={e => setRecForm(f=>({...f,language:e.target.value}))}
          options={[{value:'en',label:'English'},{value:'fr',label:'French'}]} />
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button style={S.btnP} onClick={addRecipient}>Add recipient</button>
          <button style={S.btnG} onClick={() => setShowAddRec(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

// ── DD ENGINE CONNECTION BANNER ───────────────────────────────────────────────
function DDEngineConnectionBanner() {
  const ddUrl = localStorage.getItem('alphacore_dd_engine_url');
  if (ddUrl) return (
    <div style={{ background:'rgba(34,211,160,.06)', border:'1px solid rgba(34,211,160,.2)',
      borderRadius:'var(--r)', padding:'8px 14px', marginBottom:14,
      display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', flexShrink:0 }} />
      <span style={{ fontSize:12, color:'var(--green)', fontWeight:600 }}>DD Engine connected</span>
      <span style={{ fontSize:11, color:'var(--muted)' }}>{ddUrl}</span>
      <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
        Click "◎ DD Engine" on any deal to open it for AI analysis
      </span>
    </div>
  );
  return (
    <div style={{ background:'rgba(245,158,11,.05)', border:'1px solid rgba(245,158,11,.2)',
      borderRadius:'var(--r)', padding:'8px 14px', marginBottom:14,
      display:'flex', alignItems:'center', gap:10 }}>
      <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--amber)', flexShrink:0 }} />
      <span style={{ fontSize:12, color:'var(--amber)', fontWeight:600 }}>DD Engine not connected</span>
      <span style={{ fontSize:11, color:'var(--muted)' }}>
        Connect via Integrations → DD Engine to enable AI-powered due diligence
      </span>
    </div>
  );
}

// ── INTEGRATIONS PAGE ─────────────────────────────────────────────────────────
function IntegrationsPage({ toast }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [editing, setEditing]         = useState(null);  // initiative key being edited
  const [form, setForm]               = useState({ base_url:'', api_key_raw:'', label:'' });
  const [pinging, setPinging]         = useState(null);

  // All current + future initiatives — each will get a connection card
  const INITIATIVES = [
    { key:'dd_engine',    label:'DD Engine',           icon:'◎', desc:'Initiative 06 — Automated due diligence and document analysis', color:'#10b981' },
    { key:'autoops',      label:'AutoOps',             icon:'⬡', desc:'Initiative 13 — KYC, compliance automation, operational workflows', color:'#3b82f6' },
    { key:'reporting',    label:'Reporting Engine',    icon:'⊙', desc:'Initiative 08 — Automated LP report generation and delivery', color:'#c9a84c' },
    { key:'ic_workflow',  label:'IC Workflow',         icon:'⊞', desc:'Initiative 07 — Digital investment committee and voting', color:'#8b5cf6' },
    { key:'knowledge',    label:'Knowledge Base',      icon:'◧', desc:'Initiative 10 — Internal wiki, research, and document search', color:'#f59e0b' },
    { key:'risk',         label:'Risk Analytics',      icon:'⚠', desc:'Initiative 09 — Cross-fund risk aggregation and monitoring', color:'#ef4444' },
    { key:'docs',         label:'Document Infra',      icon:'◈', desc:'Initiative 11 — Encrypted vault, version control, audit trail', color:'#64748b' },
    { key:'deal_flow',    label:'Deal Flow Intel',     icon:'◉', desc:'Initiative 02 — Automated deal sourcing and screening', color:'#22d3a0' },
    { key:'investor_crm', label:'Investor CRM',        icon:'◎', desc:'Initiative 03 — LP relationship management', color:'#a78bfa' },
    { key:'data_warehouse','label':'Data Warehouse',   icon:'⬡', desc:'Initiative 05 — S3 Parquet + Athena CDM layer', color:'#3b82f6' },
    { key:'custom',       label:'Custom Integration',  icon:'⊕', desc:'Connect any custom service or future initiative', color:'#64748b' },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const r = await accountsApi.listIntegrations();
      setConnections(r.data);
    } catch { setConnections([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const connFor = (key) => connections.find(c => c.initiative === key);

  const startEdit = (key) => {
    const c = connFor(key);
    setForm({ base_url: c?.base_url || '', api_key_raw:'', label: c?.label || '' });
    setEditing(key);
  };

  const save = async (key) => {
    try {
      await accountsApi.saveIntegration({ initiative: key, ...form });
      // Cache DD Engine URL locally for the frontend integration
      if (key === 'dd_engine') {
        if (form.base_url) localStorage.setItem('alphacore_dd_engine_url', form.base_url);
        else localStorage.removeItem('alphacore_dd_engine_url');
      }
      toast('Integration saved');
      setEditing(null);
      load();
    } catch { toast('Save failed', 'error'); }
  };

  const ping = async (id, key) => {
    setPinging(key);
    try {
      const r = await accountsApi.pingIntegration(id);
      toast(r.data.ping_ok ? `${key} — connection OK` : `${key} — connection failed`);
      load();
    } catch { toast('Ping failed', 'error'); }
    setPinging(null);
  };

  return (
    <div className="fade-up">
      <PageHeader title="Integrations" sub="Connect AlphaCore to every initiative — current and future" />
      {loading ? <Spinner /> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
          {INITIATIVES.map(ini => {
            const conn  = connFor(ini.key);
            const isOn  = conn?.is_active && conn?.base_url;
            const ok    = conn?.ping_ok;
            const isEd  = editing === ini.key;
            return (
              <div key={ini.key} style={{ background:'var(--surface)', border:`1px solid var(--border)`,
                borderLeft:`3px solid ${isOn ? ini.color : 'var(--border)'}`,
                borderRadius:'var(--rl)', padding:'14px 16px' }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:18, color: isOn ? ini.color : 'var(--muted)' }}>{ini.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:2 }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>{ini.label}</span>
                      <span style={{ width:7, height:7, borderRadius:'50%', flexShrink:0,
                        background: isOn ? (ok ? 'var(--green)' : 'var(--amber)') : 'var(--border)',
                        display:'inline-block' }} />
                      <span style={{ fontSize:10, color: isOn ? (ok ? 'var(--green)' : 'var(--amber)') : 'var(--muted)' }}>
                        {isOn ? (ok ? 'connected' : 'not verified') : 'not connected'}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>{ini.desc}</div>
                  </div>
                </div>

                {/* Connected info */}
                {isOn && !isEd && (
                  <div style={{ background:'var(--surface2)', borderRadius:'var(--r)', padding:'7px 10px',
                    marginBottom:8, fontSize:11, color:'var(--muted)', fontFamily:'var(--ffm)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {conn.base_url}
                  </div>
                )}

                {/* Edit form */}
                {isEd && (
                  <div style={{ marginBottom:8 }}>
                    <Inp label="Base URL" value={form.base_url}
                      onChange={e => setForm(f=>({...f,base_url:e.target.value}))}
                      placeholder="http://localhost:8081 or https://your-domain.com" />
                    <Inp label="API key (optional)" value={form.api_key_raw}
                      onChange={e => setForm(f=>({...f,api_key_raw:e.target.value}))}
                      placeholder="Leave blank to keep existing" />
                    <Inp label="Custom label (optional)" value={form.label}
                      onChange={e => setForm(f=>({...f,label:e.target.value}))}
                      placeholder={ini.label} />
                    <div style={{ display:'flex', gap:6, marginTop:8 }}>
                      <button style={{ ...S.btnP, fontSize:11, padding:'5px 12px' }}
                        onClick={() => save(ini.key)}>Save</button>
                      <button style={{ ...S.btnG, fontSize:11, padding:'5px 12px' }}
                        onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {!isEd && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button style={{ ...S.btnG, fontSize:11, padding:'4px 11px' }}
                      onClick={() => startEdit(ini.key)}>
                      {isOn ? 'Edit' : 'Connect'}
                    </button>
                    {isOn && conn?.id && (
                      <button style={{ ...S.btnG, fontSize:11, padding:'4px 11px' }}
                        disabled={pinging === ini.key}
                        onClick={() => ping(conn.id, ini.key)}>
                        {pinging === ini.key ? '…' : 'Test connection'}
                      </button>
                    )}
                    {isOn && (
                      <button style={{ ...S.btnG, fontSize:11, padding:'4px 11px',
                        color:'var(--red)', borderColor:'rgba(239,68,68,.3)' }}
                        onClick={async () => {
                          await accountsApi.saveIntegration({ initiative:ini.key, base_url:'', api_key_raw:'' });
                          if (ini.key === 'dd_engine') localStorage.removeItem('alphacore_dd_engine_url');
                          toast('Disconnected'); load();
                        }}>Disconnect</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── API KEYS PAGE ─────────────────────────────────────────────────────────────
function APIKeysPage({ toast }) {
  const [keys, setKeys]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]       = useState({ name:'', scope:'all' });
  const [newKey, setNewKey]   = useState(null);   // shown once after creation

  const SCOPES = [
    { value:'all',        label:'All initiatives' },
    { value:'dd_engine',  label:'DD Engine only' },
    { value:'autoops',    label:'AutoOps only' },
    { value:'reporting',  label:'Reporting only' },
    { value:'ic_workflow',label:'IC Workflow only' },
    { value:'knowledge',  label:'Knowledge Base only' },
  ];

  const load = async () => {
    setLoading(true);
    try { const r = await accountsApi.listApiKeys(); setKeys(r.data); }
    catch { setKeys([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) { toast('Key name required', 'error'); return; }
    try {
      const r = await accountsApi.createApiKey(form);
      setNewKey(r.data.raw_key);
      setShowCreate(false);
      setForm({ name:'', scope:'all' });
      toast('API key created — copy it now, it will not be shown again');
      load();
    } catch { toast('Failed', 'error'); }
  };

  const revoke = async (id, name) => {
    if (!confirm(`Revoke API key "${name}"? Any connected service using this key will lose access.`)) return;
    try {
      await accountsApi.revokeApiKey(id);
      toast('Key revoked'); load();
    } catch { toast('Failed', 'error'); }
  };

  return (
    <div className="fade-up">
      <PageHeader title="Integration API Keys"
        sub="Secure keys for connecting DD Engine, AutoOps, and future initiatives to AlphaCore"
        action={<button style={S.btnP} onClick={() => setShowCreate(true)}>+ Create key</button>} />

      {/* One-time key display */}
      {newKey && (
        <div style={{ background:'rgba(34,211,160,.06)', border:'1px solid rgba(34,211,160,.3)',
          borderRadius:'var(--rl)', padding:'16px 18px', marginBottom:18 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight:700, color:'var(--green)', fontSize:13 }}>
              ✓ API key created — copy it now
            </div>
            <button style={{ ...S.btnG, fontSize:11, padding:'4px 10px' }}
              onClick={() => setNewKey(null)}>Dismiss</button>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:'var(--r)', padding:'10px 14px',
            fontFamily:'var(--ffm)', fontSize:13, color:'var(--green)',
            letterSpacing:'.04em', wordBreak:'break-all', marginBottom:8 }}>
            {newKey}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button style={S.btnP} onClick={() => {
              navigator.clipboard.writeText(newKey);
              toast('Copied to clipboard');
            }}>Copy key</button>
            <span style={{ fontSize:12, color:'var(--muted)' }}>
              This key will NOT be shown again. Store it securely.
            </span>
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? <Spinner /> : keys.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
          <div style={{ fontSize:28, opacity:.2, marginBottom:12 }}>◈</div>
          <div style={{ fontWeight:600, marginBottom:6 }}>No API keys yet</div>
          <div style={{ fontSize:12 }}>Create a key to connect DD Engine, AutoOps, and other initiatives</div>
        </div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                {['Name','Prefix','Scope','Created','Last used',''].map(h => (
                  <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10,
                    color:'var(--muted)', fontWeight:700, textTransform:'uppercase',
                    letterSpacing:'0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'11px 14px', fontWeight:600, fontSize:13 }}>{k.name}</td>
                  <td style={{ padding:'11px 14px', fontFamily:'var(--ffm)', fontSize:12,
                    color:'var(--blue)' }}>{k.prefix}…</td>
                  <td style={{ padding:'11px 14px' }}>
                    <span style={S.tag('var(--gold)')}>{k.scope}</span>
                  </td>
                  <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>
                    {k.created_at ? new Date(k.created_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString('en-GB') : 'Never'}
                  </td>
                  <td style={{ padding:'11px 14px', textAlign:'right' }}>
                    <button onClick={() => revoke(k.id, k.name)}
                      style={{ fontSize:12, color:'var(--red)', background:'rgba(239,68,68,.06)',
                        border:'1px solid rgba(239,68,68,.2)', borderRadius:'var(--r)',
                        padding:'4px 10px', cursor:'pointer' }}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create key modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create API Key" width={460}>
        <Inp label="Key name *" value={form.name}
          onChange={e => setForm(f=>({...f,name:e.target.value}))}
          placeholder="DD Engine production" />
        <Sel label="Scope" value={form.scope}
          onChange={e => setForm(f=>({...f,scope:e.target.value}))}
          options={SCOPES} />
        <div style={{ background:'rgba(201,168,76,.06)', border:'1px solid rgba(201,168,76,.2)',
          borderRadius:'var(--r)', padding:'10px 14px', margin:'12px 0', fontSize:12,
          color:'var(--muted)' }}>
          ◈ The full key is shown <strong>once</strong> at creation.
          Only a SHA-256 hash is stored. Copy and store it securely.
        </div>
        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button style={S.btnP} onClick={create}>Create key</button>
          <button style={S.btnG} onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

// ── PROFILE PAGE ──────────────────────────────────────────────────────────────
function ProfilePage({ toast }) {
  const user       = useStore(s => s.user);
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name:  user?.last_name  || '',
    email:      user?.email      || '',
  });
  const [pwForm, setPwForm]     = useState({ current:'', new1:'', new2:'' });
  const [section, setSection]   = useState('profile');  // profile | password | admin
  const [saving, setSaving]     = useState(false);

  const name = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'User';
  const initials = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await accountsApi.updateMe(form);
      useStore.setState(s => ({ user: { ...s.user, ...form } }));
      toast('Profile updated');
    } catch { toast('Failed', 'error'); }
    setSaving(false);
  };

  const changePassword = async () => {
    if (pwForm.new1 !== pwForm.new2) { toast('Passwords do not match', 'error'); return; }
    if (pwForm.new1.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    try {
      await accountsApi.updateMe({ password: pwForm.new1, current_password: pwForm.current });
      setPwForm({ current:'', new1:'', new2:'' });
      toast('Password changed');
    } catch { toast('Failed — check your current password', 'error'); }
  };

  const stepDown = async () => {
    if (!confirm('Step down as administrator? You will become an Analyst. Another admin must remain.')) return;
    try {
      await accountsApi.relinquishAdmin();
      toast('You have stepped down from administrator');
    } catch (e) {
      toast(e?.response?.data?.error || 'Failed', 'error');
    }
  };

  return (
    <div className="fade-up">
      <PageHeader title="My Profile" sub="Account settings, password, and admin delegation" />
      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:18, maxWidth:800 }}>
        {/* Left nav */}
        <div style={{ ...S.card, padding:'8px', height:'fit-content' }}>
          {[['profile','Profile details'],['password','Change password'],['admin','Admin settings']].map(([k,l]) => (
            <button key={k} onClick={() => setSection(k)}
              style={{ display:'block', width:'100%', textAlign:'left', padding:'9px 12px',
                borderRadius:'var(--r)', fontSize:13, marginBottom:2, cursor:'pointer',
                background: section===k ? 'var(--blue-dim)' : 'none',
                color: section===k ? 'var(--blue)' : 'var(--muted)',
                borderLeft: `2px solid ${section===k ? 'var(--blue)' : 'transparent'}`,
                fontWeight: section===k ? 600 : 400 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={S.card}>
          {section === 'profile' && (
            <>
              {/* Avatar */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20,
                paddingBottom:16, borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:56, height:56, background:'var(--blue)', borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:20, fontWeight:700, color:'#fff' }}>{initials}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:16 }}>{name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{user?.email}</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <Inp label="First name" value={form.first_name}
                  onChange={e => setForm(f=>({...f,first_name:e.target.value}))} />
                <Inp label="Last name" value={form.last_name}
                  onChange={e => setForm(f=>({...f,last_name:e.target.value}))} />
              </div>
              <Inp label="Email" type="email" value={form.email}
                onChange={e => setForm(f=>({...f,email:e.target.value}))} />
              <div style={{ marginTop:14 }}>
                <button style={S.btnP} onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </>
          )}

          {section === 'password' && (
            <>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Change password</div>
              <Inp label="Current password" type="password" value={pwForm.current}
                onChange={e => setPwForm(f=>({...f,current:e.target.value}))} />
              <Inp label="New password" type="password" value={pwForm.new1}
                onChange={e => setPwForm(f=>({...f,new1:e.target.value}))} />
              <Inp label="Confirm new password" type="password" value={pwForm.new2}
                onChange={e => setPwForm(f=>({...f,new2:e.target.value}))} />
              <div style={{ marginTop:14 }}>
                <button style={S.btnP} onClick={changePassword}>Update password</button>
              </div>
            </>
          )}

          {section === 'admin' && (
            <>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>Administrator settings</div>
              <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, marginBottom:16 }}>
                As an Owner or Admin, you can relinquish your administrator role.
                Another administrator must exist before you can step down.
              </p>
              <div style={{ background:'rgba(239,68,68,.06)', border:'1px solid rgba(239,68,68,.2)',
                borderRadius:'var(--r)', padding:'14px 16px' }}>
                <div style={{ fontWeight:600, fontSize:13, color:'var(--red)', marginBottom:6 }}>
                  Step down as administrator
                </div>
                <p style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, marginBottom:12 }}>
                  Your role will change to Analyst. You will no longer be able to approve
                  members, manage roles, or access admin settings.
                </p>
                <button style={{ ...S.btnP, background:'var(--red)', fontSize:12 }}
                  onClick={stepDown}>
                  Step down
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ── KNOWLEDGE BASE ─────────────────────────────────────────────────────────────
function KnowledgeBase({ toast }) {
  const [collections, setCollections] = useState([]);
  const [articles, setArticles]       = useState([]);
  const [pinned, setPinned]           = useState([]);
  const [selected, setSelected]       = useState(null);  // full article object
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [filterCat, setFilterCat]     = useState('');
  const [filterColl, setFilterColl]   = useState('');
  const [viewMode, setViewMode]       = useState('browse'); // browse | article | new | edit
  const [comment, setComment]         = useState('');
  const [showNewColl, setShowNewColl] = useState(false);
  const [collForm, setCollForm]       = useState({ name:'', description:'', icon:'◧', color:'#3b82f6' });

  // Article form
  const BLANK_ART = {
    title:'', content:'', summary:'', category:'other', language:'en',
    tags:'', collection:'', linked_deal_name:'', is_pinned:false, is_draft:false,
    change_note:'',
  };
  const [artForm, setArtForm] = useState(BLANK_ART);

  const CATEGORY_LABELS = {
    deal_note:'Deal Note', sector_research:'Sector Research',
    investment_thesis:'Investment Thesis', meeting_minutes:'Meeting Minutes',
    regulatory:'Regulatory', country_profile:'Country Profile',
    legal:'Legal Reference', post_mortem:'Post-Mortem',
    process:'Process & Playbook', other:'Other',
  };
  const CATEGORY_COLORS = {
    deal_note:'#3b82f6', sector_research:'#10b981', investment_thesis:'#c9a84c',
    meeting_minutes:'#8b5cf6', regulatory:'#ef4444', country_profile:'#f59e0b',
    legal:'#a78bfa', post_mortem:'#64748b', process:'#22d3a0', other:'#64748b',
  };

  const load = async () => {
    setLoading(true);
    try {
      const [cols, arts, pins] = await Promise.all([
        knowledgeApi.listCollections(),
        knowledgeApi.recent(50),
        knowledgeApi.pinned(),
      ]);
      setCollections(cols.data.results || cols.data);
      setArticles(arts.data);
      setPinned(pins.data);
    } catch { toast('Failed to load knowledge base', 'error'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Search ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await knowledgeApi.searchArticles(search, { category: filterCat || undefined });
        setSearchResults(r.data);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [search, filterCat]);

  // ── Open article ─────────────────────────────────────────────────────────────
  const openArticle = async (art) => {
    try {
      const r = await knowledgeApi.getArticle(art.id);
      setSelected(r.data);
      setViewMode('article');
      knowledgeApi.recordView(art.id).catch(() => {});
    } catch { toast('Failed to load article', 'error'); }
  };

  // ── Save article ─────────────────────────────────────────────────────────────
  const saveArticle = async () => {
    if (!artForm.title.trim()) { toast('Title is required', 'error'); return; }
    if (!artForm.content.trim()) { toast('Content is required', 'error'); return; }
    const payload = {
      ...artForm,
      tags: artForm.tags ? artForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      collection: artForm.collection || null,
    };
    try {
      if (viewMode === 'edit' && selected) {
        const r = await knowledgeApi.updateArticle(selected.id, payload);
        setSelected(r.data);
        setViewMode('article');
        toast('Article updated');
      } else {
        const r = await knowledgeApi.createArticle(payload);
        setSelected(r.data);
        setViewMode('article');
        toast('Article created');
      }
      setArtForm(BLANK_ART);
      load();
    } catch { toast('Failed to save article', 'error'); }
  };

  const startEdit = () => {
    if (!selected) return;
    setArtForm({
      title: selected.title, content: selected.content,
      summary: selected.summary || '', category: selected.category,
      language: selected.language,
      tags: (selected.tags || []).join(', '),
      collection: selected.collection || '',
      linked_deal_name: selected.linked_deal_name || '',
      is_pinned: selected.is_pinned, is_draft: selected.is_draft,
      change_note: '',
    });
    setViewMode('edit');
  };

  const togglePin = async (art) => {
    try {
      const r = await knowledgeApi.togglePin(art.id || selected?.id);
      toast(r.data.is_pinned ? 'Pinned' : 'Unpinned');
      load();
      if (selected && selected.id === (art.id || selected.id)) {
        setSelected(s => ({ ...s, is_pinned: r.data.is_pinned }));
      }
    } catch { toast('Failed', 'error'); }
  };

  const addComment = async () => {
    if (!comment.trim() || !selected) return;
    try {
      const r = await knowledgeApi.addComment(selected.id, { content: comment });
      setSelected(s => ({ ...s, comments: [...(s.comments || []), r.data] }));
      setComment('');
    } catch { toast('Failed', 'error'); }
  };

  const createCollection = async () => {
    if (!collForm.name.trim()) { toast('Name required', 'error'); return; }
    try {
      await knowledgeApi.createCollection(collForm);
      setShowNewColl(false); setCollForm({ name:'', description:'', icon:'◧', color:'#3b82f6' });
      toast('Collection created'); load();
    } catch { toast('Failed', 'error'); }
  };

  // ── Filtered article list for browse ─────────────────────────────────────────
  const displayList = searchResults !== null ? searchResults
    : articles.filter(a => {
        const catOk  = !filterCat  || a.category === filterCat;
        const collOk = !filterColl || String(a.collection) === String(filterColl);
        return catOk && collOk;
      });

  // ── Simple markdown → HTML (inline only — safe) ───────────────────────────
  const mdToHtml = (text) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--surface2);padding:1px 5px;border-radius:3px;font-family:var(--ffm);font-size:12px">$1</code>')
      .replace(/^### (.+)$/gm, '<div style="font-size:13px;font-weight:700;color:var(--text);margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border)">$1</div>')
      .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:700;color:var(--text);margin:18px 0 8px">$1</div>')
      .replace(/^# (.+)$/gm, '<div style="font-size:18px;font-weight:700;color:var(--text);margin:20px 0 10px">$1</div>')
      .replace(/^- (.+)$/gm, '<div style="display:flex;gap:8px;padding:3px 0"><span style="color:var(--muted)">●</span>$1</div>')
      .replace(/^> (.+)$/gm, '<div style="border-left:3px solid var(--blue);padding:6px 12px;background:var(--surface2);border-radius:0 var(--r) var(--r) 0;color:var(--muted);font-style:italic;margin:8px 0">$1</div>')
      .split('
').join('<br/>');
  };

  return (
    <div className="fade-up">
      <PageHeader title="Knowledge Base"
        sub="Internal wiki — deal notes, research, regulatory guidance, playbooks"
        action={
          <div style={{ display:'flex', gap:8 }}>
            <button style={S.btnG} onClick={() => setShowNewColl(true)}>+ Collection</button>
            <button style={S.btnP} onClick={() => { setArtForm(BLANK_ART); setViewMode('new'); }}>+ New article</button>
          </div>
        } />

      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:16, height:'calc(100vh - 160px)' }}>

        {/* ── Left panel ────────────────────────────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:0, overflow:'hidden' }}>

          {/* Search */}
          <div style={{ ...S.card, padding:'10px 12px', marginBottom:10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search articles…"
              style={{ ...S.input, fontSize:12 }} />
          </div>

          {/* Filters */}
          <div style={{ ...S.card, padding:'10px 12px', marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>Filter</div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ ...S.input, fontSize:11, marginBottom:7 }}>
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k,v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={filterColl} onChange={e => setFilterColl(e.target.value)}
              style={{ ...S.input, fontSize:11 }}>
              <option value="">All collections</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          {/* Pinned articles */}
          {pinned.length > 0 && !search && (
            <div style={{ ...S.card, marginBottom:10, padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>⊙ Pinned</div>
              {pinned.map(a => (
                <div key={a.id} onClick={() => openArticle(a)}
                  style={{ fontSize:12, padding:'5px 7px', borderRadius:'var(--r)', cursor:'pointer',
                    color: selected?.id===a.id ? 'var(--blue)' : 'var(--muted)',
                    background: selected?.id===a.id ? 'var(--blue-dim)' : 'none',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background=selected?.id===a.id?'var(--blue-dim)':'none'}>
                  {a.title}
                </div>
              ))}
            </div>
          )}

          {/* Collections */}
          {!search && (
            <div style={{ ...S.card, flex:1, overflow:'hidden', padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>Collections</div>
              {loading ? <Spinner /> : collections.length === 0 ? (
                <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>No collections yet</div>
              ) : collections.map(c => (
                <div key={c.id}
                  onClick={() => setFilterColl(filterColl===String(c.id)?'':String(c.id))}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 7px',
                    borderRadius:'var(--r)', cursor:'pointer', marginBottom:2,
                    background: filterColl===String(c.id) ? 'var(--blue-dim)' : 'none',
                    borderLeft: `2px solid ${filterColl===String(c.id) ? c.color : 'transparent'}` }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background=filterColl===String(c.id)?'var(--blue-dim)':'none'}>
                  <span style={{ color:c.color, fontSize:14 }}>{c.icon}</span>
                  <span style={{ fontSize:12, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{c.article_count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Search results list */}
          {search && (
            <div style={{ ...S.card, flex:1, overflowY:'auto', padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:7 }}>
                {searchResults === null ? 'Searching…' : `${searchResults.length} result${searchResults.length!==1?'s':''}`}
              </div>
              {(searchResults || []).map(a => (
                <div key={a.id} onClick={() => openArticle(a)}
                  style={{ padding:'7px 8px', borderRadius:'var(--r)', cursor:'pointer', marginBottom:4,
                    background: selected?.id===a.id ? 'var(--blue-dim)' : 'var(--surface2)',
                    border:`1px solid ${selected?.id===a.id?'var(--blue)':'var(--border)'}` }}>
                  <div style={{ fontSize:12, fontWeight:600, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel ───────────────────────────────────────────────────── */}
        <div style={{ ...S.card, display:'flex', flexDirection:'column', overflow:'hidden', padding:0 }}>

          {/* BROWSE mode */}
          {viewMode === 'browse' && (
            <div style={{ flex:1, overflowY:'auto' }}>
              {loading ? (
                <div style={{ padding:40, display:'flex', justifyContent:'center' }}><Spinner /></div>
              ) : displayList.length === 0 ? (
                <div style={{ padding:'60px 24px', textAlign:'center', color:'var(--muted)' }}>
                  <div style={{ fontSize:28, opacity:.2, marginBottom:12 }}>◎</div>
                  <div style={{ fontWeight:600, marginBottom:6 }}>
                    {search ? `No results for "${search}"` : 'No articles yet'}
                  </div>
                  <div style={{ fontSize:12 }}>
                    {search ? 'Try different keywords' : 'Create your first article to get started'}
                  </div>
                </div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                      {['Title','Category','Collection','Author','Views','Updated',''].map(h => (
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10,
                          color:'var(--muted)', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'.08em', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map(a => (
                      <tr key={a.id}
                        style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background .1s' }}
                        onClick={() => openArticle(a)}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e => e.currentTarget.style.background='none'}>
                        <td style={{ padding:'10px 14px', maxWidth:260 }}>
                          <div style={{ fontWeight:600, fontSize:13, marginBottom:2,
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {a.is_pinned && <span style={{ color:'var(--gold)', marginRight:5 }}>⊙</span>}
                            {a.title}
                          </div>
                          {a.summary && <div style={{ fontSize:11, color:'var(--muted)',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.summary}</div>}
                          {(a.tags||[]).length > 0 && (
                            <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
                              {a.tags.slice(0,3).map(t => (
                                <span key={t} style={{ fontSize:9, padding:'1px 6px', borderRadius:3,
                                  background:'var(--surface2)', color:'var(--muted)',
                                  border:'1px solid var(--border)' }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ padding:'10px 14px', whiteSpace:'nowrap' }}>
                          <span style={{ ...S.tag(CATEGORY_COLORS[a.category]||'var(--muted)'), fontSize:9 }}>
                            {CATEGORY_LABELS[a.category]||a.category}
                          </span>
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>
                          {a.collection_name || '—'}
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)', whiteSpace:'nowrap' }}>
                          {a.author_name}
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)', fontFamily:'var(--ffm)', whiteSpace:'nowrap' }}>
                          {a.view_count}
                        </td>
                        <td style={{ padding:'10px 14px', fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>
                          {new Date(a.updated_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:10, color:'var(--blue)' }}>→</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ARTICLE view mode */}
          {viewMode === 'article' && selected && (
            <>
              {/* Article header */}
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
                      <span style={{ ...S.tag(CATEGORY_COLORS[selected.category]||'var(--muted)'), fontSize:9 }}>
                        {CATEGORY_LABELS[selected.category]}
                      </span>
                      {selected.language === 'fr' && <span style={S.tag('var(--blue)')}>FR</span>}
                      {selected.is_pinned && <span style={{ color:'var(--gold)', fontSize:13 }}>⊙</span>}
                      {selected.collection_name && (
                        <span style={{ fontSize:11, color:'var(--muted)' }}>in {selected.collection_name}</span>
                      )}
                      <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
                        v{selected.versions?.length || 1} · {selected.view_count} views
                      </span>
                    </div>
                    <div style={{ fontSize:19, fontWeight:700, lineHeight:1.3, marginBottom:6 }}>{selected.title}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>
                      {selected.author_name}
                      {selected.linked_deal_name && ` · Deal: ${selected.linked_deal_name}`}
                      {' · '}Updated {new Date(selected.updated_at).toLocaleDateString('en-GB')}
                    </div>
                    {(selected.tags||[]).length > 0 && (
                      <div style={{ display:'flex', gap:5, marginTop:8, flexWrap:'wrap' }}>
                        {selected.tags.map(t => (
                          <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:4,
                            background:'var(--surface2)', color:'var(--muted)',
                            border:'1px solid var(--border)' }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button style={{ ...S.btnG, fontSize:11 }} onClick={() => togglePin(selected)}>
                      {selected.is_pinned ? '⊙ Unpin' : '⊙ Pin'}
                    </button>
                    <button style={{ ...S.btnG, fontSize:11 }} onClick={startEdit}>Edit</button>
                    <button style={{ ...S.btnG, fontSize:11 }} onClick={() => { setSelected(null); setViewMode('browse'); }}>← Back</button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display:'flex', gap:2, padding:'6px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                {['content','versions','comments'].map(t => {
                  const label = t === 'versions' ? `Versions (${selected.versions?.length||0})`
                              : t === 'comments' ? `Comments (${selected.comments?.length||0})`
                              : 'Content';
                  return (
                    <button key={t} id={`kb-tab-${t}`}
                      onClick={() => {
                        document.querySelectorAll('[id^="kb-tab-"]').forEach(el => {
                          el.style.color = 'var(--muted)';
                          el.style.borderBottom = '1.5px solid transparent';
                          el.style.background = 'none';
                        });
                        const el = document.getElementById(`kb-tab-${t}`);
                        if (el) { el.style.color = 'var(--blue)'; el.style.borderBottom = '1.5px solid var(--blue)'; }
                        document.getElementById('kb-content-area').dataset.tab = t;
                        document.querySelectorAll('[id^="kb-pane-"]').forEach(p => p.style.display='none');
                        const pane = document.getElementById(`kb-pane-${t}`);
                        if (pane) pane.style.display='block';
                      }}
                      style={{ fontSize:12, padding:'4px 12px', borderRadius:'var(--r)',
                        color: t==='content'?'var(--blue)':'var(--muted)',
                        borderBottom: t==='content'?'1.5px solid var(--blue)':'1.5px solid transparent',
                        background:'none', cursor:'pointer', marginBottom:-1 }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div id="kb-content-area" data-tab="content" style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                {/* Content pane */}
                <div id="kb-pane-content">
                  <div style={{ fontSize:14, lineHeight:1.85, color:'var(--muted)' }}
                    dangerouslySetInnerHTML={{ __html: mdToHtml(selected.content) }} />
                </div>

                {/* Versions pane */}
                <div id="kb-pane-versions" style={{ display:'none' }}>
                  {!selected.versions?.length ? (
                    <p style={{ color:'var(--muted)', fontSize:13 }}>No version history.</p>
                  ) : selected.versions.map(v => (
                    <div key={v.id} style={{ padding:'10px 13px', borderRadius:'var(--r)',
                      marginBottom:7, background:'var(--surface2)', border:'1px solid var(--border)',
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
                          <span style={{ fontFamily:'var(--ffm)', fontSize:12, color:'var(--blue)', fontWeight:700 }}>v{v.version_num}</span>
                          <span style={{ fontSize:12, fontWeight:600 }}>{v.title}</span>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {v.change_note && `${v.change_note} · `}
                          {v.changed_by_name} · {new Date(v.created_at).toLocaleString('en-GB')}
                        </div>
                      </div>
                      {v.version_num < selected.versions.length && (
                        <button style={{ ...S.btnG, fontSize:11 }}
                          onClick={async () => {
                            if (!confirm(`Restore article to version ${v.version_num}?`)) return;
                            try {
                              const r = await knowledgeApi.restoreVersion(selected.id, v.version_num);
                              setSelected(r.data); toast(`Restored to v${v.version_num}`);
                            } catch { toast('Failed', 'error'); }
                          }}>
                          Restore
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Comments pane */}
                <div id="kb-pane-comments" style={{ display:'none' }}>
                  {selected.comments?.map(c => (
                    <div key={c.id} style={{ padding:'9px 13px', borderRadius:'var(--r)',
                      marginBottom:7, background:'var(--surface2)', border:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <span style={{ fontWeight:600, fontSize:12 }}>{c.author_name}</span>
                        <span style={{ fontSize:10, color:'var(--muted)' }}>{new Date(c.created_at).toLocaleString('en-GB')}</span>
                      </div>
                      <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, margin:0 }}>{c.content}</p>
                    </div>
                  ))}
                  <div style={{ marginTop:12 }}>
                    <textarea value={comment} onChange={e => setComment(e.target.value)}
                      placeholder="Add a comment…"
                      style={{ ...S.input, resize:'vertical', minHeight:65, marginBottom:8 }} />
                    <button style={{ ...S.btnP, fontSize:12 }} onClick={addComment}>Add comment</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* NEW / EDIT article mode */}
          {(viewMode === 'new' || viewMode === 'edit') && (
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>{viewMode === 'edit' ? 'Edit article' : 'New article'}</div>
                <button style={S.btnG} onClick={() => setViewMode(selected ? 'article' : 'browse')}>Cancel</button>
              </div>

              <Inp label="Title *" value={artForm.title}
                onChange={e => setArtForm(f=>({...f,title:e.target.value}))}
                placeholder="OHADA Uniform Act — Key Provisions for PE Investors" />

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                <Sel label="Category" value={artForm.category}
                  onChange={e => setArtForm(f=>({...f,category:e.target.value}))}
                  options={Object.entries(CATEGORY_LABELS).map(([k,v])=>({value:k,label:v}))} />
                <Sel label="Language" value={artForm.language}
                  onChange={e => setArtForm(f=>({...f,language:e.target.value}))}
                  options={[{value:'en',label:'English'},{value:'fr',label:'French'}]} />
                <Sel label="Collection" value={artForm.collection}
                  onChange={e => setArtForm(f=>({...f,collection:e.target.value}))}
                  options={[{value:'',label:'No collection'},...collections.map(c=>({value:String(c.id),label:`${c.icon} ${c.name}`}))]} />
              </div>

              <Inp label="Tags (comma-separated)" value={artForm.tags}
                onChange={e => setArtForm(f=>({...f,tags:e.target.value}))}
                placeholder="ohada, cameroon, pe, legal" />
              <Inp label="Linked deal name (optional)" value={artForm.linked_deal_name}
                onChange={e => setArtForm(f=>({...f,linked_deal_name:e.target.value}))}
                placeholder="Project Acme" />

              <div style={{ marginBottom:12 }}>
                <label style={S.lbl}>Content * <span style={{ fontWeight:400, color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>(Markdown supported: **bold**, *italic*, # headings, - lists, &gt; quotes)</span></label>
                <textarea value={artForm.content}
                  onChange={e => setArtForm(f=>({...f,content:e.target.value}))}
                  placeholder="Write your article here…&#10;&#10;## Overview&#10;&#10;Key points:&#10;- Point one&#10;- Point two"
                  style={{ ...S.input, resize:'vertical', minHeight:280, fontFamily:'var(--ffm)', fontSize:12, lineHeight:1.7 }} />
              </div>

              {viewMode === 'edit' && (
                <Inp label="Change note (optional)" value={artForm.change_note}
                  onChange={e => setArtForm(f=>({...f,change_note:e.target.value}))}
                  placeholder="What changed in this edit" />
              )}

              <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:6 }}>
                <button style={S.btnP} onClick={saveArticle}>
                  {viewMode === 'edit' ? 'Save changes' : 'Create article'}
                </button>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', color:'var(--muted)' }}>
                  <input type="checkbox" checked={artForm.is_draft}
                    onChange={e => setArtForm(f=>({...f,is_draft:e.target.checked}))} />
                  Save as draft
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', color:'var(--muted)' }}>
                  <input type="checkbox" checked={artForm.is_pinned}
                    onChange={e => setArtForm(f=>({...f,is_pinned:e.target.checked}))} />
                  Pin article
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New collection modal */}
      <Modal open={showNewColl} onClose={() => setShowNewColl(false)} title="New Collection" width={420}>
        <Inp label="Collection name *" value={collForm.name}
          onChange={e => setCollForm(f=>({...f,name:e.target.value}))}
          placeholder="OHADA Legal Reference" />
        <Inp label="Description" value={collForm.description}
          onChange={e => setCollForm(f=>({...f,description:e.target.value}))}
          placeholder="Key OHADA provisions, case law, and precedents" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Inp label="Icon (emoji)" value={collForm.icon}
            onChange={e => setCollForm(f=>({...f,icon:e.target.value}))}
            placeholder="◧" />
          <Inp label="Colour (hex)" value={collForm.color}
            onChange={e => setCollForm(f=>({...f,color:e.target.value}))}
            placeholder="#3b82f6" />
        </div>
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button style={S.btnP} onClick={createCollection}>Create collection</button>
          <button style={S.btnG} onClick={() => setShowNewColl(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}


function App() {
  const { isAuth, loadMe, logout, toasts, addToast, user } = useStore();
  const [tab, setTab]           = useState('dashboard');
  const [authPage, setAuthPage] = useState('signin'); // signin | signup
  const [theme, setTheme]       = useState(() => localStorage.getItem('ac_theme') || 'dark');
  const [lang, setLang]         = useState(() => localStorage.getItem('ac_lang')  || 'en');
  const t = (k) => I18N[lang]?.[k] || I18N.en[k] || k;
  const [profile, setProfile]   = useState(null);     // full profile from /me
  const [loading, setLoading]   = useState(true);

  const toast = (msg, type = 'success') => addToast(msg, type);

  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'ac-theme';
    el.textContent = THEME;
    document.head.appendChild(el);

    const init = async () => {
      // Handle Google OAuth callback — exchange session cookie for JWT
      // After allauth OAuth, the user is session-authenticated on the backend
      // We attempt to get a JWT by calling /me/ which works with session auth too
      const path = window.location.pathname;
      const isOAuthCallback = path === '/onboarding' || path === '/dashboard';

      if (isOAuthCallback || localStorage.getItem('access_token')) {
        try {
          const me = await accountsApi.me();
          // Store JWT tokens returned by /me/ (always fresh)
          if (me.data.tokens) {
            localStorage.setItem('access_token',  me.data.tokens.access);
            localStorage.setItem('refresh_token', me.data.tokens.refresh);
          }
          setProfile(me.data);
          useStore.setState({ user: me.data, isAuth: true });
          // Clean URL after OAuth redirect
          if (isOAuthCallback) {
            window.history.replaceState({}, '', '/');
          }
        } catch {
          localStorage.clear();
        }
      }
      setLoading(false);
    };
    init();
    return () => el.remove();
  }, []);

  const handleAuthSuccess = async (data) => {
    try {
      const me = await accountsApi.me();
      if (me.data.tokens) {
        localStorage.setItem('access_token',  me.data.tokens.access);
        localStorage.setItem('refresh_token', me.data.tokens.refresh);
      }
      setProfile(me.data);
      useStore.setState({ user: me.data, isAuth: true });
    } catch {}
  };

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
        <div style={{ width:34, height:34, border:'3px solid var(--border)', borderTop:'3px solid var(--blue)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      </div>
    );
  }

  // ── Not logged in ────────────────────────────────────────────────────────
  if (!localStorage.getItem('access_token') || !profile) {
    return authPage === 'signup'
      ? <SignUpPage onSuccess={handleAuthSuccess} goLogin={() => setAuthPage('signin')} />
      : <SignInPage onSuccess={handleAuthSuccess} goRegister={() => setAuthPage('signup')} />;
  }

  // ── Onboarding not done ──────────────────────────────────────────────────
  if (!profile.onboarding_done) {
    return <OnboardingWizard user={profile} onComplete={async () => {
      const me = await accountsApi.me();
      setProfile(me.data);
    }} />;
  }

  // ── Membership pending approval ──────────────────────────────────────────
  const activeMembership = profile.active_membership;
  if (!activeMembership) {
    // Check if they have a pending join request
    const checkStatus = async () => {
      const { data } = await accountsApi.myJoinStatus();
      if (data.status === 'approved') {
        const me = await accountsApi.me();
        setProfile(me.data);
      }
    };
    return <PendingApprovalScreen companyName={profile.active_company?.name} onRefresh={checkStatus} />;
  }

  const handleLogout = () => {
    localStorage.clear();
    setProfile(null);
    useStore.setState({ user: null, isAuth: false });
  };

  // Apply theme and language on change
  useEffect(() => {
    let el = document.getElementById('ac-theme-override');
    if (!el) { el = document.createElement('style'); el.id = 'ac-theme-override'; document.head.appendChild(el); }
    el.textContent = theme === 'light' ? THEME_LIGHT : '';
    localStorage.setItem('ac_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('ac_lang', lang);
  }, [lang]);

  const PAGES = {
    dashboard: <Dashboard />,
    deals:     <DealPipeline toast={toast} />,
    diligence: <DueDiligence toast={toast} />,
    committee: <ICWorkflow toast={toast} />,
    reporting:  <Reporting toast={toast} />,
    integrations: <IntegrationsPage toast={toast} />,
    apikeys:    <APIKeysPage toast={toast} />,
    profile:    <ProfilePage toast={toast} />,

    portfolio: <PortfolioMonitor toast={toast} />,
    documents: <DocumentRepository toast={toast} />,
    knowledge: <KnowledgeBase toast={toast} />,
    members:   <MembersPage membership={activeMembership} toast={toast} />,
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
      <Sidebar
          active={tab}
          setActive={setTab}
          user={profile?.user || profile}
          logout={handleLogout}
          company={profile?.active_company}
          membership={activeMembership}
          theme={theme}  setTheme={setTheme}
          lang={lang}    setLang={setLang}
          t={t}
        />
      <main style={{ marginLeft:220, flex:1, padding:'32px 36px', overflowY:'auto', minHeight:'100vh' }}>
        {PAGES[tab] || <Dashboard />}
      </main>
      <Toast toasts={toasts} />
    </div>
  );
}