import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const api = axios.create({ baseURL: '' });
api.interceptors.request.use(c => {
  const t = localStorage.getItem('ao_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07090f;--surf:#0d1117;--surf2:#111827;--border:#1a2234;--border2:#1e2d45;
  --blue:#3b82f6;--blue-d:rgba(59,130,246,.1);--green:#10b981;--red:#ef4444;
  --amber:#f59e0b;--purple:#8b5cf6;--teal:#14b8a6;--text:#e2e8f0;--muted:#64748b;
  --ff:'Inter',sans-serif;--ffm:'JetBrains Mono',monospace;
  --r:6px;--rl:10px;--sh:0 2px 16px rgba(0,0,0,.5);
}
html,body,#root{height:100%;font-family:var(--ff);background:var(--bg);color:var(--text);font-size:14px;-webkit-font-smoothing:antialiased}
button{cursor:pointer;border:none;background:none;font-family:inherit;color:inherit}
input,select,textarea{font-family:inherit;color:var(--text);background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px;outline:none;width:100%;font-size:13px}
input:focus,select:focus{border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-d)}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.fade-up{animation:fadeUp .2s ease both}
.pulse{animation:pulse 1.4s ease infinite}
`;

const S = {
  card:  { background:'var(--surf)', border:'1px solid var(--border)', borderRadius:'var(--rl)', padding:18 },
  btnP:  { background:'var(--blue)', color:'#fff', padding:'7px 16px', borderRadius:'var(--r)', fontWeight:600, fontSize:12, whiteSpace:'nowrap' },
  btnG:  { background:'var(--surf2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'6px 14px', borderRadius:'var(--r)', fontSize:12 },
  btnD:  { background:'rgba(239,68,68,.1)', color:'var(--red)', border:'1px solid rgba(239,68,68,.3)', padding:'6px 14px', borderRadius:'var(--r)', fontSize:12 },
  lbl:   { display:'block', fontSize:10, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:5, fontWeight:700 },
  tag:   (c='var(--blue)') => ({ display:'inline-flex', alignItems:'center', background:`${c}18`, color:c, border:`1px solid ${c}44`, borderRadius:4, padding:'2px 7px', fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', whiteSpace:'nowrap' }),
  mono:  { fontFamily:'var(--ffm)', fontSize:12 },
};

const MODULE_COLOR = { documents:'var(--blue)', kyc:'var(--purple)', compliance:'var(--red)', transactions:'var(--green)', email:'var(--teal)', pipeline:'var(--amber)' };
const MODULE_ICON  = { documents:'📄', kyc:'🔍', compliance:'🛡', transactions:'💳', email:'✉️', pipeline:'⚙️' };
const SEV_COLOR    = { critical:'var(--red)', high:'var(--amber)', medium:'var(--blue)', low:'var(--green)' };

function Spinner({ size=22 }) {
  return <div style={{ width:size, height:size, border:'2px solid var(--border)', borderTop:`2px solid var(--blue)`, borderRadius:'50%', animation:'spin .7s linear infinite', flexShrink:0 }} />;
}

function Toast({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:18, right:18, zIndex:9999, display:'flex', flexDirection:'column', gap:6 }}>
      {toasts.map(t => (
        <div key={t.id} className="fade-up" style={{ background:'var(--surf)', border:`1px solid ${t.type==='error'?'var(--red)':t.type==='warning'?'var(--amber)':'var(--green)'}44`, borderLeft:`3px solid ${t.type==='error'?'var(--red)':t.type==='warning'?'var(--amber)':'var(--green)'}`, padding:'9px 14px', borderRadius:'var(--r)', fontSize:13, maxWidth:280 }}>{t.msg}</div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...S.card, borderTop:`2px solid ${accent || 'var(--border)'}` }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:'var(--ffm)', fontSize:24, fontWeight:600, color: accent || 'var(--text)', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:5 }}>{sub}</div>}
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username:'', password:'' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/auth/login/', form);
      localStorage.setItem('ao_token', data.access);
      onLogin();
    } catch { setError('Invalid credentials.'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...S.card, width:360, padding:32 }} className="fade-up">
        <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--blue)', letterSpacing:'.15em', textTransform:'uppercase', marginBottom:6 }}>AutoOps</div>
        <h1 style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>Operational Automation</h1>
        <p style={{ color:'var(--muted)', fontSize:12, marginBottom:24 }}>Initiative 13 of 15 · Prime Alpha Securities</p>
        {error && <div style={{ color:'var(--red)', fontSize:12, padding:'7px 12px', background:'rgba(239,68,68,.08)', borderRadius:'var(--r)', marginBottom:12 }}>{error}</div>}
        <div style={{ marginBottom:10 }}><label style={S.lbl}>Username</label><input value={form.username} onChange={e => setForm(f => ({...f,username:e.target.value}))} onKeyDown={e => e.key==='Enter'&&submit()} /></div>
        <div style={{ marginBottom:18 }}><label style={S.lbl}>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({...f,password:e.target.value}))} onKeyDown={e => e.key==='Enter'&&submit()} /></div>
        <button style={{ ...S.btnP, width:'100%', padding:10 }} onClick={submit} disabled={busy}>{busy?'Signing in…':'Sign In →'}</button>
      </div>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard() {
  const [data, setData] = useState(null);
  const [runs, setRuns] = useState([]);
  useEffect(() => {
    api.get('/api/core/runs/dashboard/').then(r => setData(r.data)).catch(() => {});
    api.get('/api/core/runs/?page_size=8').then(r => setRuns(r.data.results || r.data)).catch(() => {});
  }, []);

  const STATUS_COLOR = { success:'var(--green)', failed:'var(--red)', running:'var(--blue)', pending:'var(--muted)', skipped:'var(--muted)' };

  return (
    <div className="fade-up">
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, letterSpacing:'-.3px', marginBottom:4 }}>Automation Dashboard</h1>
        <p style={{ color:'var(--muted)', fontSize:13 }}>Last 7 days across all modules</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="Total Runs"    value={data?.total_runs ?? '—'} accent="var(--blue)" />
        <StatCard label="Success Rate"  value={data ? `${data.success_rate}%` : '—'} accent="var(--green)" />
        <StatCard label="Failed"        value={data?.failed ?? '—'} accent={data?.failed > 0 ? 'var(--red)' : 'var(--green)'} />
        <StatCard label="Modules Active" value="6" sub="All operational" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div style={S.card}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>Runs by Module (7d)</div>
          {data?.by_module?.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.by_module} margin={{ top:0,right:0,bottom:0,left:0 }}>
                <XAxis dataKey="module" tick={{ fontSize:10, fill:'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'var(--muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'var(--surf2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:11 }} />
                <Bar dataKey="success" fill="var(--green)" radius={[3,3,0,0]} name="Success" stackId="a" />
                <Bar dataKey="failed"  fill="var(--red)"   radius={[3,3,0,0]} name="Failed"  stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>}
        </div>

        <div style={S.card}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:14 }}>Recent Activity</div>
          {runs.map(r => (
            <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:500 }}>{r.task_name}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{MODULE_ICON[r.module]} {r.module} · {r.summary?.slice(0,50) || '—'}</div>
              </div>
              <span style={S.tag(STATUS_COLOR[r.status] || 'var(--muted)')}>{r.status}</span>
            </div>
          ))}
          {!runs.length && <div style={{ color:'var(--muted)', fontSize:13, padding:20, textAlign:'center' }}>No runs yet — automation will start on next schedule.</div>}
        </div>
      </div>
    </div>
  );
}

// ── GENERIC MODULE PAGE ───────────────────────────────────────────────────────
function ModulePage({ title, icon, endpoint, columns, actions = [], extra }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get(endpoint + (search ? `?search=${search}` : '')).then(r => {
      setItems(r.data.results || r.data);
    }).finally(() => setLoading(false));
  }, [endpoint, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fade-up">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, letterSpacing:'-.3px', marginBottom:4 }}>{icon} {title}</h1>
          <p style={{ color:'var(--muted)', fontSize:12 }}>{items.length} records</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {actions.map(a => (
            <button key={a.label} style={S.btnP} onClick={a.onClick}>{a.label}</button>
          ))}
        </div>
      </div>

      {extra && <div style={{ marginBottom:16 }}>{extra}</div>}

      <div style={{ marginBottom:14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} style={{ maxWidth:280 }} />
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
        ) : items.length === 0 ? (
          <div style={{ textAlign:'center', color:'var(--muted)', padding:40, fontSize:13 }}>No records yet.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                {columns.map(c => <th key={c.key} style={{ textAlign:'left', padding:'7px 12px', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id || i} style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surf2)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding:'10px 12px', fontSize:13 }}>
                      {c.render ? c.render(item[c.key], item) : (item[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── MODULE PAGES ──────────────────────────────────────────────────────────────
function DocumentsPage({ toast }) {
  return <ModulePage title="Document Processor" icon="📄" endpoint="/api/documents/" columns={[
    { key:'filename',      label:'Filename' },
    { key:'source',        label:'Source', render: v => <span style={S.tag('var(--blue)')}>{v}</span> },
    { key:'detected_type', label:'Detected Type' },
    { key:'status',        label:'Status', render: v => {
      const c = { received:'var(--muted)', classifying:'var(--blue)', routing:'var(--amber)', routed:'var(--green)', failed:'var(--red)' }[v] || 'var(--muted)';
      return <span style={S.tag(c)}>{v}</span>;
    }},
    { key:'confidence',    label:'Confidence', render: v => v ? `${(v*100).toFixed(0)}%` : '—' },
    { key:'routed_to',     label:'Routed To' },
    { key:'received_at',   label:'Received',   render: v => v ? new Date(v).toLocaleDateString() : '—' },
  ]} />;
}

function KYCPage({ toast }) {
  return <ModulePage title="KYC / AML Engine" icon="🔍" endpoint="/api/kyc/" columns={[
    { key:'entity_name',    label:'Entity' },
    { key:'entity_type',    label:'Type',    render: v => <span style={S.tag('var(--purple)')}>{v}</span> },
    { key:'country',        label:'Country' },
    { key:'status',         label:'Status',  render: v => {
      const c = { approved:'var(--green)', flagged:'var(--red)', pending:'var(--amber)', rejected:'var(--red)', expired:'var(--muted)', screening:'var(--blue)' }[v] || 'var(--muted)';
      return <span style={S.tag(c)}>{v}</span>;
    }},
    { key:'risk_level',     label:'Risk', render: v => v ? <span style={S.tag(SEV_COLOR[v] || 'var(--muted)')}>{v}</span> : '—' },
    { key:'sanctions_clear',label:'Sanctions', render: v => v === true ? '✓' : v === false ? '✗' : '—' },
    { key:'pep_clear',      label:'PEP Clear', render: v => v === true ? '✓' : v === false ? '✗' : '—' },
    { key:'screened_at',    label:'Screened',  render: v => v ? new Date(v).toLocaleDateString() : 'Pending' },
  ]} />;
}

function CompliancePage({ toast }) {
  const [tab, setTab] = useState('alerts');
  return (
    <div>
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {['alerts','watchlist'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:'7px 16px', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'var(--blue)':'var(--muted)', background:'none', border:'none', cursor:'pointer', borderBottom:tab===t?'2px solid var(--blue)':'2px solid transparent', marginBottom:-1, textTransform:'capitalize' }}>{t}</button>
        ))}
      </div>
      {tab === 'alerts' ? (
        <ModulePage title="Compliance Alerts" icon="🛡" endpoint="/api/compliance/alerts/" columns={[
          { key:'title',      label:'Alert' },
          { key:'severity',   label:'Severity', render: v => <span style={S.tag(SEV_COLOR[v] || 'var(--muted)')}>{v}</span> },
          { key:'alert_type', label:'Type' },
          { key:'entity_name',label:'Entity' },
          { key:'status',     label:'Status', render: v => {
            const c = { open:'var(--red)', acknowledged:'var(--amber)', resolved:'var(--green)', false_positive:'var(--muted)' }[v];
            return <span style={S.tag(c)}>{v?.replace('_',' ')}</span>;
          }},
          { key:'created_at', label:'Created', render: v => new Date(v).toLocaleDateString() },
        ]} />
      ) : (
        <ModulePage title="Watchlist" icon="📋" endpoint="/api/compliance/watchlist/" columns={[
          { key:'entity_name', label:'Entity' },
          { key:'reason',      label:'Reason',  render: v => <span style={S.tag('var(--amber)')}>{v?.replace('_',' ')}</span> },
          { key:'country',     label:'Country' },
          { key:'status',      label:'Status',  render: v => <span style={S.tag(v==='active'?'var(--red)':'var(--green)')}>{v}</span> },
          { key:'last_checked',label:'Last Checked', render: v => v ? new Date(v).toLocaleDateString() : 'Never' },
        ]} />
      )}
    </div>
  );
}

function TransactionsPage({ toast }) {
  const [tab, setTab] = useState('transactions');
  return (
    <div>
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {['transactions','feeds'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:'7px 16px', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'var(--blue)':'var(--muted)', background:'none', border:'none', cursor:'pointer', borderBottom:tab===t?'2px solid var(--blue)':'2px solid transparent', marginBottom:-1, textTransform:'capitalize' }}>{t}</button>
        ))}
      </div>
      {tab === 'transactions' ? (
        <ModulePage title="Transactions" icon="💳" endpoint="/api/transactions/transactions/" columns={[
          { key:'date',             label:'Date' },
          { key:'description',      label:'Description' },
          { key:'amount',           label:'Amount', render: (v, item) => <span style={{ fontFamily:'var(--ffm)', color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>{v > 0 ? '+' : ''}{Number(v).toLocaleString()} {item.currency}</span> },
          { key:'transaction_type', label:'Type',   render: v => <span style={S.tag('var(--blue)')}>{v?.replace('_',' ')}</span> },
          { key:'status',           label:'Status', render: v => <span style={S.tag(v==='reconciled'?'var(--green)':v==='posted'?'var(--teal)':v==='pending'?'var(--amber)':'var(--muted)')}>{v}</span> },
          { key:'auto_posted',      label:'Auto',   render: v => v ? '✓' : '—' },
        ]} />
      ) : (
        <ModulePage title="Bank Feeds" icon="🏦" endpoint="/api/transactions/feeds/" columns={[
          { key:'name',        label:'Feed Name' },
          { key:'institution', label:'Institution' },
          { key:'feed_type',   label:'Type',    render: v => <span style={S.tag('var(--teal)')}>{v}</span> },
          { key:'status',      label:'Status',  render: v => <span style={S.tag(v==='active'?'var(--green)':'var(--red)')}>{v}</span> },
          { key:'currency',    label:'Currency' },
          { key:'last_synced', label:'Last Sync', render: v => v ? new Date(v).toLocaleString() : 'Never' },
          { key:'sync_count',  label:'Syncs' },
        ]} />
      )}
    </div>
  );
}

function EmailPage({ toast }) {
  const [tab, setTab] = useState('rules');
  return (
    <div>
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {['rules','tasks','logs'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:'7px 16px', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'var(--blue)':'var(--muted)', background:'none', border:'none', cursor:'pointer', borderBottom:tab===t?'2px solid var(--blue)':'2px solid transparent', marginBottom:-1, textTransform:'capitalize' }}>{t}</button>
        ))}
      </div>
      {tab === 'rules' && <ModulePage title="Email Rules" icon="✉️" endpoint="/api/email/rules/" columns={[
        { key:'name',       label:'Rule Name' },
        { key:'trigger',    label:'Trigger',  render: v => <span style={S.tag('var(--blue)')}>{v?.replace('_',' ')}</span> },
        { key:'condition',  label:'Condition' },
        { key:'action',     label:'Action',   render: v => <span style={S.tag('var(--teal)')}>{v?.replace('_',' ')}</span> },
        { key:'is_active',  label:'Active',   render: v => v ? '✓' : '—' },
        { key:'match_count',label:'Matches' },
      ]} />}
      {tab === 'tasks' && <ModulePage title="Follow-up Tasks" icon="📋" endpoint="/api/email/tasks/" columns={[
        { key:'subject',    label:'Task' },
        { key:'assigned_to',label:'Assigned' },
        { key:'due_date',   label:'Due Date' },
        { key:'status',     label:'Status', render: v => <span style={S.tag(v==='done'?'var(--green)':v==='overdue'?'var(--red)':'var(--amber)')}>{v}</span> },
      ]} />}
      {tab === 'logs' && <ModulePage title="Email Logs" icon="📝" endpoint="/api/email/logs/" columns={[
        { key:'sender',      label:'Sender' },
        { key:'subject',     label:'Subject' },
        { key:'status',      label:'Status', render: v => <span style={S.tag(v==='processed'?'var(--green)':'var(--red)')}>{v}</span> },
        { key:'action_taken',label:'Action' },
        { key:'received_at', label:'Received', render: v => new Date(v).toLocaleString() },
      ]} />}
    </div>
  );
}

function PipelinesPage({ toast }) {
  return <ModulePage title="Data Pipelines" icon="⚙️" endpoint="/api/pipelines/" columns={[
    { key:'name',        label:'Pipeline' },
    { key:'source_type', label:'Source',   render: v => <span style={S.tag('var(--amber)')}>{v}</span> },
    { key:'schedule',    label:'Schedule', render: v => <span style={S.tag('var(--muted)')}>{v}</span> },
    { key:'status',      label:'Status',   render: v => <span style={S.tag(v==='active'?'var(--green)':v==='paused'?'var(--amber)':'var(--red)')}>{v}</span> },
    { key:'last_status', label:'Last Run',  render: v => v ? <span style={S.tag(v==='success'?'var(--green)':'var(--red)')}>{v}</span> : '—' },
    { key:'run_count',   label:'Runs' },
    { key:'last_run',    label:'Last Run At', render: v => v ? new Date(v).toLocaleString() : 'Never' },
  ]} actions={[{ label:'▶ Run All Due', onClick: () => api.post('/api/pipelines/run_all_due/').then(() => toast('All due pipelines queued.')).catch(() => toast('Failed.','error')) }]} />;
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
const NAV = [
  { key:'dashboard',     label:'Dashboard',         icon:'⬡' },
  { key:'documents',     label:'Document Processor', icon:'📄' },
  { key:'kyc',           label:'KYC / AML',          icon:'🔍' },
  { key:'compliance',    label:'Compliance',          icon:'🛡' },
  { key:'transactions',  label:'Transactions',        icon:'💳' },
  { key:'email',         label:'Email Workflows',     icon:'✉️' },
  { key:'pipelines',     label:'Data Pipelines',      icon:'⚙️' },
];

function Sidebar({ active, setActive, onLogout }) {
  return (
    <div style={{ width:210, background:'var(--surf)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'fixed', top:0, bottom:0, left:0, zIndex:100 }}>
      <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--blue)', letterSpacing:'.15em', textTransform:'uppercase' }}>AutoOps</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Operational Automation</div>
      </div>
      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        {NAV.map(n => (
          <button key={n.key} onClick={() => setActive(n.key)} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', textAlign:'left', padding:'8px 11px', borderRadius:'var(--r)', marginBottom:2, color:active===n.key?'var(--blue)':'var(--muted)', background:active===n.key?'var(--blue-d)':'none', borderLeft:active===n.key?'2px solid var(--blue)':'2px solid transparent', fontSize:13, fontWeight:active===n.key?600:400, transition:'all .12s' }}>
            <span style={{ fontSize:13 }}>{n.icon}</span> {n.label}
          </button>
        ))}
      </nav>
      <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)' }}>
        <button style={{ ...S.btnG, width:'100%', fontSize:12 }} onClick={onLogout}>Sign Out</button>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('ao_token'));
  const [tab, setTab]       = useState('dashboard');
  const [toasts, setToasts] = useState([]);

  const toast = (msg, type='success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  const logout = () => { localStorage.removeItem('ao_token'); setAuthed(false); };

  const PAGES = {
    dashboard:    <Dashboard />,
    documents:    <DocumentsPage toast={toast} />,
    kyc:          <KYCPage toast={toast} />,
    compliance:   <CompliancePage toast={toast} />,
    transactions: <TransactionsPage toast={toast} />,
    email:        <EmailPage toast={toast} />,
    pipelines:    <PipelinesPage toast={toast} />,
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar active={tab} setActive={setTab} onLogout={logout} />
      <main style={{ marginLeft:210, flex:1, padding:'28px 32px', overflowY:'auto', minHeight:'100vh' }}>
        {PAGES[tab]}
      </main>
      <Toast toasts={toasts} />
    </div>
  );
}
