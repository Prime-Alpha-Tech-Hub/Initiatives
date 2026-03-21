import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell } from 'recharts';

// ── API ───────────────────────────────────────────────────────────────────────
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(c => {
  const t = localStorage.getItem('dd_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

// ── Theme ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080c14;--surf:#0e1420;--surf2:#141b28;--border:#1c2438;--border2:#232d42;
  --blue:#4a7cff;--blue-d:rgba(74,124,255,.12);--green:#22d3a0;--red:#f43f5e;
  --amber:#f59e0b;--gold:#fbbf24;--purple:#a78bfa;--text:#dde4f5;--muted:#5a6787;
  --dim:#2a3450;--ff:'Inter',sans-serif;--ffm:'JetBrains Mono',monospace;
  --r:6px;--rl:10px;--sh:0 2px 16px rgba(0,0,0,.5);
}
html,body,#root{height:100%;font-family:var(--ff);background:var(--bg);color:var(--text);font-size:14px;-webkit-font-smoothing:antialiased}
button{cursor:pointer;border:none;background:none;font-family:inherit;color:inherit}
input,select,textarea{font-family:inherit;color:var(--text);background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:9px 12px;outline:none;width:100%;font-size:13px}
input:focus,select:focus,textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-d)}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.fade-up{animation:fadeUp .25s ease both}
.pulse{animation:pulse 1.5s ease infinite}
`;

// ── Shared UI ─────────────────────────────────────────────────────────────────
const S = {
  card:  { background:'var(--surf)', border:'1px solid var(--border)', borderRadius:'var(--rl)', padding:20, boxShadow:'var(--sh)' },
  btnP:  { background:'var(--blue)', color:'#fff', padding:'8px 18px', borderRadius:'var(--r)', fontWeight:600, fontSize:13, whiteSpace:'nowrap' },
  btnG:  { background:'var(--surf2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'7px 16px', borderRadius:'var(--r)', fontSize:13 },
  btnD:  { background:'rgba(244,63,94,.1)', color:'var(--red)', border:'1px solid rgba(244,63,94,.3)', padding:'7px 14px', borderRadius:'var(--r)', fontSize:12 },
  lbl:   { display:'block', fontSize:10, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:5, fontWeight:700 },
  tag:   (c='var(--blue)', bg='var(--blue-d)') => ({ display:'inline-flex', alignItems:'center', background:bg, color:c, border:`1px solid ${c}44`, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', whiteSpace:'nowrap' }),
  mono:  { fontFamily:'var(--ffm)', fontSize:12 },
};

const SEV_COLOR = { critical:'var(--red)', high:'var(--amber)', medium:'var(--gold)', low:'var(--green)', info:'var(--blue)' };
const SEV_BG    = { critical:'rgba(244,63,94,.1)', high:'rgba(245,158,11,.1)', medium:'rgba(251,191,36,.1)', low:'rgba(34,211,160,.1)', info:'var(--blue-d)' };
const TYPE_LABELS = { pitch_deck:'Pitch Deck', financial_model:'Financial Model', income_statement:'Income Statement', balance_sheet:'Balance Sheet', cash_flow:'Cash Flow', audit_report:'Audit Report', legal_contract:'Legal Contract', term_sheet:'Term Sheet', shareholder_agmt:'Shareholder Agmt', cim:'CIM', management_cv:'Mgmt CV', market_report:'Market Report', other:'Other' };

function Spinner({ size=24 }) {
  return <div style={{ width:size, height:size, border:'2.5px solid var(--border)', borderTop:`2.5px solid var(--blue)`, borderRadius:'50%', animation:'spin .7s linear infinite', flexShrink:0 }} />;
}

function Badge({ label, color='var(--blue)' }) {
  return <span style={S.tag(color, `${color}18`)}>{label}</span>;
}

function Toast({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} className="fade-up" style={{ background:'var(--surf)', border:`1px solid ${t.type==='error'?'var(--red)':t.type==='warning'?'var(--amber)':'var(--green)'}44`, borderLeft:`3px solid ${t.type==='error'?'var(--red)':t.type==='warning'?'var(--amber)':'var(--green)'}`, padding:'10px 16px', borderRadius:'var(--r)', fontSize:13, maxWidth:300, boxShadow:'var(--sh)' }}>{t.msg}</div>
      ))}
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
      const { data } = await api.post('/auth/login/', { username: form.username, password: form.password });
      localStorage.setItem('dd_token', data.access);
      onLogin();
    } catch {
      setError('Invalid credentials.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ ...S.card, width:380, padding:36 }} className="fade-up">
        <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--blue)', letterSpacing:'.15em', textTransform:'uppercase', marginBottom:8 }}>DD Engine</div>
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Automated Due Diligence</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>Initiative 06 of 15 · Prime Alpha Securities</p>
        {error && <div style={{ color:'var(--red)', fontSize:12, padding:'8px 12px', background:'rgba(244,63,94,.08)', borderRadius:'var(--r)', marginBottom:14 }}>{error}</div>}
        <div style={{ marginBottom:12 }}>
          <label style={S.lbl}>Username</label>
          <input value={form.username} onChange={e => setForm(f => ({...f, username:e.target.value}))} placeholder="admin" onKeyDown={e => e.key==='Enter' && submit()} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.lbl}>Password</label>
          <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password:e.target.value}))} placeholder="••••••••" onKeyDown={e => e.key==='Enter' && submit()} />
        </div>
        <button style={{ ...S.btnP, width:'100%', padding:11 }} onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign In →'}</button>
      </div>
    </div>
  );
}

// ── UPLOAD ZONE ───────────────────────────────────────────────────────────────
function UploadZone({ onUploaded, toast }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title:'', doc_type:'other', deal_name:'', company_name:'' });
  const [file, setFile] = useState(null);
  const fileRef = useRef();

  const upload = async () => {
    if (!file) { toast('Select a file first.', 'error'); return; }
    if (!form.title) { toast('Enter a document title.', 'error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k,v]) => fd.append(k, v));
      const { data } = await api.post('/documents/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast(`Uploaded: ${data.title}`);
      setFile(null);
      setForm({ title:'', doc_type:'other', deal_name:'', company_name:'' });
      onUploaded(data);
    } catch (e) {
      toast(e.response?.data?.detail || 'Upload failed.', 'error');
    } finally { setBusy(false); }
  };

  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!form.title) setForm(p => ({...p, title: f.name.replace(/\.[^.]+$/, '')})); }
  };

  return (
    <div style={{ ...S.card, marginBottom:24 }}>
      <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Upload Document for Analysis</div>

      {/* Drop zone */}
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }}
           onDragLeave={() => setDragging(false)} onDrop={onDrop}
           onClick={() => fileRef.current?.click()}
           style={{ border:`2px dashed ${dragging ? 'var(--blue)' : 'var(--border2)'}`, borderRadius:'var(--rl)', padding:'28px 20px', textAlign:'center', cursor:'pointer', background: dragging ? 'var(--blue-d)' : 'var(--surf2)', marginBottom:16, transition:'all .15s' }}>
        <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{file ? file.name : 'Drop document here or click to browse'}</div>
        <div style={{ fontSize:11, color:'var(--muted)' }}>PDF, DOCX, XLSX, TXT · Max 50MB</div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" style={{ display:'none' }}
          onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); if (!form.title) setForm(p => ({...p, title: f.name.replace(/\.[^.]+$/, '')})); } }} />
      </div>

      {/* Form */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        <div>
          <label style={S.lbl}>Document Title *</label>
          <input value={form.title} onChange={e => setForm(p => ({...p, title:e.target.value}))} placeholder="e.g. Acme Corp — Audited Financials 2023" />
        </div>
        <div>
          <label style={S.lbl}>Document Type</label>
          <select value={form.doc_type} onChange={e => setForm(p => ({...p, doc_type:e.target.value}))}>
            {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Company Name</label>
          <input value={form.company_name} onChange={e => setForm(p => ({...p, company_name:e.target.value}))} placeholder="e.g. Acme Corp" />
        </div>
        <div>
          <label style={S.lbl}>Deal Name</label>
          <input value={form.deal_name} onChange={e => setForm(p => ({...p, deal_name:e.target.value}))} placeholder="e.g. Project Atlas" />
        </div>
      </div>

      <button style={{ ...S.btnP }} onClick={upload} disabled={busy || !file}>
        {busy ? <span style={{ display:'flex', alignItems:'center', gap:8 }}><Spinner size={14} /> Uploading…</span> : '↑ Upload & Extract'}
      </button>
    </div>
  );
}

// ── DOCUMENT ROW ──────────────────────────────────────────────────────────────
function DocumentRow({ doc, onAnalyse, onSelect, selected, toast }) {
  const STATUS_COLOR = { uploaded:'var(--muted)', queued:'var(--amber)', processing:'var(--blue)', complete:'var(--green)', failed:'var(--red)' };
  const [running, setRunning] = useState(false);

  const run = async (type) => {
    setRunning(true);
    try {
      await api.post('/analysis/run/', { document_id: doc.id, analysis_type: type });
      toast(`Analysis started: ${type}`);
      onAnalyse(doc.id);
    } catch (e) {
      toast(e.response?.data?.error || 'Failed to start analysis.', 'error');
    } finally { setRunning(false); }
  };

  return (
    <div onClick={() => onSelect(doc)} style={{ ...S.card, padding:'14px 16px', cursor:'pointer', borderLeft:`3px solid ${STATUS_COLOR[doc.status] || 'var(--border)'}`, background: selected ? 'var(--surf2)' : 'var(--surf)', transition:'all .15s', marginBottom:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:13, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <Badge label={TYPE_LABELS[doc.doc_type] || doc.doc_type} />
            <span style={{ ...S.tag(STATUS_COLOR[doc.status]), background:`${STATUS_COLOR[doc.status]}18` }}>{doc.status}</span>
            {doc.company_name && <span style={{ fontSize:11, color:'var(--muted)' }}>{doc.company_name}</span>}
            {doc.page_count && <span style={{ fontSize:11, color:'var(--muted)' }}>{doc.page_count}p</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
          {doc.status === 'queued' && (
            <>
              <button style={{ ...S.btnP, fontSize:11, padding:'5px 10px' }} onClick={() => run('full')} disabled={running}>
                {running ? <Spinner size={12} /> : '▶ Full Analysis'}
              </button>
              <select style={{ fontSize:11, padding:'4px 8px', width:'auto' }} onChange={e => { if (e.target.value) run(e.target.value); e.target.value=''; }} defaultValue="">
                <option value="">Run specific…</option>
                <option value="classification">Classification only</option>
                <option value="financial">Financial only</option>
                <option value="legal">Legal only</option>
                <option value="risk">Risk only</option>
                <option value="summary">Summary only</option>
              </select>
            </>
          )}
          {doc.status === 'complete' && <span style={{ fontSize:11, color:'var(--green)' }}>✓ Done</span>}
          {doc.status === 'failed' && (
            <button style={{ ...S.btnD, fontSize:11 }} onClick={() => run('full')}>↻ Retry</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ANALYSIS RESULTS ──────────────────────────────────────────────────────────
function AnalysisResults({ docId, toast }) {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    if (!docId) return;
    try {
      const { data } = await api.get(`/analysis/by_document/?document_id=${docId}`);
      setAnalyses(data);
      // Poll if any are still running
      const running = data.filter(a => ['pending','running'].includes(a.status));
      if (running.length > 0) {
        pollRef.current = setTimeout(load, 3000);
      }
    } finally { setLoading(false); }
  }, [docId]);

  useEffect(() => {
    setLoading(true);
    setAnalyses([]);
    load();
    return () => clearTimeout(pollRef.current);
  }, [docId, load]);

  if (!docId) return <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', minHeight:200 }}>Select a document to view analysis results.</div>;
  if (loading) return <div style={{ ...S.card, display:'flex', alignItems:'center', justifyContent:'center', minHeight:200 }}><Spinner /></div>;
  if (!analyses.length) return <div style={{ ...S.card, color:'var(--muted)', padding:32, textAlign:'center' }}>No analyses yet. Upload a document and click Run Analysis.</div>;

  return (
    <div className="fade-up">
      {/* Analysis tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' }}>
        {analyses.map(a => {
          const c = a.status === 'complete' ? 'var(--green)' : a.status === 'failed' ? 'var(--red)' : a.status === 'running' ? 'var(--blue)' : 'var(--muted)';
          return (
            <button key={a.id} onClick={() => setActive(a.id === active ? null : a.id)}
              style={{ padding:'6px 14px', borderRadius:'var(--r)', border:`1.5px solid ${a.id === active ? 'var(--blue)' : 'var(--border)'}`, background: a.id === active ? 'var(--blue-d)' : 'var(--surf2)', fontSize:12, fontWeight: a.id === active ? 600 : 400, color: a.id === active ? 'var(--blue)' : 'var(--text)', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              {a.status === 'running' && <span className="pulse">●</span>}
              {a.analysis_type}
              <span style={{ fontSize:10, color:c }}>({a.status})</span>
            </button>
          );
        })}
      </div>

      {/* Result panel */}
      {active && (() => {
        const a = analyses.find(x => x.id === active);
        if (!a) return null;
        if (['pending','running'].includes(a.status)) return (
          <div style={{ ...S.card, display:'flex', alignItems:'center', gap:12, padding:24 }}>
            <Spinner /> <span style={{ color:'var(--muted)' }}>Analysis running… results will appear automatically.</span>
          </div>
        );
        if (a.status === 'failed') return (
          <div style={{ ...S.card, borderLeft:'3px solid var(--red)', padding:20 }}>
            <div style={{ fontWeight:600, color:'var(--red)', marginBottom:8 }}>Analysis Failed</div>
            <pre style={{ fontSize:11, color:'var(--muted)', whiteSpace:'pre-wrap', fontFamily:'var(--ffm)' }}>{a.error_message}</pre>
          </div>
        );
        return <ResultDetail analysis={a} />;
      })()}
    </div>
  );
}

// ── RESULT DETAIL ─────────────────────────────────────────────────────────────
function ResultDetail({ analysis }) {
  const r = analysis.result || {};
  const type = analysis.analysis_type;

  // Full analysis — show all sub-results
  if (type === 'full') {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {r.classification && <ClassificationCard data={r.classification} />}
        {r.financial      && <FinancialCard data={r.financial} />}
        {r.risk           && <RiskCard data={r.risk} flags={analysis.risk_flags} />}
        {r.legal          && <LegalCard data={r.legal} />}
        {r.summary        && <SummaryCard data={r.summary} />}
        <MetaCard analysis={analysis} />
      </div>
    );
  }

  return (
    <div>
      {type === 'classification' && r && <ClassificationCard data={r} />}
      {type === 'financial'      && r && <FinancialCard data={r} />}
      {type === 'risk'           && r && <RiskCard data={r} flags={analysis.risk_flags} />}
      {type === 'legal'          && r && <LegalCard data={r} />}
      {type === 'summary'        && r && <SummaryCard data={r} />}
      <MetaCard analysis={analysis} />
    </div>
  );
}

function SectionCard({ title, accent='var(--blue)', children }) {
  return (
    <div style={{ ...S.card, borderTop:`2px solid ${accent}` }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:14 }}>{title}</div>
      {children}
    </div>
  );
}

function ClassificationCard({ data }) {
  return (
    <SectionCard title="Document Classification" accent="var(--blue)">
      <div style={{ display:'flex', gap:20, flexWrap:'wrap', marginBottom:12 }}>
        <div><div style={S.lbl}>Type Detected</div><Badge label={data.document_type || '—'} /></div>
        <div><div style={S.lbl}>Confidence</div><span style={{ fontFamily:'var(--ffm)', color:'var(--blue)' }}>{data.confidence ? `${(data.confidence*100).toFixed(0)}%` : '—'}</span></div>
        <div><div style={S.lbl}>Company</div><span style={{ fontWeight:600 }}>{data.company_name || '—'}</span></div>
        <div><div style={S.lbl}>Period</div><span>{data.period || '—'}</span></div>
        <div><div style={S.lbl}>Data Quality</div><Badge label={data.data_quality || '—'} color={data.data_quality==='high'?'var(--green)':data.data_quality==='medium'?'var(--amber)':'var(--red)'} /></div>
      </div>
      {data.summary && <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, marginBottom:10 }}>{data.summary}</p>}
      {data.key_topics?.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {data.key_topics.map((t,i) => <span key={i} style={S.tag('var(--purple)','rgba(167,139,250,.1)')}>{t}</span>)}
        </div>
      )}
    </SectionCard>
  );
}

function FinancialCard({ data }) {
  const is_ = data.income_statement || {};
  const bs   = data.balance_sheet   || {};
  const rat  = data.ratios          || {};
  const hist = data.historical_data || [];

  const fmt = v => v == null ? '—' : new Intl.NumberFormat('en-US', { notation:'compact', maximumFractionDigits:1 }).format(v);
  const pct = v => v == null ? '—' : `${Number(v).toFixed(1)}%`;

  return (
    <SectionCard title="Financial Analysis" accent="var(--green)">
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {data.period   && <Badge label={data.period} color="var(--muted)" />}
        {data.currency && <Badge label={data.currency} color="var(--muted)" />}
      </div>

      {/* Key metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:12, marginBottom:16 }}>
        {[['Revenue', is_.revenue], ['Gross Profit', is_.gross_profit], ['EBITDA', is_.ebitda], ['Net Income', is_.net_income], ['Total Assets', bs.total_assets], ['Total Debt', bs.total_debt], ['Cash', bs.cash], ['Equity', bs.total_equity]].map(([label, val]) => (
          <div key={label} style={{ background:'var(--surf2)', borderRadius:'var(--r)', padding:'10px 12px', border:'1px solid var(--border)' }}>
            <div style={S.lbl}>{label}</div>
            <div style={{ fontFamily:'var(--ffm)', fontSize:16, fontWeight:600, color:'var(--text)' }}>{fmt(val)}</div>
          </div>
        ))}
      </div>

      {/* Ratios */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:16 }}>
        {[['EBITDA Margin', pct(rat.ebitda_margin_pct)], ['Gross Margin', pct(rat.gross_margin_pct)], ['Net Margin', pct(rat.net_margin_pct)], ['Debt/Equity', rat.debt_to_equity ? Number(rat.debt_to_equity).toFixed(2)+'x' : '—'], ['Current Ratio', rat.current_ratio ? Number(rat.current_ratio).toFixed(2)+'x' : '—'], ['Rev Growth', pct(rat.revenue_growth_pct)]].map(([label, val]) => (
          <div key={label} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>{label}</div>
            <div style={{ fontFamily:'var(--ffm)', fontWeight:600 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Historical chart */}
      {hist.filter(h => h.revenue).length > 1 && (
        <div>
          <div style={S.lbl}>Revenue / EBITDA History</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={hist} margin={{ top:0, right:0, bottom:0, left:0 }}>
              <XAxis dataKey="year" tick={{ fontSize:10, fill:'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:10, fill:'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v)} />
              <Tooltip contentStyle={{ background:'var(--surf2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontSize:11 }} formatter={v => fmt(v)} />
              <Bar dataKey="revenue" fill="var(--blue)" radius={[3,3,0,0]} name="Revenue" />
              <Bar dataKey="ebitda"  fill="var(--green)" radius={[3,3,0,0]} name="EBITDA" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.red_flags?.length > 0 && (
        <div style={{ marginTop:12 }}>
          <div style={S.lbl}>Financial Red Flags</div>
          {data.red_flags.map((f,i) => (
            <div key={i} style={{ fontSize:12, color:'var(--red)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}>
              <span>⚠</span> {f}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function RiskCard({ data, flags }) {
  const score = data.overall_risk_score || 0;
  const scoreColor = score >= 8 ? 'var(--red)' : score >= 6 ? 'var(--amber)' : score >= 4 ? 'var(--gold)' : 'var(--green)';

  const allFlags = flags?.length > 0 ? flags : (data.risk_flags || []);

  return (
    <SectionCard title="Risk Assessment" accent="var(--red)">
      {/* Score + recommendation */}
      <div style={{ display:'flex', gap:24, marginBottom:20, alignItems:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'var(--ffm)', fontSize:48, fontWeight:700, color:scoreColor, lineHeight:1 }}>{score}</div>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginTop:4 }}>Risk Score / 10</div>
        </div>
        <div>
          <div style={S.lbl}>Overall Risk</div>
          <Badge label={data.overall_risk_level || '—'} color={scoreColor} />
          <div style={{ marginTop:10 }}>
            <div style={S.lbl}>Recommendation</div>
            <Badge label={(data.investment_recommendation || '—').replace(/_/g,' ')}
              color={data.investment_recommendation === 'proceed' ? 'var(--green)' : data.investment_recommendation?.includes('not') ? 'var(--red)' : 'var(--amber)'} />
          </div>
        </div>
        {data.summary && <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.75, flex:1 }}>{data.summary}</p>}
      </div>

      {/* Risk flags */}
      {allFlags.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={S.lbl}>Risk Flags ({allFlags.length})</div>
          {allFlags.map((f, i) => (
            <div key={i} style={{ padding:'10px 14px', borderRadius:'var(--r)', marginBottom:6, background:SEV_BG[f.severity], border:`1px solid ${SEV_COLOR[f.severity]}44`, borderLeft:`3px solid ${SEV_COLOR[f.severity]}` }}>
              <div style={{ display:'flex', gap:8, marginBottom:4, alignItems:'center' }}>
                <span style={S.tag(SEV_COLOR[f.severity], SEV_BG[f.severity])}>{f.severity}</span>
                <span style={S.tag('var(--muted)','var(--surf2)')}>{f.category}</span>
                <strong style={{ fontSize:13 }}>{f.title}</strong>
              </div>
              <p style={{ fontSize:12, color:'var(--muted)', lineHeight:1.65 }}>{f.detail}</p>
              {f.mitigation && <p style={{ fontSize:11, color:'var(--green)', marginTop:4 }}>Mitigation: {f.mitigation}</p>}
            </div>
          ))}
        </div>
      )}

      {data.strengths?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={S.lbl}>Strengths</div>
          {data.strengths.map((s,i) => <div key={i} style={{ fontSize:12, color:'var(--green)', padding:'3px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>✓</span>{s}</div>)}
        </div>
      )}

      {data.diligence_gaps?.length > 0 && (
        <div>
          <div style={S.lbl}>Diligence Gaps</div>
          {data.diligence_gaps.map((g,i) => <div key={i} style={{ fontSize:12, color:'var(--amber)', padding:'3px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>△</span>{g}</div>)}
        </div>
      )}
    </SectionCard>
  );
}

function LegalCard({ data }) {
  const kt = data.key_terms || {};
  return (
    <SectionCard title="Legal Analysis" accent="var(--purple)">
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        {data.document_type && <Badge label={data.document_type} color="var(--purple)" />}
        {data.governing_law && <Badge label={data.governing_law} color="var(--muted)" />}
        {data.effective_date && <span style={{ fontSize:12, color:'var(--muted)' }}>Effective: {data.effective_date}</span>}
      </div>
      {data.parties?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={S.lbl}>Parties</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {data.parties.map((p,i) => <Badge key={i} label={p} color="var(--blue)" />)}
          </div>
        </div>
      )}
      {Object.entries(kt).filter(([,v]) => v).map(([key, val]) => (
        <div key={key} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:3 }}>{key.replace(/_/g,' ')}</div>
          <div style={{ fontSize:12, lineHeight:1.65 }}>{Array.isArray(val) ? val.join(', ') : val}</div>
        </div>
      ))}
      {data.risk_provisions?.length > 0 && (
        <div style={{ marginTop:12 }}>
          <div style={S.lbl}>Risk Provisions</div>
          {data.risk_provisions.map((p,i) => <div key={i} style={{ fontSize:12, color:'var(--amber)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>⚠</span>{p}</div>)}
        </div>
      )}
    </SectionCard>
  );
}

function SummaryCard({ data }) {
  return (
    <SectionCard title="Executive Summary" accent="var(--gold)">
      {data.headline && <div style={{ fontSize:16, fontWeight:700, marginBottom:12, lineHeight:1.4 }}>{data.headline}</div>}
      {data.executive_summary && <p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8, marginBottom:16 }}>{data.executive_summary}</p>}
      {data.key_highlights?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={S.lbl}>Key Highlights</div>
          {data.key_highlights.map((h,i) => <div key={i} style={{ fontSize:12, color:'var(--text)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span style={{ color:'var(--blue)' }}>●</span>{h}</div>)}
        </div>
      )}
      {data.key_concerns?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={S.lbl}>Key Concerns</div>
          {data.key_concerns.map((c,i) => <div key={i} style={{ fontSize:12, color:'var(--amber)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>▲</span>{c}</div>)}
        </div>
      )}
      {data.next_steps?.length > 0 && (
        <div>
          <div style={S.lbl}>Recommended Next Steps</div>
          {data.next_steps.map((s,i) => <div key={i} style={{ fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8, color:'var(--text)' }}><span style={{ color:'var(--green)' }}>{i+1}.</span>{s}</div>)}
        </div>
      )}
    </SectionCard>
  );
}

function MetaCard({ analysis }) {
  return (
    <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:20, flexWrap:'wrap', fontSize:11, color:'var(--muted)' }}>
      <span>Model: <strong style={{ color:'var(--text)', fontFamily:'var(--ffm)' }}>{analysis.model_used}</strong></span>
      <span>Tokens: <strong style={{ color:'var(--text)', fontFamily:'var(--ffm)' }}>{(analysis.tokens_used||0).toLocaleString()}</strong></span>
      <span>Duration: <strong style={{ color:'var(--text)', fontFamily:'var(--ffm)' }}>{analysis.duration_ms ? `${(analysis.duration_ms/1000).toFixed(1)}s` : '—'}</strong></span>
      <span>Completed: <strong style={{ color:'var(--text)' }}>{analysis.completed_at ? new Date(analysis.completed_at).toLocaleString() : '—'}</strong></span>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed]     = useState(!!localStorage.getItem('dd_token'));
  const [docs, setDocs]         = useState([]);
  const [selectedDoc, setSel]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [toasts, setToasts]     = useState([]);

  const toast = (msg, type='success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  const loadDocs = useCallback(async () => {
    try {
      const { data } = await api.get('/documents/');
      setDocs(data.results || data);
    } catch { toast('Failed to load documents.', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
    if (authed) loadDocs();
    else setLoading(false);
    return () => el.remove();
  }, [authed]);

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'var(--bg)' }}>
      {/* Header */}
      <header style={{ background:'var(--surf)', borderBottom:'1px solid var(--border)', padding:'14px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100 }}>
        <div>
          <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--blue)', letterSpacing:'.15em', textTransform:'uppercase' }}>DD Engine</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>Automated Due Diligence · Initiative 06</div>
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:11, color:'var(--muted)' }}>{docs.length} documents</span>
          <button style={{ ...S.btnG, fontSize:11 }} onClick={() => { localStorage.removeItem('dd_token'); setAuthed(false); }}>Sign Out</button>
        </div>
      </header>

      <div style={{ flex:1, display:'grid', gridTemplateColumns:'380px 1fr', height:'calc(100vh - 56px)' }}>
        {/* Left panel — document list */}
        <div style={{ borderRight:'1px solid var(--border)', overflowY:'auto', padding:20 }}>
          <UploadZone onUploaded={doc => { setDocs(d => [doc, ...d]); setSel(doc); }} toast={toast} />

          <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>
            Documents ({docs.length})
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
          ) : docs.length === 0 ? (
            <div style={{ textAlign:'center', color:'var(--muted)', padding:40, fontSize:13 }}>No documents yet. Upload one above.</div>
          ) : docs.map(doc => (
            <DocumentRow key={doc.id} doc={doc} selected={selectedDoc?.id === doc.id}
              onSelect={setSel} onAnalyse={loadDocs} toast={toast} />
          ))}
        </div>

        {/* Right panel — analysis results */}
        <div style={{ overflowY:'auto', padding:24 }}>
          <AnalysisResults docId={selectedDoc?.id} toast={toast} />
        </div>
      </div>

      <Toast toasts={toasts} />
    </div>
  );
}
