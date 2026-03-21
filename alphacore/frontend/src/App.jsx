import { useState, useEffect, useCallback } from 'react';
import { dealsApi, ddApi, committeeApi, portfolioApi, docsApi, accountsApi } from './utils/api';
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
  { key:'dashboard',  icon:'⬡', label:'Dashboard' },
  { key:'deals',      icon:'◈', label:'Deal Pipeline' },
  { key:'diligence',  icon:'◎', label:'Due Diligence' },
  { key:'committee',  icon:'⊞', label:'IC Workflow' },
  { key:'portfolio',  icon:'◉', label:'Portfolio' },
  { key:'documents',  icon:'◧', label:'Documents' },
  { key:'members',    icon:'◈', label:'Team & Access' },
];

function Sidebar({ active, setActive, user, logout, company, membership }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name      = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username || 'User';
  const role      = membership?.role_label || membership?.role || 'Member';
  const initials  = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);

  return (
    <div style={{ width:220, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'fixed', top:0, bottom:0, left:0, zIndex:100 }}>

      {/* Logo + company name */}
      <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--blue)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:4 }}>AlphaCore</div>
        {company && (
          <div style={{ fontSize:12, color:'var(--text)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{company.name}</div>
        )}
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>Investment Platform</div>
      </div>

      {/* Navigation */}
      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        {NAV.map(n => (
          <button key={n.key} onClick={() => setActive(n.key)} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%', textAlign:'left',
            padding:'9px 12px', borderRadius:'var(--r)', marginBottom:2,
            color:      active === n.key ? 'var(--blue)' : 'var(--muted)',
            background: active === n.key ? 'var(--blue-dim)' : 'none',
            borderLeft: active === n.key ? '2px solid var(--blue)' : '2px solid transparent',
            fontSize:13, fontWeight: active === n.key ? 600 : 400,
            transition:'all 0.12s',
          }}>
            <span style={{ fontSize:14 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* User profile area */}
      <div style={{ padding:'10px 10px 14px', borderTop:'1px solid var(--border)', position:'relative' }}>
        {/* Profile menu popup */}
        {menuOpen && (
          <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:10, right:10, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--rl)', overflow:'hidden', boxShadow:'var(--sh-lg)', zIndex:200 }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{name}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>{user?.email || ''}</div>
              <div style={{ fontSize:10, color:'var(--blue)', marginTop:4, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>{role}</div>
            </div>
            <button onClick={() => { setActive('members'); setMenuOpen(false); }} style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', fontSize:13, color:'var(--text)', background:'none', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background='none'}>
              ⚙ Team & Access
            </button>
            <button onClick={() => { logout(); setMenuOpen(false); }} style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', fontSize:13, color:'var(--red)', background:'none', cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,77,106,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background='none'}>
              ⬡ Sign Out
            </button>
          </div>
        )}

        {/* User row — click to open menu */}
        <button onClick={() => setMenuOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px', borderRadius:'var(--r)', background: menuOpen ? 'var(--blue-dim)' : 'none', border:'none', cursor:'pointer', transition:'background 0.12s' }}
          onMouseEnter={e => { if (!menuOpen) e.currentTarget.style.background='var(--surface2)'; }}
          onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background='none'; }}>
          <div style={{ width:32, height:32, background:'var(--blue)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ minWidth:0, flex:1, textAlign:'left' }}>
            <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text)' }}>{name}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{role}</div>
          </div>
          <div style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{menuOpen ? '▲' : '▼'}</div>
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

      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18, marginBottom:18 }}>
        {/* Pipeline by strategy */}
        <div style={S.card}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:16, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Pipeline by Strategy</div>
          {byStrategy.length ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byStrategy} margin={{ top:0, right:0, bottom:0, left:0 }}>
                <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'var(--muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:12 }} />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {byStrategy.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>}
        </div>

        {/* Strategy allocation pie */}
        <div style={S.card}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:16, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>AUM Allocation</div>
          {portSummary ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={Object.entries(portSummary.by_strategy).map(([k,v]) => ({ name: STRATEGY_LABELS[k] || k, value: v.current, color: STRATEGY_COLORS[k] || '#3b6bff' }))} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value">
                    {Object.keys(portSummary.by_strategy).map((k, i) => <Cell key={i} fill={STRATEGY_COLORS[k] || '#3b6bff'} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt$(v)} contentStyle={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:8 }}>
                {Object.entries(portSummary.by_strategy).map(([k,v]) => (
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:STRATEGY_COLORS[k], flexShrink:0 }} />
                    <span style={{ color:'var(--muted)' }}>{STRATEGY_LABELS[k]}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>}
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

  const toggleItem = async (item) => {
    const newStatus = item.status === 'complete' ? 'pending' : 'complete';
    await ddApi.updateItem(item.id, { status: newStatus });
    setChecklist(c => ({ ...c, items: c.items.map(i => i.id === item.id ? {...i, status:newStatus} : i) }));
  };

  const CATEGORY_COLORS = { financial:'var(--blue)', legal:'var(--amber)', commercial:'var(--green)', operational:'var(--gold)', esg:'#2dd4a0', technical:'#a78bfa', other:'var(--muted)' };

  const completion = checklist ? Math.round((checklist.items?.filter(i => i.status === 'complete').length / (checklist.items?.length || 1)) * 100) : 0;

  return (
    <div className="fade-up">
      <PageHeader title="Due Diligence" sub="Checklists and findings per deal" />
      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:18, height:'calc(100vh - 160px)' }}>
        {/* Deal list */}
        <div style={{ ...S.card, overflowY:'auto' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Deals in DD</div>
          {loading ? <Spinner /> : deals.length === 0 ? <p style={{ color:'var(--muted)', fontSize:13 }}>No deals in due diligence.</p> : deals.map(d => (
            <div key={d.id} onClick={() => loadChecklist(d)} style={{ padding:'10px 12px', borderRadius:'var(--r)', cursor:'pointer', marginBottom:4, background: selected?.id === d.id ? 'var(--blue-dim)' : 'none', borderLeft: selected?.id === d.id ? '2px solid var(--blue)' : '2px solid transparent', transition:'all 0.12s' }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{d.name}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{STRATEGY_LABELS[d.strategy]}</div>
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
  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deals, setDeals] = useState([]);
  const [form, setForm] = useState({ deal:'', title:'', memo_type:'initial', recommended_amount:'', executive_summary:'', investment_thesis:'', risk_factors:'', recommendation:'' });
  const user = useStore(s => s.user);

  const load = () => {
    setLoading(true);
    committeeApi.list().then(r => { setMemos(r.data.results || r.data); setLoading(false); });
  };
  useEffect(() => {
    load();
    dealsApi.list().then(r => setDeals(r.data.results || r.data));
  }, []);

  const loadMemo = async (m) => {
    const r = await committeeApi.get(m.id);
    setSelected(r.data);
  };

  const create = async () => {
    try { await committeeApi.create(form); setShowAdd(false); toast('Memo created.'); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const vote = async (v) => {
    try {
      const r = await committeeApi.vote(selected.id, { vote: v });
      setSelected(r.data);
      toast(`Vote cast: ${v}`);
    } catch { toast('Vote failed.', 'error'); }
  };

  const STATUS_COLORS = { draft:'var(--muted)', submitted:'var(--blue)', voting:'var(--amber)', approved:'var(--green)', rejected:'var(--red)', deferred:'var(--gold)' };

  return (
    <div className="fade-up">
      <PageHeader title="IC Workflow" sub="Investment committee approvals with full audit trail"
        action={<button style={S.btnP} onClick={() => setShowAdd(true)}>+ New Memo</button>} />

      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:18, height:'calc(100vh - 160px)' }}>
        {/* Memo list */}
        <div style={{ ...S.card, overflowY:'auto' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>All Memos</div>
          {loading ? <Spinner /> : memos.map(m => (
            <div key={m.id} onClick={() => loadMemo(m)} style={{ padding:'12px', borderRadius:'var(--r)', cursor:'pointer', marginBottom:6, background: selected?.id === m.id ? 'var(--blue-dim)' : 'var(--surface2)', border: `1px solid ${selected?.id === m.id ? 'var(--blue)' : 'var(--border)'}`, transition:'all 0.12s' }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>{m.title}</div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={S.tag(STATUS_COLORS[m.status] || 'var(--muted)')}>{m.status}</span>
                {m.recommended_amount && <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'var(--ffm)' }}>{fmt$(m.recommended_amount)}</span>}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>By {m.prepared_by_name}</div>
            </div>
          ))}
        </div>

        {/* Memo detail */}
        {!selected ? (
          <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>Select a memo to review.</div>
        ) : (
          <div style={{ ...S.card, overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <span style={S.tag(STATUS_COLORS[selected.status] || 'var(--muted)')}>{selected.status}</span>
                  <span style={S.tag('var(--gold)','var(--gold-dim)')}>{selected.memo_type}</span>
                </div>
                <h3 style={{ fontSize:20, fontWeight:700 }}>{selected.title}</h3>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Prepared by {selected.prepared_by_name} · {fmt$(selected.recommended_amount)}</div>
              </div>
              {/* Vote buttons */}
              {selected.status === 'voting' && (
                <div style={{ display:'flex', gap:8 }}>
                  <button style={{ ...S.btnP, background:'var(--green)' }} onClick={() => vote('approve')}>✓ Approve</button>
                  <button style={{ ...S.btnD }} onClick={() => vote('reject')}>✗ Reject</button>
                  <button style={{ ...S.btnG }} onClick={() => vote('abstain')}>Abstain</button>
                </div>
              )}
            </div>

            {/* Vote summary */}
            {selected.vote_summary && (
              <div style={{ display:'flex', gap:12, marginBottom:20, padding:'12px 16px', background:'var(--surface2)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--ffm)', fontSize:22, color:'var(--green)', fontWeight:600 }}>{selected.vote_summary.approve}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Approve</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--ffm)', fontSize:22, color:'var(--red)', fontWeight:600 }}>{selected.vote_summary.reject}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Reject</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--ffm)', fontSize:22, color:'var(--muted)', fontWeight:600 }}>{selected.vote_summary.pending}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Pending</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:'var(--ffm)', fontSize:22, color:'var(--text)', fontWeight:600 }}>{selected.vote_summary.total}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Total</div>
                </div>
              </div>
            )}

            {/* Memo sections */}
            {[['Executive Summary', selected.executive_summary], ['Investment Thesis', selected.investment_thesis], ['Risk Factors', selected.risk_factors], ['Recommendation', selected.recommendation]].map(([title, content]) => content ? (
              <div key={title} style={{ marginBottom:18 }}>
                <div style={S.lbl}>{title}</div>
                <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8, background:'var(--surface2)', padding:'12px 14px', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>{content}</p>
              </div>
            ) : null)}

            {/* Votes */}
            {selected.votes?.length > 0 && (
              <div style={{ marginTop:20 }}>
                <div style={S.lbl}>Votes Cast</div>
                {selected.votes.map(v => (
                  <div key={v.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontWeight:600, fontSize:13 }}>{v.member_name}</span>
                      {v.rationale && <p style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>{v.rationale}</p>}
                    </div>
                    <span style={S.tag(v.vote === 'approve' ? 'var(--green)' : v.vote === 'reject' ? 'var(--red)' : 'var(--muted)')}>{v.vote}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New memo modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New IC Memo" width={660}>
        <Sel label="Deal" value={form.deal} onChange={e => setForm(f => ({...f, deal:e.target.value}))} options={[{value:'',label:'Select deal…'}, ...deals.map(d => ({value:d.id,label:d.name}))]} />
        <Inp label="Memo Title" value={form.title} onChange={e => setForm(f => ({...f, title:e.target.value}))} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Sel label="Type" value={form.memo_type} onChange={e => setForm(f => ({...f, memo_type:e.target.value}))} options={[{value:'initial',label:'Initial Investment'},{value:'follow_on',label:'Follow-on'},{value:'exit',label:'Exit Approval'},{value:'amendment',label:'Amendment'}]} />
          <Inp label="Recommended Amount (USD)" type="number" value={form.recommended_amount} onChange={e => setForm(f => ({...f, recommended_amount:e.target.value}))} />
        </div>
        <TA label="Executive Summary" value={form.executive_summary} onChange={e => setForm(f => ({...f, executive_summary:e.target.value}))} />
        <TA label="Investment Thesis" value={form.investment_thesis} onChange={e => setForm(f => ({...f, investment_thesis:e.target.value}))} />
        <TA label="Risk Factors" value={form.risk_factors} onChange={e => setForm(f => ({...f, risk_factors:e.target.value}))} />
        <TA label="Recommendation" value={form.recommendation} onChange={e => setForm(f => ({...f, recommendation:e.target.value}))} />
        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <button style={S.btnP} onClick={create}>Create Memo</button>
          <button style={S.btnG} onClick={() => setShowAdd(false)}>Cancel</button>
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
export default function App() {
  const { isAuth, loadMe, logout, toasts, addToast, user } = useStore();
  const [tab, setTab]           = useState('dashboard');
  const [authPage, setAuthPage] = useState('signin'); // signin | signup
  const [profile, setProfile]   = useState(null);     // full profile from /me
  const [loading, setLoading]   = useState(true);

  const toast = (msg, type = 'success') => addToast(msg, type);

  useEffect(() => {
    const el = document.createElement('style');
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

  const PAGES = {
    dashboard: <Dashboard />,
    deals:     <DealPipeline toast={toast} />,
    diligence: <DueDiligence toast={toast} />,
    committee: <ICWorkflow toast={toast} />,
    portfolio: <PortfolioMonitor toast={toast} />,
    documents: <DocumentRepository toast={toast} />,
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
        />
      <main style={{ marginLeft:220, flex:1, padding:'32px 36px', overflowY:'auto', minHeight:'100vh' }}>
        {PAGES[tab] || <Dashboard />}
      </main>
      <Toast toasts={toasts} />
    </div>
  );
}