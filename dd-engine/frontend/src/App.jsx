import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// ── API ───────────────────────────────────────────────────────────────────────
const api = axios.create({ baseURL: '/dd/api' });
api.interceptors.request.use(c => {
  const t = localStorage.getItem('dd_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07090f;--surf:#0d1117;--surf2:#111827;--border:#1e2540;--border2:#263050;
  --blue:#4a7cff;--blue-d:rgba(74,124,255,.1);--green:#22d3a0;--red:#f43f5e;
  --amber:#f59e0b;--gold:#c9a84c;--purple:#a78bfa;--text:#dde4f5;--muted:#64748b;
  --dim:#1e2d45;--ff:'Inter',sans-serif;--ffm:'JetBrains Mono',monospace;
  --r:6px;--rl:10px;--sh:0 2px 20px rgba(0,0,0,.5);
}
html,body,#root{height:100%;font-family:var(--ff);background:var(--bg);color:var(--text);font-size:14px;-webkit-font-smoothing:antialiased}
button{cursor:pointer;border:none;background:none;font-family:inherit;color:inherit}
input,select,textarea{font-family:inherit;color:var(--text);background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:9px 12px;outline:none;width:100%;font-size:13px}
input:focus,select:focus,textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,168,76,.08)}
select option{background:var(--surf2)}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.fu{animation:fadeUp .2s ease both}.pulse{animation:pulse 1.5s ease infinite}
`;

const S = {
  card:  { background:'var(--surf)', border:'1px solid var(--border)', borderRadius:'var(--rl)', padding:20 },
  btnP:  { background:'var(--gold)', color:'#000', padding:'8px 18px', borderRadius:'var(--r)', fontWeight:700, fontSize:13, whiteSpace:'nowrap' },
  btnG:  { background:'var(--surf2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'7px 16px', borderRadius:'var(--r)', fontSize:13 },
  btnD:  { background:'rgba(244,63,94,.08)', color:'var(--red)', border:'1px solid rgba(244,63,94,.25)', padding:'6px 12px', borderRadius:'var(--r)', fontSize:12 },
  lbl:   { display:'block', fontSize:10, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:5, fontWeight:700 },
  tag:   (c='var(--blue)', bg='var(--blue-d)') => ({ display:'inline-flex', alignItems:'center', background:bg, color:c, border:`1px solid ${c}44`, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', whiteSpace:'nowrap' }),
};
const SEV_C = { critical:'var(--red)', high:'var(--amber)', medium:'var(--gold)', low:'var(--green)', info:'var(--blue)' };
const SEV_B = { critical:'rgba(244,63,94,.08)', high:'rgba(245,158,11,.08)', medium:'rgba(201,168,76,.08)', low:'rgba(34,211,160,.06)', info:'var(--blue-d)' };
const DOC_TYPES = { pitch_deck:'Pitch Deck', financial_model:'Financial Model', income_statement:'Income Statement', balance_sheet:'Balance Sheet', cash_flow:'Cash Flow', audit_report:'Audit Report', legal_contract:'Legal Contract', term_sheet:'Term Sheet', shareholder_agmt:'Shareholder Agmt', cim:'CIM', management_cv:'Mgmt CV', market_report:'Market Report', other:'Other' };
const LANGS = { auto:'Auto-detect', en:'English', fr:'French', ar:'Arabic', sw:'Swahili', es:'Spanish' };

function Spinner({ size=22 }) {
  return <div style={{ width:size, height:size, border:'2px solid var(--border)', borderTop:'2px solid var(--gold)', borderRadius:'50%', animation:'spin .7s linear infinite', flexShrink:0 }} />;
}
function Badge({ label, color='var(--blue)' }) {
  return <span style={S.tag(color, `${color}18`)}>{label}</span>;
}
function Toast({ toasts }) {
  return (
    <div style={{ position:'fixed', bottom:20, right:20, zIndex:9999, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => (
        <div key={t.id} className="fu" style={{ background:'var(--surf)', border:`1px solid ${t.type==='error'?'var(--red)':t.type==='warning'?'var(--amber)':'var(--green)'}44`, borderLeft:`3px solid ${t.type==='error'?'var(--red)':t.type==='warning'?'var(--amber)':'var(--green)'}`, padding:'10px 16px', borderRadius:'var(--r)', fontSize:13, maxWidth:320, boxShadow:'var(--sh)' }}>{t.msg}</div>
      ))}
    </div>
  );
}

function SectionCard({ title, accent='var(--blue)', children }) {
  return (
    <div style={{ ...S.card, borderTop:`2px solid ${accent}`, marginBottom:16 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--muted)', marginBottom:14 }}>{title}</div>
      {children}
    </div>
  );
}
function EmptyTab({ label }) {
  return <div style={{ color:'var(--muted)', fontSize:13, padding:'32px 0', textAlign:'center' }}>{label}</div>;
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
      localStorage.setItem('dd_token', data.access);
      onLogin();
    } catch { setError('Invalid credentials.'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...S.card, width:380, padding:36 }} className="fu">
        <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--gold)', letterSpacing:'.15em', marginBottom:8 }}>DD ENGINE</div>
        <h1 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>Due Diligence Platform</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>Initiative 06 · Prime Alpha Securities</p>
        {error && <div style={{ color:'var(--red)', fontSize:12, padding:'8px 12px', background:'rgba(244,63,94,.08)', borderRadius:'var(--r)', marginBottom:14 }}>{error}</div>}
        <label style={S.lbl}>Username</label>
        <input style={{ marginBottom:12 }} value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="admin" onKeyDown={e=>e.key==='Enter'&&submit()} />
        <label style={S.lbl}>Password</label>
        <input type="password" style={{ marginBottom:20 }} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&submit()} />
        <button style={{ ...S.btnP, width:'100%', padding:11 }} onClick={submit} disabled={busy}>{busy?'Signing in…':'Sign in →'}</button>
      </div>
    </div>
  );
}

function Header({ page, setPage, onSignOut }) {
  return (
    <header style={{ background:'var(--surf)', borderBottom:'1px solid var(--border)', padding:'0 28px', display:'flex', justifyContent:'space-between', alignItems:'center', height:54, position:'sticky', top:0, zIndex:100 }}>
      <div style={{ display:'flex', alignItems:'center', gap:32 }}>
        <div>
          <div style={{ fontFamily:'var(--ffm)', fontSize:11, fontWeight:700, color:'var(--gold)', letterSpacing:'.14em' }}>DD ENGINE</div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>Prime Alpha Securities · Initiative 06</div>
        </div>
        <nav style={{ display:'flex', gap:4 }}>
          {[['intake','Intake'],['review','Review'],['archive','Archive']].map(([id,label]) => (
            <button key={id} onClick={()=>setPage(id)} style={{ padding:'6px 16px', borderRadius:'var(--r)', fontSize:13, fontWeight:page===id?600:400, color:page===id?'var(--gold)':'var(--muted)', background:page===id?'rgba(201,168,76,.1)':'transparent', border:page===id?'1px solid rgba(201,168,76,.3)':'1px solid transparent', transition:'all .15s' }}>{label}</button>
          ))}
        </nav>
      </div>
      <button style={{ ...S.btnG, fontSize:11 }} onClick={onSignOut}>Sign out</button>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE 1 — INTAKE
// ════════════════════════════════════════════════════════════════════════════
function IntakePage({ toast, onDocUploaded }) {
  const [file, setFile]       = useState(null);
  const [dragging, setDrag]   = useState(false);
  const [busy, setBusy]       = useState(false);
  const [pending, setPending] = useState([]);
  const [loadingP, setLP]     = useState(true);
  const fileRef               = useRef();
  const [form, setForm]       = useState({ title:'', doc_type:'other', company_name:'', deal_name:'', language:'auto' });

  const loadPending = useCallback(async () => {
    try {
      const { data } = await api.get('/documents/?status=uploaded&status=queued&status=failed');
      setPending(data.results || data);
    } catch {} finally { setLP(false); }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const onDrop = e => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!form.title) setForm(p=>({...p, title:f.name.replace(/\.[^.]+$/,'')})); }
  };

  const upload = async () => {
    if (!file) { toast('Select a file first.','error'); return; }
    if (!form.title.trim()) { toast('Enter a document title.','error'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      Object.entries(form).forEach(([k,v]) => fd.append(k,v));
      const { data } = await api.post('/documents/', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      toast(`Uploaded: ${data.title}`);
      setFile(null);
      setForm({ title:'', doc_type:'other', company_name:'', deal_name:'', language:'auto' });
      onDocUploaded(data);
      loadPending();
    } catch(e) { toast(e.response?.data?.detail||'Upload failed.','error'); }
    finally { setBusy(false); }
  };

  const runAnalysis = async (docId) => {
    try {
      await api.post('/analysis/run/', { document_id:docId, analysis_type:'full' });
      toast('Full analysis started.');
      loadPending();
    } catch(e) { toast(e.response?.data?.error||'Failed.','error'); }
  };

  return (
    <div style={{ maxWidth:760, margin:'0 auto', padding:'32px 20px' }}>
      <div style={{ ...S.card, marginBottom:28 }}>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Submit a document</div>
        <p style={{ fontSize:12, color:'var(--muted)', marginBottom:20, lineHeight:1.7 }}>Upload a document for AI-powered due diligence analysis. Supported formats: PDF, DOCX, XLSX, TXT. Supported languages: English, French, Arabic, Swahili, Spanish — detected automatically or select below.</p>
        <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}
             onClick={()=>fileRef.current?.click()}
             style={{ border:`2px dashed ${dragging?'var(--gold)':'var(--border2)'}`, borderRadius:'var(--rl)', padding:'32px 20px', textAlign:'center', cursor:'pointer', background:dragging?'rgba(201,168,76,.06)':'var(--surf2)', marginBottom:20, transition:'all .15s' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{file ? file.name : 'Drop document here or click to browse'}</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>PDF · DOCX · XLSX · TXT · max 50MB</div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.txt" style={{ display:'none' }}
            onChange={e=>{ const f=e.target.files[0]; if(f){setFile(f); if(!form.title) setForm(p=>({...p,title:f.name.replace(/\.[^.]+$/,'')}))} }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
          <div><label style={S.lbl}>Document title *</label><input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Acme Corp — Audited Financials 2023" /></div>
          <div><label style={S.lbl}>Document type</label><select value={form.doc_type} onChange={e=>setForm(p=>({...p,doc_type:e.target.value}))}>{Object.entries(DOC_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div><label style={S.lbl}>Company name</label><input value={form.company_name} onChange={e=>setForm(p=>({...p,company_name:e.target.value}))} placeholder="e.g. Acme Manufacturing SA" /></div>
          <div><label style={S.lbl}>Deal name</label><input value={form.deal_name} onChange={e=>setForm(p=>({...p,deal_name:e.target.value}))} placeholder="e.g. Project Atlas" /></div>
        </div>
        <div style={{ marginBottom:18 }}>
          <label style={S.lbl}>Document language</label>
          <select value={form.language} onChange={e=>setForm(p=>({...p,language:e.target.value}))} style={{ width:240 }}>
            {Object.entries(LANGS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button style={{ ...S.btnP, opacity:busy||!file?.5:1 }} onClick={upload} disabled={busy||!file}>
          {busy ? <span style={{ display:'flex', alignItems:'center', gap:8 }}><Spinner size={14} />Uploading…</span> : '↑ Upload & queue for analysis'}
        </button>
      </div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>Pending — awaiting analysis ({pending.length})</div>
      {loadingP ? <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner /></div>
       : pending.length===0 ? <div style={{ color:'var(--muted)', fontSize:13, textAlign:'center', padding:'24px 0' }}>No documents pending. All uploaded documents have been analysed.</div>
       : pending.map(doc => (
          <div key={doc.id} style={{ ...S.card, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <Badge label={DOC_TYPES[doc.doc_type]||doc.doc_type} />
                {doc.company_name && <span style={{ fontSize:11, color:'var(--muted)' }}>{doc.company_name}</span>}
                <span style={{ ...S.tag(doc.status==='failed'?'var(--red)':'var(--amber)'), background:doc.status==='failed'?'rgba(244,63,94,.08)':'rgba(245,158,11,.08)' }}>{doc.status}</span>
              </div>
            </div>
            <button style={{ ...S.btnP, fontSize:12, padding:'6px 14px', flexShrink:0 }} onClick={()=>runAnalysis(doc.id)}>▶ Run analysis</button>
          </div>
       ))}
      <div style={{ marginTop:28, padding:'14px 18px', background:'var(--surf2)', borderRadius:'var(--rl)', border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
        <strong style={{ color:'var(--text)' }}>S3 auto-analysis:</strong> Documents uploaded directly to the S3 bucket trigger a Lambda function that extracts text and queues them for analysis automatically. They appear in the pending list and in the Review page once complete.
      </div>
      <footer style={{ marginTop:48, textAlign:'center', fontSize:11, color:'var(--muted)', borderTop:'1px solid var(--border)', paddingTop:20 }}>
        <span style={{ color:'var(--gold)', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Prime Alpha Securities</span>
        &nbsp;·&nbsp;Alternative Investment Fund Manager&nbsp;·&nbsp;African Markets&nbsp;·&nbsp;Confidential
      </footer>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE 2 — REVIEW
// ════════════════════════════════════════════════════════════════════════════
function ReviewPage({ toast, refreshTrigger }) {
  const [docs, setDocs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [selDoc, setSelDoc]   = useState(null);
  const [filter, setFilter]   = useState('');
  const [sortBy, setSortBy]   = useState('date');

  const load = useCallback(async () => {
    try { const { data } = await api.get('/documents/?status=complete'); setDocs(data.results||data); }
    catch { toast('Failed to load documents.','error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const softDelete = async (doc, e) => {
    e.stopPropagation();
    if (!window.confirm(`Remove "${doc.title}" from Review?\n\nIt will still be accessible in the Archive.`)) return;
    try {
      await api.post('/documents/archive/', { document_id:doc.id });
      toast('Moved to archive.');
      if (selDoc?.id===doc.id) setSelDoc(null);
      load();
    } catch(e) { toast(e.response?.data?.error||'Failed.','error'); }
  };

  const filtered = docs
    .filter(d => !filter || [d.title,d.company_name,d.deal_name].some(s=>(s||'').toLowerCase().includes(filter.toLowerCase())))
    .sort((a,b) => sortBy==='date'?new Date(b.created_at)-new Date(a.created_at):sortBy==='company'?(a.company_name||'').localeCompare(b.company_name||''):(a.title||'').localeCompare(b.title||''));

  return (
    <div style={{ display:'flex', height:'calc(100vh - 54px)' }}>
      <div style={{ width:340, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search documents…" style={{ fontSize:12 }} />
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>Sort:</span>
            {[['date','Date'],['company','Company'],['title','Title']].map(([k,l])=>(
              <button key={k} onClick={()=>setSortBy(k)} style={{ fontSize:11, padding:'3px 10px', borderRadius:'var(--r)', border:`1px solid ${sortBy===k?'var(--gold)':'var(--border)'}`, background:sortBy===k?'rgba(201,168,76,.1)':'transparent', color:sortBy===k?'var(--gold)':'var(--muted)' }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
          {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
           : filtered.length===0 ? <div style={{ color:'var(--muted)', fontSize:12, textAlign:'center', padding:'40px 16px' }}>No analysed documents yet.<br/>Upload from the Intake page.</div>
           : filtered.map(doc => (
              <div key={doc.id} onClick={()=>setSelDoc(doc)}
                style={{ padding:'12px 14px', marginBottom:6, borderRadius:'var(--rl)', border:`1px solid ${selDoc?.id===doc.id?'var(--gold)':'var(--border)'}`, background:selDoc?.id===doc.id?'rgba(201,168,76,.07)':'var(--surf)', cursor:'pointer', transition:'all .15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:12, marginBottom:5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                      <Badge label={DOC_TYPES[doc.doc_type]||doc.doc_type} color="var(--blue)" />
                      {doc.company_name && <span style={{ fontSize:10, color:'var(--muted)' }}>{doc.company_name}</span>}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:5 }}>{doc.deal_name&&`${doc.deal_name} · `}{new Date(doc.created_at).toLocaleDateString()}</div>
                  </div>
                  <button onClick={e=>softDelete(doc,e)} title="Move to archive" style={{ padding:'3px 8px', borderRadius:4, border:'1px solid var(--border)', color:'var(--muted)', fontSize:11, flexShrink:0, background:'var(--surf2)' }}>Archive</button>
                </div>
              </div>
           ))}
        </div>
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', fontSize:10, color:'var(--muted)', textAlign:'center' }}>Prime Alpha Securities · DD Engine</div>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {selDoc ? <ReviewDetail doc={selDoc} toast={toast} />
                 : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:12 }}><div style={{ fontSize:32, color:'var(--border2)' }}>⬅</div><div style={{ color:'var(--muted)', fontSize:13 }}>Select a document to review its analysis</div></div>}
      </div>
    </div>
  );
}

function ReviewDetail({ doc, toast }) {
  const [analyses, setAnalyses]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/analysis/by_document/?document_id=${doc.id}`);
      setAnalyses(data);
      if (data.some(a=>['pending','running'].includes(a.status))) pollRef.current = setTimeout(load, 3000);
    } finally { setLoading(false); }
  }, [doc.id]);

  useEffect(() => { setLoading(true); setAnalyses([]); setActiveTab('summary'); load(); return ()=>clearTimeout(pollRef.current); }, [doc.id,load]);

  const full   = analyses.find(a=>a.analysis_type==='full'&&a.status==='complete');
  const byType = t => full?.result?.[t] || analyses.find(a=>a.analysis_type===t&&a.status==='complete')?.result || null;

  const TABS = [
    { id:'summary',label:'Summary' },{ id:'financial',label:'Financial' },{ id:'risk',label:'Risk' },
    { id:'legal',label:'Legal' },{ id:'classification',label:'Classification' },{ id:'original',label:'Original doc' },
  ];

  return (
    <div style={{ padding:24 }} className="fu">
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{doc.company_name&&`${doc.company_name} · `}{doc.deal_name&&`${doc.deal_name} · `}{new Date(doc.created_at).toLocaleDateString()}</div>
        <h2 style={{ fontSize:19, fontWeight:700, marginBottom:8 }}>{doc.title}</h2>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <Badge label={DOC_TYPES[doc.doc_type]||doc.doc_type} color="var(--blue)" />
          <Badge label={doc.status} color={doc.status==='complete'?'var(--green)':'var(--amber)'} />
          {doc.page_count&&<Badge label={`${doc.page_count} pages`} color="var(--muted)" />}
          {doc.file_size_display&&<Badge label={doc.file_size_display} color="var(--muted)" />}
        </div>
      </div>
      {loading ? <div style={{ display:'flex', gap:12, alignItems:'center', padding:'32px 0' }}><Spinner /><span style={{ color:'var(--muted)' }}>Loading analysis…</span></div> : (
        <>
          <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
            {TABS.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{ padding:'8px 16px', fontSize:12, fontWeight:activeTab===tab.id?600:400, color:activeTab===tab.id?'var(--gold)':'var(--muted)', borderBottom:`2px solid ${activeTab===tab.id?'var(--gold)':'transparent'}`, background:'transparent', transition:'all .15s', opacity:tab.id!=='original'&&!byType(tab.id)?0.4:1 }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div key={activeTab} className="fu">
            {activeTab==='summary'        && (byType('summary')        ? <SummaryCard data={byType('summary')} />               : <EmptyTab label="No summary analysis yet." />)}
            {activeTab==='financial'      && (byType('financial')      ? <FinancialCard data={byType('financial')} />           : <EmptyTab label="No financial analysis yet." />)}
            {activeTab==='risk'           && (byType('risk')           ? <RiskCard data={byType('risk')} flags={full?.risk_flags||[]} /> : <EmptyTab label="No risk analysis yet." />)}
            {activeTab==='legal'          && (byType('legal')          ? <LegalCard data={byType('legal')} />                 : <EmptyTab label="No legal analysis yet." />)}
            {activeTab==='classification' && (byType('classification') ? <ClassificationCard data={byType('classification')} /> : <EmptyTab label="No classification yet." />)}
            {activeTab==='original'       && <OriginalDocTab rawText={doc.raw_text} />}
          </div>
        </>
      )}
    </div>
  );
}

