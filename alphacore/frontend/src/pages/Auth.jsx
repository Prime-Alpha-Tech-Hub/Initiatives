import { useState } from 'react';
import { accountsApi } from '../utils/api';

// ── Shared mini-components ────────────────────────────────────────────────────
const S = {
  btnP: { background:'var(--blue)', color:'#fff', padding:'10px 20px', borderRadius:'6px', fontWeight:600, fontSize:13, cursor:'pointer', border:'none', width:'100%', transition:'opacity 0.15s' },
  btnO: { background:'transparent', color:'var(--blue)', border:'1.5px solid var(--blue)', padding:'9px 20px', borderRadius:'6px', fontWeight:600, fontSize:13, cursor:'pointer', width:'100%' },
  btnG: { background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'9px 20px', borderRadius:'6px', fontSize:13, cursor:'pointer', width:'100%' },
  inp:  { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'6px', padding:'10px 14px', color:'var(--text)', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' },
  lbl:  { display:'block', fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', marginBottom:6, fontWeight:600 },
  err:  { color:'var(--red)', fontSize:12, padding:'8px 12px', background:'rgba(255,77,106,0.08)', border:'1px solid rgba(255,77,106,0.25)', borderRadius:'6px', marginBottom:12 },
  card: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:28, boxShadow:'0 4px 24px rgba(0,0,0,0.5)' },
};

function Field({ label, ...p }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={S.lbl}>{label}</label>}
      <input style={S.inp} {...p} />
    </div>
  );
}

