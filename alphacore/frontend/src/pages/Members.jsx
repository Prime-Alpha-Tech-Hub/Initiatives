import { useState, useEffect } from 'react';
import { accountsApi } from '../utils/api';

const S = {
  card:  { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.4)' },
  btnP:  { background:'var(--blue)', color:'#fff', padding:'7px 16px', borderRadius:6, fontWeight:600, fontSize:12, cursor:'pointer', border:'none', whiteSpace:'nowrap' },
  btnO:  { background:'transparent', color:'var(--blue)', border:'1.5px solid var(--blue)', padding:'6px 16px', borderRadius:6, fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' },
  btnG:  { background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer' },
  btnD:  { background:'rgba(255,77,106,0.1)', color:'var(--red)', border:'1px solid rgba(255,77,106,0.3)', padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer' },
  tag:   (c='var(--blue)', bg='rgba(59,107,255,0.12)') => ({ display:'inline-flex', alignItems:'center', background:bg, color:c, border:`1px solid ${c}33`, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' }),
  lbl:   { display:'block', fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', marginBottom:6, fontWeight:600 },
};

const ROLE_COLORS = { owner:'var(--gold)', admin:'var(--blue)', pm:'var(--green)', analyst:'#a78bfa', viewer:'var(--muted)' };

export default function MembersPage({ membership, toast }) {
  const [tab, setTab]               = useState('members');
  const [members, setMembers]       = useState([]);
  const [requests, setRequests]     = useState([]);
  const [roles, setRoles]           = useState([]);
  const [pendingCount, setPending]  = useState(0);
  const [loading, setLoading]       = useState(true);
  const [showRoleEdit, setRoleEdit] = useState(null);  // member being role-changed
  const [showNewRole, setNewRole]   = useState(false);
  const [newRoleForm, setNRF]       = useState({ label:'', name:'', can_view_deals:true, can_create_deals:false, can_edit_deals:false, can_edit_dd:false, can_create_memos:false, can_vote_ic:false, can_view_portfolio:true, can_upload_documents:false });

  const canManage = membership?.can_approve_members || membership?.permissions?.can_manage_members;
  const isOwner   = membership?.role === 'owner';

  const load = () => {
    setLoading(true);
    const calls = [accountsApi.getMembers(), accountsApi.getRoles()];
    if (canManage) calls.push(accountsApi.getPendingRequests(), accountsApi.pendingCount());
    Promise.all(calls).then(([m, r, reqs, cnt]) => {
      setMembers(m.data.results || m.data);
      setRoles(r.data.results || r.data);
      if (reqs) setRequests(reqs.data.results || reqs.data);
      if (cnt)  setPending(cnt.data.count);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const approve = async (req, role = 'analyst') => {
    try { await accountsApi.approveRequest(req.id, role); toast('Member approved.'); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const reject = async (req) => {
    try { await accountsApi.rejectRequest(req.id); toast('Request rejected.'); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const changeRole = async (memberId, roleId) => {
    try { await accountsApi.changeRole(memberId, roleId); toast('Role updated.'); setRoleEdit(null); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const delegate = async (memberId, canApprove) => {
    try { await accountsApi.delegateApproval(memberId, canApprove); toast(canApprove ? 'Approval rights granted.' : 'Approval rights revoked.'); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const remove = async (memberId) => {
    if (!window.confirm('Remove this member?')) return;
    try { await accountsApi.removeMember(memberId); toast('Member removed.'); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const createRole = async () => {
    if (!newRoleForm.label.trim()) return;
    const name = newRoleForm.label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    try { await accountsApi.createRole({ ...newRoleForm, name }); toast('Role created.'); setNewRole(false); load(); }
    catch { toast('Failed.', 'error'); }
  };

  const PERMISSION_LABELS = [
    ['can_view_deals',       'View Deals'],
    ['can_create_deals',     'Create Deals'],
    ['can_edit_deals',       'Edit Deals'],
    ['can_delete_deals',     'Delete Deals'],
    ['can_edit_dd',          'Edit Due Diligence'],
    ['can_create_memos',     'Create IC Memos'],
    ['can_vote_ic',          'Vote on IC Memos'],
    ['can_decide_ic',        'Final IC Decision'],
    ['can_view_portfolio',   'View Portfolio'],
    ['can_edit_portfolio',   'Edit Portfolio'],
    ['can_upload_documents', 'Upload Documents'],
    ['can_delete_documents', 'Delete Documents'],
    ['can_manage_members',   'Manage Members'],
    ['can_manage_company',   'Manage Company Settings'],
  ];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:700, letterSpacing:'-0.4px', marginBottom:4 }}>Team & Access</h1>
          <p style={{ color:'var(--muted)', fontSize:13 }}>{members.length} active members</p>
        </div>
        {isOwner && <button style={S.btnP} onClick={() => setNewRole(true)}>+ New Role</button>}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:24, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {[
          { key:'members',  label:'Members' },
          canManage && { key:'requests', label:`Pending Requests${pendingCount ? ` (${pendingCount})` : ''}` },
          { key:'roles',    label:'Roles & Permissions' },
        ].filter(Boolean).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding:'8px 16px', fontSize:13, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? 'var(--blue)' : 'var(--muted)', background:'none', border:'none', cursor:'pointer', borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent', transition:'all 0.12s', marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
          <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTop:'3px solid var(--blue)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
        </div>
      ) : (

        <>
          {/* ── Members tab ────────────────────────────────────────────────── */}
          {tab === 'members' && (
            <div style={S.card}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Member', 'Role', 'Can Approve', 'Joined', canManage ? 'Actions' : ''].map(h => (
                      <th key={h} style={{ textAlign:'left', padding:'8px 14px', fontSize:11, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} style={{ borderBottom:'1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                      onMouseLeave={e => e.currentTarget.style.background='none'}>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{m.user.full_name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{m.user.email}</div>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={S.tag(ROLE_COLORS[m.role?.name] || 'var(--muted)')}>{m.role?.label || '—'}</span>
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, color: m.can_approve_members ? 'var(--green)' : 'var(--muted)' }}>
                        {m.can_approve_members ? '✓ Yes' : '—'}
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:'var(--muted)' }}>
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>
                      {canManage && (
                        <td style={{ padding:'12px 14px' }}>
                          {m.role?.name !== 'owner' && (
                            <div style={{ display:'flex', gap:6 }}>
                              <button style={S.btnG} onClick={() => setRoleEdit(m)}>Change Role</button>
                              {isOwner && (
                                <button style={{ ...S.btnG, fontSize:11 }} onClick={() => delegate(m.id, !m.can_approve_members)}>
                                  {m.can_approve_members ? 'Revoke Approval' : 'Grant Approval'}
                                </button>
                              )}
                              <button style={S.btnD} onClick={() => remove(m.id)}>Remove</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pending requests tab ───────────────────────────────────────── */}
          {tab === 'requests' && canManage && (
            <div>
              {requests.length === 0 ? (
                <div style={{ ...S.card, textAlign:'center', padding:48, color:'var(--muted)' }}>
                  No pending join requests.
                </div>
              ) : requests.map(req => (
                <div key={req.id} style={{ ...S.card, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{req.user.full_name}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>{req.user.email}</div>
                    {req.message && (
                      <div style={{ fontSize:12, color:'var(--muted)', background:'var(--surface2)', padding:'6px 10px', borderRadius:6, maxWidth:400, fontStyle:'italic' }}>
                        "{req.message}"
                      </div>
                    )}
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>
                      Requested {new Date(req.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexShrink:0, marginLeft:20 }}>
                    <select defaultValue="analyst" id={`role-${req.id}`} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:12, cursor:'pointer' }}>
                      {roles.filter(r => r.name !== 'owner').map(r => (
                        <option key={r.id} value={r.name}>{r.label}</option>
                      ))}
                    </select>
                    <button style={S.btnP} onClick={() => {
                      const sel = document.getElementById(`role-${req.id}`);
                      approve(req, sel?.value || 'analyst');
                    }}>Approve</button>
                    <button style={S.btnD} onClick={() => reject(req)}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Roles tab ──────────────────────────────────────────────────── */}
          {tab === 'roles' && (
            <div style={{ display:'grid', gap:14 }}>
              {roles.map(role => (
                <div key={role.id} style={{ ...S.card, borderLeft:`3px solid ${ROLE_COLORS[role.name] || 'var(--border)'}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15 }}>{role.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                        {role.member_count} members · {role.is_builtin ? 'Built-in' : 'Custom'}
                      </div>
                    </div>
                    <span style={S.tag(ROLE_COLORS[role.name] || 'var(--muted)')}>{role.name}</span>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {PERMISSION_LABELS.map(([key, label]) => (
                      <div key={key} style={{ fontSize:11, padding:'3px 8px', borderRadius:4, background: role[key] ? 'rgba(45,212,160,0.1)' : 'var(--surface2)', color: role[key] ? 'var(--green)' : 'var(--muted)', border: `1px solid ${role[key] ? 'rgba(45,212,160,0.3)' : 'var(--border)'}` }}>
                        {role[key] ? '✓' : '✗'} {label}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Change role modal */}
      {showRoleEdit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setRoleEdit(null)}>
          <div style={{ ...S.card, maxWidth:380, width:'100%', padding:24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>Change Role</h3>
            <p style={{ color:'var(--muted)', fontSize:13, marginBottom:20 }}>Changing role for <strong>{showRoleEdit.user.full_name}</strong></p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {roles.filter(r => r.name !== 'owner').map(r => (
                <button key={r.id} onClick={() => changeRole(showRoleEdit.id, r.id)} style={{ textAlign:'left', padding:'10px 14px', borderRadius:8, border:`1.5px solid ${showRoleEdit.role?.id === r.id ? 'var(--blue)' : 'var(--border)'}`, background: showRoleEdit.role?.id === r.id ? 'var(--blue-dim)' : 'var(--surface2)', cursor:'pointer', transition:'all 0.12s' }}>
                  <div style={{ fontWeight:600, fontSize:13, color: showRoleEdit.role?.id === r.id ? 'var(--blue)' : 'var(--text)' }}>{r.label}</div>
                </button>
              ))}
            </div>
            <button style={S.btnG} onClick={() => setRoleEdit(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* New custom role modal */}
      {showNewRole && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={() => setNewRole(false)}>
          <div style={{ ...S.card, maxWidth:560, width:'100%', maxHeight:'90vh', overflowY:'auto', padding:28 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontWeight:700, fontSize:17, marginBottom:20 }}>Create Custom Role</h3>
            <div style={{ marginBottom:14 }}>
              <label style={S.lbl}>Role Name *</label>
              <input value={newRoleForm.label} onChange={e => setNRF(f => ({...f, label:e.target.value}))} placeholder="e.g. Senior Analyst" style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={S.lbl}>Permissions</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {PERMISSION_LABELS.map(([key, label]) => (
                  <label key={key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, padding:'6px 0' }}>
                    <input type="checkbox" checked={!!newRoleForm[key]} onChange={e => setNRF(f => ({...f, [key]: e.target.checked}))} style={{ width:15, height:15, accentColor:'var(--blue)', cursor:'pointer' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button style={S.btnP} onClick={createRole}>Create Role</button>
              <button style={S.btnG} onClick={() => setNewRole(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