function OriginalDocTab({ rawText }) {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  if (!rawText) return <EmptyTab label="Original text not available. Document may still be processing." />;
  const copy = () => navigator.clipboard.writeText(rawText).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  const renderText = () => {
    if (!search.trim()) return rawText;
    const lower = search.toLowerCase();
    const out = [];
    let idx = 0, pos;
    const text = rawText;
    while ((pos = text.toLowerCase().indexOf(lower, idx)) !== -1) {
      if (pos > idx) out.push(text.slice(idx, pos));
      out.push(<mark key={pos} style={{ background:'rgba(201,168,76,.35)', color:'var(--text)', borderRadius:2 }}>{text.slice(pos, pos + search.length)}</mark>);
      idx = pos + search.length;
    }
    if (idx < text.length) out.push(text.slice(idx));
    return out;
  };
  return (
    <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', flexShrink:0 }}>Extracted text</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search in document…" style={{ flex:1, minWidth:160, fontSize:12, padding:'5px 10px' }} />
        <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0 }}>{rawText.length.toLocaleString()} chars</span>
        <button onClick={copy} style={{ ...S.btnG, fontSize:11, padding:'5px 12px', flexShrink:0 }}>{copied?'✓ Copied':'Copy'}</button>
      </div>
      <pre style={{ padding:'20px 24px', fontFamily:'var(--ffm)', fontSize:12, lineHeight:1.9, color:'var(--muted)', whiteSpace:'pre-wrap', wordBreak:'break-word', maxHeight:'calc(100vh - 320px)', overflowY:'auto', background:'var(--surf2)', margin:0 }}>
        {search.trim() ? renderText() : rawText}
      </pre>
      <div style={{ padding:'8px 16px', borderTop:'1px solid var(--border)', fontSize:10, color:'var(--muted)', textAlign:'right' }}>Prime Alpha Securities · DD Engine · Extracted text</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE 3 — ARCHIVE