// ── Left branding panel (shared) ──────────────────────────────────────────────
function BrandPanel() {
  return (
    <div style={{ width:400, background:'var(--surface)', borderRight:'1px solid var(--border)', padding:52, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
      <div>
        <div style={{ fontFamily:'var(--ffm)', fontSize:12, fontWeight:700, color:'var(--blue)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:40 }}>AlphaCore</div>
        <h1 style={{ fontSize:36, fontWeight:700, lineHeight:1.1, letterSpacing:'-1px', marginBottom:16 }}>Central Investment<br/>Data Platform</h1>
        <p style={{ color:'var(--muted)', lineHeight:1.8, fontSize:14, marginBottom:32 }}>One system for your entire investment operation — deal pipeline, due diligence, IC workflow, portfolio monitoring, and document repository.</p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {['Deal pipeline across 4 strategies', 'Due diligence checklists, auto-generated', 'IC vote workflow with full audit trail', 'Portfolio NAV monitoring', 'Encrypted document repository'].map(f => (
            <div key={f} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'var(--muted)' }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background:'var(--blue-dim)', border:'1px solid var(--blue)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--blue)', fontWeight:700, flexShrink:0 }}>✓</div>
              {f}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)' }}>© {new Date().getFullYear()} AlphaCore · Initiative 01 of 15</div>
    </div>
  );
}

// ── SIGN UP ───────────────────────────────────────────────────────────────────
export function SignUpPage({ onSuccess, goLogin }) {
  const [form, setForm] = useState({ email:'', password:'', confirm:'', first_name:'', last_name:'' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const submit = async () => {
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await accountsApi.register({
        email: form.email, password: form.password,
        first_name: form.first_name, last_name: form.last_name,
      });
      localStorage.setItem('access_token',  data.tokens.access);
      localStorage.setItem('refresh_token', data.tokens.refresh);
      onSuccess(data);
    } catch (e) {
      const msg = e.response?.data?.email?.[0] || e.response?.data?.password?.[0] || 'Registration failed.';
      setError(msg);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      <BrandPanel />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <h2 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Create your account</h2>
          <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>Free to start — no credit card, no domain required.</p>

          <a href="/api/auth/social/google/login/?next=/onboarding" style={{ display:'block', marginBottom:16 }}>
            <button style={{ ...S.btnG, display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </a>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>or</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>
          {error && <div style={S.err}>{error}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="First Name" value={form.first_name} onChange={set('first_name')} placeholder="Noe" />
            <Field label="Last Name"  value={form.last_name}  onChange={set('last_name')}  placeholder="Ikoué" />
          </div>
          <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
          <Field label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" />
          <Field label="Confirm Password" type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" />

          <button style={S.btnP} onClick={submit} disabled={busy}>{busy ? 'Creating account…' : 'Create Account →'}</button>
          <p style={{ textAlign:'center', fontSize:13, color:'var(--muted)', marginTop:16 }}>
            Already have an account?{' '}
            <button onClick={goLogin} style={{ color:'var(--blue)', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>Sign in</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── SIGN IN ───────────────────────────────────────────────────────────────────
export function SignInPage({ onSuccess, goRegister }) {
  const [form, setForm] = useState({ email:'', password:'' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));

  const submit = async () => {
    if (!form.email || !form.password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await accountsApi.login(form.email, form.password);
      localStorage.setItem('access_token',  data.access);
      localStorage.setItem('refresh_token', data.refresh);
      const me = await accountsApi.me();
      onSuccess(me.data);
    } catch (e) {
      const status = e.response?.status;
      if (status === 401 || status === 400) {
        setError('Invalid email or password. Please try again.');
      } else if (!status) {
        setError('Cannot reach server. Make sure the backend is running.');
      } else {
        setError(`Login failed (${status}). Please try again.`);
      }
    } finally { setBusy(false); }
  };

  const onKey = e => { if (e.key === 'Enter') submit(); };

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      <BrandPanel />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <h2 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Sign in</h2>
          <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>Welcome back.</p>

          <a href="/api/auth/social/google/login/?next=/dashboard" style={{ display:'block', marginBottom:16 }}>
            <button style={{ ...S.btnG, display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </a>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
            <span style={{ fontSize:11, color:'var(--muted)' }}>or</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>
          {error && <div style={S.err}>{error}</div>}
          <Field label="Email" type="email" value={form.email} onChange={set('email')} onKeyDown={onKey} placeholder="you@example.com" />
          <Field label="Password" type="password" value={form.password} onChange={set('password')} onKeyDown={onKey} placeholder="••••••••" />

          <button style={S.btnP} onClick={submit} disabled={busy}>{busy ? 'Signing in…' : 'Sign In →'}</button>
          <p style={{ textAlign:'center', fontSize:13, color:'var(--muted)', marginTop:16 }}>
            No account yet?{' '}
            <button onClick={goRegister} style={{ color:'var(--blue)', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>Create one free</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── ONBOARDING WIZARD ─────────────────────────────────────────────────────────
export function OnboardingWizard({ user, onComplete }) {
  const [step, setStep]   = useState('choose');  // choose | create | join | pending
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  // Create company state
  const [company, setCompany] = useState({ name:'', industry:'', country:'', city:'', description:'', website:'' });
  const setC = k => e => setCompany(c => ({...c, [k]: e.target.value}));

  // Join company state
  const [search, setSearch]     = useState('');
  const [results, setResults]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage]   = useState('');
  const [searching, setSrch]    = useState(false);

  const doSearch = async (q) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    setSrch(true);
    try {
      const { data } = await accountsApi.searchCompanies(q);
      setResults(data);
    } finally { setSrch(false); }
  };

  const createCompany = async () => {
    if (!company.name.trim()) { setError('Company name is required.'); return; }
    setBusy(true); setError('');
    try {
      await accountsApi.createCompany(company);
      onComplete();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create company.');
    } finally { setBusy(false); }
  };

  const requestJoin = async () => {
    if (!selected) { setError('Select a company first.'); return; }
    setBusy(true); setError('');
    try {
      await accountsApi.requestJoin({ company_id: selected.id, message });
      setStep('pending');
    } catch (e) {
      setError(e.response?.data?.error || 'Request failed.');
    } finally { setBusy(false); }
  };

  const firstName = user?.first_name || user?.user?.first_name || 'there';

  // ── Choose path ──────────────────────────────────────────────────────────
  if (step === 'choose') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:560 }}>
        <div style={{ fontFamily:'var(--ffm)', fontSize:12, fontWeight:700, color:'var(--blue)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:24, textAlign:'center' }}>AlphaCore</div>
        <h1 style={{ fontSize:28, fontWeight:700, textAlign:'center', marginBottom:8 }}>Welcome, {firstName} 👋</h1>
        <p style={{ color:'var(--muted)', textAlign:'center', marginBottom:36, fontSize:14 }}>Let's get you set up. Are you creating a new firm profile or joining an existing one?</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <button onClick={() => setStep('create')} style={{ ...S.card, cursor:'pointer', border:'2px solid var(--border)', textAlign:'left', padding:24, transition:'border-color 0.15s', background:'var(--surface)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--blue)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{ fontSize:28, marginBottom:12 }}>🏢</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Create a Company</div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.65 }}>I'm setting up a new firm. I'll be the owner and invite my team.</div>
          </button>
          <button onClick={() => setStep('join')} style={{ ...S.card, cursor:'pointer', border:'2px solid var(--border)', textAlign:'left', padding:24, transition:'border-color 0.15s', background:'var(--surface)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--blue)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{ fontSize:28, marginBottom:12 }}>🤝</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>Join a Company</div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.65 }}>My firm is already on AlphaCore. I want to request access.</div>
          </button>
        </div>
      </div>
    </div>
  );

  // ── Create company ───────────────────────────────────────────────────────
  if (step === 'create') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:520 }}>
        <button onClick={() => setStep('choose')} style={{ color:'var(--muted)', fontSize:13, background:'none', border:'none', cursor:'pointer', marginBottom:24 }}>← Back</button>
        <h2 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Set Up Your Company</h2>
        <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>You'll be the owner. You can invite and approve team members once set up.</p>
        {error && <div style={S.err}>{error}</div>}
        <Field label="Company Name *" value={company.name} onChange={setC('name')} placeholder="Prime Alpha Securities" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Industry" value={company.industry} onChange={setC('industry')} placeholder="Alternative Investment" />
          <Field label="Country" value={company.country} onChange={setC('country')} placeholder="Cameroon" />
        </div>
        <Field label="City" value={company.city} onChange={setC('city')} placeholder="Douala" />
        <Field label="Website" type="url" value={company.website} onChange={setC('website')} placeholder="https://yourfirm.com (optional)" />
        <div style={{ marginBottom:14 }}>
          <label style={S.lbl}>Description</label>
          <textarea value={company.description} onChange={setC('description')} placeholder="Brief description of your firm…" style={{ ...S.inp, minHeight:72, resize:'vertical' }} />
        </div>
        <button style={S.btnP} onClick={createCompany} disabled={busy}>{busy ? 'Creating…' : 'Create Company & Continue →'}</button>
      </div>
    </div>
  );

  // ── Join company ─────────────────────────────────────────────────────────
  if (step === 'join') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:520 }}>
        <button onClick={() => setStep('choose')} style={{ color:'var(--muted)', fontSize:13, background:'none', border:'none', cursor:'pointer', marginBottom:24 }}>← Back</button>
        <h2 style={{ fontSize:24, fontWeight:700, marginBottom:6 }}>Find Your Company</h2>
        <p style={{ color:'var(--muted)', fontSize:13, marginBottom:28 }}>Search for your firm. The owner will receive your request and approve your access.</p>
        {error && <div style={S.err}>{error}</div>}

        <Field label="Search Companies" value={search} onChange={e => doSearch(e.target.value)} placeholder="Type your company name…" />

        {searching && <div style={{ textAlign:'center', padding:20, color:'var(--muted)' }}>Searching…</div>}

        {results.length > 0 && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, marginBottom:16, overflow:'hidden' }}>
            {results.map(r => (
              <div key={r.id} onClick={() => setSelected(r)} style={{ padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', background: selected?.id === r.id ? 'var(--blue-dim)' : 'none', transition:'background 0.12s' }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{r.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{[r.industry, r.country, r.city].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginLeft:16, flexShrink:0 }}>{r.member_count} members</div>
                {selected?.id === r.id && <div style={{ color:'var(--blue)', fontSize:16, marginLeft:10 }}>✓</div>}
              </div>
            ))}
          </div>
        )}

        {search.length >= 2 && results.length === 0 && !searching && (
          <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:13 }}>
            No companies found. Ask your owner to check they're registered, or{' '}
            <button onClick={() => setStep('create')} style={{ color:'var(--blue)', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>create a new one</button>.
          </div>
        )}

        {selected && (
          <div>
            <div style={{ marginBottom:14 }}>
              <label style={S.lbl}>Message to Owner (optional)</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Hi, I'm on the investment team…" style={{ ...S.inp, minHeight:72, resize:'vertical' }} />
            </div>
            <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:13 }}>
              Requesting access to <strong>{selected.name}</strong>. The owner will be notified and must approve before you can access the platform.
            </div>
            <button style={S.btnP} onClick={requestJoin} disabled={busy}>{busy ? 'Sending…' : 'Send Join Request →'}</button>
          </div>
        )}
      </div>
    </div>
  );

  // ── Pending approval ─────────────────────────────────────────────────────
  if (step === 'pending') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:440 }}>
        <div style={{ fontSize:56, marginBottom:20 }}>⏳</div>
        <h2 style={{ fontSize:26, fontWeight:700, marginBottom:10 }}>Request Sent</h2>
        <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.8, marginBottom:28 }}>
          Your request to join <strong style={{ color:'var(--text)' }}>{selected?.name}</strong> has been sent. The owner will review your request and approve your access.
        </p>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, marginBottom:24 }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>While you wait, you can</div>
          <div style={{ fontSize:13, color:'var(--text)', lineHeight:2 }}>
            · Read the platform documentation<br/>
            · Complete your profile<br/>
            · Check back here to see if you've been approved
          </div>
        </div>
        <button style={S.btnO} onClick={() => window.location.reload()}>Check Approval Status</button>
      </div>
    </div>
  );

  return null;
}

// ── PENDING APPROVAL screen (shown if member is still pending) ────────────────
export function PendingApprovalScreen({ companyName, onRefresh }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:420 }}>
        <div style={{ fontSize:52, marginBottom:20 }}>🔐</div>
        <h2 style={{ fontSize:24, fontWeight:700, marginBottom:10 }}>Access Pending</h2>
        <p style={{ color:'var(--muted)', fontSize:14, lineHeight:1.8, marginBottom:28 }}>
          Your request to join <strong style={{ color:'var(--text)' }}>{companyName}</strong> is waiting for approval from the company owner or admin.
        </p>
        <button style={{ ...S.btnP, maxWidth:200, margin:'0 auto' }} onClick={onRefresh}>Refresh Status</button>
        <p style={{ fontSize:12, color:'var(--muted)', marginTop:16 }}>You'll be able to access the platform as soon as your request is approved.</p>
      </div>
    </div>
  );
}