// ════════════════════════════════════════════════════════════════════════════
function ArchivePage({ toast }) {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [groupBy, setGroupBy]   = useState('deal');
  const [sortBy, setSortBy]     = useState('date');
  const [selEntry, setSelEntry] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/documents/archive/'); setEntries(data.results||data); }
    catch { toast('Failed to load archive.','error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateNote = async (entryId, note) => {
    try {
      await api.patch(`/documents/archive/${entryId}/`, { analyst_note:note });
      setEntries(es=>es.map(e=>e.id===entryId?{...e,analyst_note:note}:e));
    } catch { toast('Failed to save note.','error'); }
  };

  const reorder = async (entry, dir, groupEntries) => {
    const idx = groupEntries.findIndex(e=>e.id===entry.id);
    const other = groupEntries[idx+dir];
    if (!other) return;
    try {
      await api.patch(`/documents/archive/${entry.id}/`, { sort_order:other.sort_order });
      await api.patch(`/documents/archive/${other.id}/`, { sort_order:entry.sort_order });
      load();
    } catch { toast('Reorder failed.','error'); }
  };

  const filtered = entries.filter(e => !filter ||
    [e.document?.title,e.document?.company_name,e.document?.deal_name,e.group_label].some(s=>(s||'').toLowerCase().includes(filter.toLowerCase())));

  const grouped = filtered.reduce((acc,entry) => {
    const key = groupBy==='deal'?(entry.document?.deal_name||'No deal'):groupBy==='company'?(entry.document?.company_name||'No company'):new Date(entry.archived_at).toLocaleDateString('en-GB',{year:'numeric',month:'short'});
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  },{});

  Object.values(grouped).forEach(g => g.sort((a,b)=>sortBy==='order'?a.sort_order-b.sort_order:sortBy==='date'?new Date(b.archived_at)-new Date(a.archived_at):(a.document?.title||'').localeCompare(b.document?.title||'')));

  return (
    <div style={{ display:'flex', height:'calc(100vh - 54px)' }}>
      <div style={{ width:400, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search archive…" style={{ fontSize:12 }} />
          <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Group:</span>
            {[['deal','Deal'],['company','Company'],['month','Month']].map(([k,l])=>(
              <button key={k} onClick={()=>setGroupBy(k)} style={{ fontSize:11, padding:'3px 9px', borderRadius:'var(--r)', border:`1px solid ${groupBy===k?'var(--gold)':'var(--border)'}`, background:groupBy===k?'rgba(201,168,76,.1)':'transparent', color:groupBy===k?'var(--gold)':'var(--muted)' }}>{l}</button>
            ))}
            <span style={{ fontSize:11, color:'var(--muted)', marginLeft:4 }}>Sort:</span>
            {[['order','Order'],['date','Date'],['title','Title']].map(([k,l])=>(
              <button key={k} onClick={()=>setSortBy(k)} style={{ fontSize:11, padding:'3px 9px', borderRadius:'var(--r)', border:`1px solid ${sortBy===k?'var(--blue)':'var(--border)'}`, background:sortBy===k?'var(--blue-d)':'transparent', color:sortBy===k?'var(--blue)':'var(--muted)' }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
          {loading ? <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner /></div>
           : filtered.length===0 ? <div style={{ color:'var(--muted)', fontSize:12, textAlign:'center', padding:'40px 16px' }}>Archive is empty.<br/>Documents moved from Review appear here.</div>
           : Object.entries(grouped).map(([group,groupEntries]) => (
              <div key={group} style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8, padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                  {group} <span style={{ color:'var(--muted)', fontWeight:400 }}>({groupEntries.length})</span>
                </div>
                {groupEntries.map((entry,ei) => (
                  <div key={entry.id} onClick={()=>setSelEntry(entry)}
                    style={{ padding:'10px 12px', marginBottom:5, borderRadius:'var(--rl)', border:`1px solid ${selEntry?.id===entry.id?'var(--gold)':'var(--border)'}`, background:selEntry?.id===entry.id?'rgba(201,168,76,.06)':'var(--surf)', cursor:'pointer', transition:'all .15s' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:6 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:12, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.document?.title}</div>
                        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                          <Badge label={DOC_TYPES[entry.document?.doc_type]||'doc'} color="var(--blue)" />
                          {entry.document?.company_name&&<span style={{ fontSize:10, color:'var(--muted)' }}>{entry.document.company_name}</span>}
                        </div>
                        {entry.analyst_note&&<div style={{ fontSize:10, color:'var(--muted)', marginTop:4, fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>"{entry.analyst_note}"</div>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
                        <button onClick={e=>{e.stopPropagation();reorder(entry,-1,groupEntries);}} style={{ padding:'1px 6px', fontSize:10, color:'var(--muted)', border:'1px solid var(--border)', borderRadius:3, background:'var(--surf2)' }} disabled={ei===0}>▲</button>
                        <button onClick={e=>{e.stopPropagation();reorder(entry,1,groupEntries);}} style={{ padding:'1px 6px', fontSize:10, color:'var(--muted)', border:'1px solid var(--border)', borderRadius:3, background:'var(--surf2)' }} disabled={ei===groupEntries.length-1}>▼</button>
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:5 }}>Archived {new Date(entry.archived_at).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
           ))}
        </div>
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', fontSize:10, color:'var(--muted)', textAlign:'center' }}>{filtered.length} documents · Prime Alpha Securities · DD Engine</div>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {selEntry ? <ArchiveEntryDetail entry={selEntry} onNoteUpdate={updateNote} toast={toast} />
                  : <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:12 }}><div style={{ fontSize:32, color:'var(--border2)' }}>⬅</div><div style={{ color:'var(--muted)', fontSize:13 }}>Select an archived document to view</div></div>}
      </div>
    </div>
  );
}

function ArchiveEntryDetail({ entry, onNoteUpdate, toast }) {
  const doc = entry.document || {};
  const [note, setNote]         = useState(entry.analyst_note||'');
  const [saving, setSaving]     = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setNote(entry.analyst_note||'');
    setLoading(true);
    api.get(`/analysis/by_document/?document_id=${doc.id}`).then(({data})=>setAnalyses(data)).catch(()=>{}).finally(()=>setLoading(false));
  }, [entry.id, doc.id]);

  const saveNote = async () => { setSaving(true); await onNoteUpdate(entry.id,note); setSaving(false); };
  const full   = analyses.find(a=>a.analysis_type==='full'&&a.status==='complete');
  const byType = t => full?.result?.[t]||analyses.find(a=>a.analysis_type===t&&a.status==='complete')?.result||null;

  const TABS = [{ id:'summary',label:'Summary' },{ id:'risk',label:'Risk' },{ id:'financial',label:'Financial' },{ id:'legal',label:'Legal' },{ id:'original',label:'Original doc' }];

  return (
    <div style={{ padding:24 }} className="fu">
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{doc.company_name&&`${doc.company_name} · `}{doc.deal_name&&`${doc.deal_name} · `}Archived {new Date(entry.archived_at).toLocaleDateString()}</div>
        <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>{doc.title}</h2>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
          <Badge label={DOC_TYPES[doc.doc_type]||doc.doc_type} color="var(--blue)" />
          {doc.page_count&&<Badge label={`${doc.page_count}p`} color="var(--muted)" />}
        </div>
        <div style={{ ...S.card, padding:'12px 14px', background:'var(--surf2)' }}>
          <label style={S.lbl}>Analyst note</label>
          <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
            <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Add a note about this document…" style={{ flex:1, resize:'vertical', fontSize:12 }} />
            <button onClick={saveNote} style={{ ...S.btnP, fontSize:12, padding:'8px 14px', flexShrink:0 }} disabled={saving}>{saving?'Saving…':'Save'}</button>
          </div>
        </div>
      </div>
      {loading ? <div style={{ display:'flex', gap:12, alignItems:'center', padding:'24px 0' }}><Spinner /><span style={{ color:'var(--muted)' }}>Loading…</span></div> : (
        <>
          <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
            {TABS.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{ padding:'8px 16px', fontSize:12, fontWeight:activeTab===tab.id?600:400, color:activeTab===tab.id?'var(--gold)':'var(--muted)', borderBottom:`2px solid ${activeTab===tab.id?'var(--gold)':'transparent'}`, background:'transparent', transition:'all .15s', opacity:tab.id!=='original'&&!byType(tab.id)?0.4:1 }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div key={activeTab} className="fu">
            {activeTab==='summary'   && (byType('summary')   ?<SummaryCard data={byType('summary')} />:<EmptyTab label="No summary." />)}
            {activeTab==='risk'      && (byType('risk')      ?<RiskCard data={byType('risk')} flags={full?.risk_flags||[]} />:<EmptyTab label="No risk analysis." />)}
            {activeTab==='financial' && (byType('financial') ?<FinancialCard data={byType('financial')} />:<EmptyTab label="No financial analysis." />)}
            {activeTab==='legal'     && (byType('legal')     ?<LegalCard data={byType('legal')} />:<EmptyTab label="No legal analysis." />)}
            {activeTab==='original'  && <OriginalDocTab rawText={doc.raw_text} />}
          </div>
        </>
      )}
    </div>
  );
}

// ── ANALYSIS CARDS ────────────────────────────────────────────────────────────
function SummaryCard({ data }) {
  return (
    <SectionCard title="Executive Summary" accent="var(--gold)">
      {data.headline&&<div style={{ fontSize:16, fontWeight:700, marginBottom:12, lineHeight:1.4 }}>{data.headline}</div>}
      {data.executive_summary&&<p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8, marginBottom:16 }}>{data.executive_summary}</p>}
      {data.key_highlights?.length>0&&<div style={{ marginBottom:12 }}><div style={S.lbl}>Key highlights</div>{data.key_highlights.map((h,i)=><div key={i} style={{ fontSize:12, color:'var(--text)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span style={{ color:'var(--blue)' }}>●</span>{h}</div>)}</div>}
      {data.key_concerns?.length>0&&<div style={{ marginBottom:12 }}><div style={S.lbl}>Key concerns</div>{data.key_concerns.map((c,i)=><div key={i} style={{ fontSize:12, color:'var(--amber)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>▲</span>{c}</div>)}</div>}
      {data.next_steps?.length>0&&<div><div style={S.lbl}>Next steps</div>{data.next_steps.map((s,i)=><div key={i} style={{ fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span style={{ color:'var(--green)' }}>{i+1}.</span>{s}</div>)}</div>}
    </SectionCard>
  );
}

function FinancialCard({ data }) {
  const is_=data.income_statement||{},bs=data.balance_sheet||{},rat=data.ratios||{},hist=data.historical_data||[];
  const fmt=v=>v==null?'—':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v);
  const pct=v=>v==null?'—':`${Number(v).toFixed(1)}%`;
  return (
    <SectionCard title="Financial Analysis" accent="var(--green)">
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {data.period&&<Badge label={data.period} color="var(--muted)" />}{data.currency&&<Badge label={data.currency} color="var(--muted)" />}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10, marginBottom:16 }}>
        {[['Revenue',is_.revenue],['EBITDA',is_.ebitda],['Net Income',is_.net_income],['Total Debt',bs.total_debt],['Cash',bs.cash],['Equity',bs.total_equity]].map(([l,v])=>(
          <div key={l} style={{ background:'var(--surf2)', borderRadius:'var(--r)', padding:'10px 12px', border:'1px solid var(--border)' }}>
            <div style={S.lbl}>{l}</div><div style={{ fontFamily:'var(--ffm)', fontSize:15, fontWeight:600 }}>{fmt(v)}</div>
          </div>
        ))}
      </div>
      {hist.filter(h=>h.revenue).length>1&&(
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hist} margin={{top:0,right:0,bottom:0,left:0}}>
            <XAxis dataKey="year" tick={{fontSize:10,fill:'var(--muted)'}} axisLine={false} tickLine={false} />
            <YAxis tick={{fontSize:10,fill:'var(--muted)'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)} />
            <Tooltip contentStyle={{background:'var(--surf2)',border:'1px solid var(--border)',borderRadius:'var(--r)',fontSize:11}} />
            <Bar dataKey="revenue" fill="var(--blue)" radius={[3,3,0,0]} name="Revenue" />
            <Bar dataKey="ebitda" fill="var(--green)" radius={[3,3,0,0]} name="EBITDA" />
          </BarChart>
        </ResponsiveContainer>
      )}
      {data.red_flags?.length>0&&<div style={{ marginTop:12 }}><div style={S.lbl}>Red flags</div>{data.red_flags.map((f,i)=><div key={i} style={{ fontSize:12, color:'var(--red)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>⚠</span>{f}</div>)}</div>}
    </SectionCard>
  );
}

function RiskCard({ data, flags }) {
  const score=data.overall_risk_score||0;
  const sColor=score>=8?'var(--red)':score>=6?'var(--amber)':score>=4?'var(--gold)':'var(--green)';
  const allFlags=flags?.length>0?flags:(data.risk_flags||[]);
  return (
    <SectionCard title="Risk Assessment" accent="var(--red)">
      <div style={{ display:'flex', gap:24, marginBottom:20, alignItems:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'var(--ffm)', fontSize:48, fontWeight:700, color:sColor, lineHeight:1 }}>{score}</div>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginTop:4 }}>/ 10</div>
        </div>
        <div>
          <div style={S.lbl}>Overall risk</div><Badge label={data.overall_risk_level||'—'} color={sColor} />
          <div style={{ marginTop:10 }}><div style={S.lbl}>Recommendation</div><Badge label={(data.investment_recommendation||'—').replace(/_/g,' ')} color={data.investment_recommendation==='proceed'?'var(--green)':data.investment_recommendation?.includes('not')?'var(--red)':'var(--amber)'} /></div>
        </div>
        {data.summary&&<p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.75, flex:1 }}>{data.summary}</p>}
      </div>
      {allFlags.length>0&&<div style={{ marginBottom:16 }}><div style={S.lbl}>Risk flags ({allFlags.length})</div>{allFlags.map((f,i)=>(<div key={i} style={{ padding:'10px 14px', borderRadius:'var(--r)', marginBottom:6, background:SEV_B[f.severity], border:`1px solid ${SEV_C[f.severity]}44`, borderLeft:`3px solid ${SEV_C[f.severity]}` }}><div style={{ display:'flex', gap:8, marginBottom:4, alignItems:'center' }}><span style={S.tag(SEV_C[f.severity],SEV_B[f.severity])}>{f.severity}</span><span style={S.tag('var(--muted)','var(--surf2)')}>{f.category}</span><strong style={{ fontSize:13 }}>{f.title}</strong></div><p style={{ fontSize:12, color:'var(--muted)', lineHeight:1.65 }}>{f.detail}</p>{f.mitigation&&<p style={{ fontSize:11, color:'var(--green)', marginTop:4 }}>Mitigation: {f.mitigation}</p>}</div>))}</div>}
      {data.strengths?.length>0&&<div style={{ marginBottom:12 }}><div style={S.lbl}>Strengths</div>{data.strengths.map((s,i)=><div key={i} style={{ fontSize:12, color:'var(--green)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>✓</span>{s}</div>)}</div>}
      {data.diligence_gaps?.length>0&&<div><div style={S.lbl}>Diligence gaps</div>{data.diligence_gaps.map((g,i)=><div key={i} style={{ fontSize:12, color:'var(--amber)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>△</span>{g}</div>)}</div>}
    </SectionCard>
  );
}

function LegalCard({ data }) {
  const kt=data.key_terms||{};
  return (
    <SectionCard title="Legal Analysis" accent="var(--purple)">
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        {data.document_type&&<Badge label={data.document_type} color="var(--purple)" />}{data.governing_law&&<Badge label={data.governing_law} color="var(--muted)" />}
      </div>
      {data.parties?.length>0&&<div style={{ marginBottom:12 }}><div style={S.lbl}>Parties</div><div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{data.parties.map((p,i)=><Badge key={i} label={p} color="var(--blue)" />)}</div></div>}
      {Object.entries(kt).filter(([,v])=>v).map(([key,val])=>(<div key={key} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)' }}><div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:3 }}>{key.replace(/_/g,' ')}</div><div style={{ fontSize:12, lineHeight:1.65 }}>{Array.isArray(val)?val.join(', '):val}</div></div>))}
      {data.risk_provisions?.length>0&&<div style={{ marginTop:12 }}><div style={S.lbl}>Risk provisions</div>{data.risk_provisions.map((p,i)=><div key={i} style={{ fontSize:12, color:'var(--amber)', padding:'4px 0', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}><span>⚠</span>{p}</div>)}</div>}
    </SectionCard>
  );
}

function ClassificationCard({ data }) {
  return (
    <SectionCard title="Document Classification" accent="var(--blue)">
      <div style={{ display:'flex', gap:20, flexWrap:'wrap', marginBottom:14 }}>
        <div><div style={S.lbl}>Type detected</div><Badge label={data.document_type||'—'} /></div>
        <div><div style={S.lbl}>Confidence</div><span style={{ fontFamily:'var(--ffm)', color:'var(--blue)' }}>{data.confidence?`${(data.confidence*100).toFixed(0)}%`:'—'}</span></div>
        <div><div style={S.lbl}>Company</div><span style={{ fontWeight:600 }}>{data.company_name||'—'}</span></div>
        <div><div style={S.lbl}>Language</div><Badge label={data.language||'—'} color="var(--purple)" /></div>
        <div><div style={S.lbl}>Data quality</div><Badge label={data.data_quality||'—'} color={data.data_quality==='high'?'var(--green)':data.data_quality==='medium'?'var(--amber)':'var(--red)'} /></div>
      </div>
      {data.summary&&<p style={{ fontSize:13, color:'var(--muted)', lineHeight:1.7, marginBottom:10 }}>{data.summary}</p>}
      {data.key_topics?.length>0&&<div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{data.key_topics.map((t,i)=><span key={i} style={S.tag('var(--purple)','rgba(167,139,250,.1)')}>{t}</span>)}</div>}
    </SectionCard>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed]     = useState(!!localStorage.getItem('dd_token'));
  const [page, setPage]         = useState('intake');
  const [toasts, setToasts]     = useState([]);
  const [refreshTrigger, setRT] = useState(0);

  const toast = (msg, type='success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500);
  };

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  const signOut = () => { localStorage.removeItem('dd_token'); setAuthed(false); };

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)' }}>
      <Header page={page} setPage={setPage} onSignOut={signOut} />
      {page==='intake'  && <IntakePage  toast={toast} onDocUploaded={()=>setRT(r=>r+1)} />}
      {page==='review'  && <ReviewPage  toast={toast} refreshTrigger={refreshTrigger} />}
      {page==='archive' && <ArchivePage toast={toast} />}
      <Toast toasts={toasts} />
    </div>
  );
}