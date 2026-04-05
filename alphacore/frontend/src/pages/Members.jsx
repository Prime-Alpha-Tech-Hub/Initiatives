import { useState, useEffect } from 'react';
import { accountsApi } from '../utils/api';

const S = {
  card:  { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.4)' },
  btnP:  { background:'var(--blue)', color:'#fff', padding:'7px 16px', borderRadius:6, fontWeight:600, fontSize:12, cursor:'pointer', border:'none', whiteSpace:'nowrap' },
  btnG:  { background:'var(--surface2)', color:'var(--muted)', border:'1px solid var(--border)', padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer' },
  btnD:  { background:'rgba(255,77,106,0.1)', color:'var(--red)', border:'1px solid rgba(255,77,106,0.3)', padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer' },
  tag:   (c='var(--blue)') => ({ display:'inline-flex', alignItems:'center', background:`${c}18`, color:c, border:`1px solid ${c}33`, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' }),
  lbl:   { display:'block', fontSize:11, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--muted)', marginBottom:6, fontWeight:600 },
  input: { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', outline:'none', fontFamily:'inherit' },
};

const ROLE_COLORS = { owner:'var(--gold)', admin:'var(--blue)', pm:'var(--green)', analyst:'#a78bfa', viewer:'var(--muted)' };

const PERM_LABELS = [
  ['can_view_deals',       'View Deals'],
  ['can_create_deals',     'Create Deals'],
  ['can_edit_deals',       'Edit Deals'],
  ['can_delete_deals',     'Delete Deals'],
  ['can_edit_dd',          'Edit Due Diligence'],
  ['can_create_memos',     'Create IC Memos'],
  ['can_vote_ic',          'Vote on IC Committee'],
  ['can_decide_ic',        'Final IC Decision'],
  ['can_view_portfolio',   'View Portfolio'],
  ['can_edit_portfolio',   'Edit Portfolio'],
  ['can_upload_documents', 'Upload Documents'],
  ['can_delete_documents', 'Delete Documents'],
  ['can_manage_members',   'Manage Members'],
  ['can_manage_company',   'Manage Company Settings'],
];

function Spin() {
  return <div style={{ width:24,height:24,border:'3px solid var(--border)',borderTop:'3px solid var(--blue)',borderRadius:'50%',animation:'spin 0.7s linear infinite' }} />;
}

export default function MembersPage({ membership, toast }) {
  const [tab,setTab]           = useState('members');
  const [members,setMembers]   = useState([]);
  const [requests,setRequests] = useState([]);
  const [roles,setRoles]       = useState([]);
  const [pending,setPending]   = useState(0);
  const [loading,setLoading]   = useState(true);
  const [roleEdit,setRoleEdit] = useState(null);
  const [newRole,setNewRole]   = useState(false);
  const [nrf,setNrf]           = useState({
    label:'',can_view_deals:true,can_create_deals:false,can_edit_deals:false,
    can_edit_dd:false,can_create_memos:false,can_vote_ic:false,can_decide_ic:false,
    can_view_portfolio:true,can_edit_portfolio:false,can_upload_documents:false,
    can_delete_documents:false,can_manage_members:false,can_manage_company:false,
  });

  // Robust role name extraction regardless of membership shape
  const rn = membership?.role_name
    || membership?.role?.name
    || (typeof membership?.role==='string' ? membership.role : '')
    || '';
  const isOwner   = membership?.is_owner  === true || rn==='owner';
  const isAdmin   = membership?.is_admin  === true || rn==='owner' || rn==='admin';
  const canManage = isAdmin
    || membership?.can_approve_members===true
    || membership?.permissions?.can_manage_members===true;

  const load = () => {
    setLoading(true);
    Promise.all([
      accountsApi.getMembers(),
      accountsApi.getRoles(),
      canManage ? accountsApi.getPendingRequests() : Promise.resolve({data:[]}),
      canManage ? accountsApi.pendingCount()       : Promise.resolve({data:{count:0}}),
    ]).then(([m,r,req,cnt]) => {
      setMembers(m.data.results   || m.data   || []);
      setRoles(  r.data.results   || r.data   || []);
      setRequests(req.data.results|| req.data || []);
      setPending(cnt.data.count   || 0);
      setLoading(false);
    }).catch(()=>setLoading(false));
  };

  useEffect(()=>{ load(); },[]);

  const approve = async(req,role='analyst')=>{
    try{ await accountsApi.approveRequest(req.id,role); toast('Member approved.'); load(); }
    catch{ toast('Failed to approve.','error'); }
  };
  const reject = async(req)=>{
    try{ await accountsApi.rejectRequest(req.id,''); toast('Request rejected.'); load(); }
    catch{ toast('Failed.','error'); }
  };
  const changeRole = async(mid,rid)=>{
    try{ await accountsApi.changeRole(mid,rid); toast('Role updated.'); setRoleEdit(null); load(); }
    catch{ toast('Failed.','error'); }
  };
  const delegate = async(mid,can)=>{
    try{ await accountsApi.delegateApproval(mid,can); toast(can?'Approval granted.':' Approval revoked.'); load(); }
    catch{ toast('Failed.','error'); }
  };
  const remove = async(mid)=>{
    if(!confirm('Remove this member?')) return;
    try{ await accountsApi.removeMember(mid); toast('Member removed.'); load(); }
    catch{ toast('Failed.','error'); }
  };
  const createRole = async()=>{
    if(!nrf.label.trim()){ toast('Name required','error'); return; }
    const name=nrf.label.toLowerCase().replace(/[^a-z0-9]/g,'_');
    try{ await accountsApi.createRole({...nrf,name}); toast('Role created.'); setNewRole(false); load(); }
    catch{ toast('Failed.','error'); }
  };

  // IC committee = members whose role has can_vote_ic or can_decide_ic, plus owners/admins
  const icMembers = members.filter(m=>{
    const mrn=m.role_name||m.role?.name||'';
    return mrn==='owner'||mrn==='admin'||m.role?.can_vote_ic||m.role?.can_decide_ic;
  });

  const tabs=[
    {key:'members',label:'Members'},
    canManage?{key:'requests',label:`Pending Requests${pending?` (${pending})`:'\`}`}:null,
    {key:'ic',label:'IC Committee'},
    {key:'roles',label:'Roles & Permissions'},
  ].filter(Boolean);

  const Tag=({c,children})=><span style={S.tag(c)}>{children}</span>;
  const mem_name = m=>m.user_name||m.user?.full_name||m.user?.username||'—';
  const mem_email= m=>m.user_email||m.user?.email||'—';
  const mem_rname= m=>m.role_name||m.role?.name||'';
  const mem_rlabel=m=>m.role_label||m.role?.label||mem_rname(m)||'—';

  return(
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,letterSpacing:'-.4px',marginBottom:4}}>Team & Access</h1>
          <p style={{color:'var(--muted)',fontSize:13}}>
            {members.length} member{members.length!==1?'s':''}{isAdmin&&pending>0&&` · ${pending} pending request${pending!==1?'s':''}`}
          </p>
        </div>
        {isOwner&&<button style={S.btnP} onClick={()=>setNewRole(true)}>+ New Role</button>}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',marginBottom:24,borderBottom:'2px solid var(--border)'}}>
        {tabs.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:'9px 18px',fontSize:13,fontWeight:tab===t.key?600:400,
            color:tab===t.key?'var(--blue)':' var(--muted)',
            background:'none',border:'none',cursor:'pointer',
            borderBottom:tab===t.key?'2px solid var(--blue)':' 2px solid transparent',
            marginBottom:-2,transition:'all .12s'
          }}>{t.label}</button>
        ))}
      </div>

      {loading?<div style={{display:'flex',justifyContent:'center',padding:60}}><Spin/></div>:(
        <>
          {/* ── MEMBERS ── */}
          {tab==='members'&&(
            <div style={S.card}>
              {!members.length?(
                <div style={{textAlign:'center',padding:'48px 24px',color:'var(--muted)'}}>No members yet.</div>
              ):(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                    {['Member','Role','Can Approve','Joined',canManage?'Actions':null].filter(Boolean).map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'8px 14px',fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em'}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {members.map(m=>(
                      <tr key={m.id} style={{borderBottom:'1px solid var(--border)',transition:'background .1s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='none'}>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{fontWeight:600,fontSize:13}}>{mem_name(m)}</div>
                          <div style={{fontSize:11,color:'var(--muted)'}}>{mem_email(m)}</div>
                        </td>
                        <td style={{padding:'12px 14px'}}>
                          <Tag c={ROLE_COLORS[mem_rname(m)]||'var(--muted)'}>{mem_rlabel(m)}</Tag>
                        </td>
                        <td style={{padding:'12px 14px',fontSize:12,color:m.can_approve_members?'var(--green)':' var(--muted)'}}>
                          {m.can_approve_members?'✓ Yes':'—'}
                        </td>
                        <td style={{padding:'12px 14px',fontSize:12,color:'var(--muted)'}}>
                          {m.joined_at?new Date(m.joined_at).toLocaleDateString('en-GB'):'—'}
                        </td>
                        {canManage&&(
                          <td style={{padding:'12px 14px'}}>
                            {mem_rname(m)!=='owner'&&(
                              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                                <button style={S.btnG} onClick={()=>setRoleEdit(m)}>Change role</button>
                                {isOwner&&(
                                  <button style={{...S.btnG,fontSize:11}} onClick={()=>delegate(m.id,!m.can_approve_members)}>
                                    {m.can_approve_members?'Revoke approval':'Grant approval'}
                                  </button>
                                )}
                                <button style={S.btnD} onClick={()=>remove(m.id)}>Remove</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── PENDING REQUESTS ── */}
          {tab==='requests'&&canManage&&(
            <div>
              {!requests.length?(
                <div style={{...S.card,textAlign:'center',padding:'48px 24px',color:'var(--muted)'}}>
                  <div style={{fontSize:24,opacity:.2,marginBottom:12}}>⊞</div>
                  <div style={{fontWeight:600,marginBottom:6}}>No pending requests</div>
                  <div style={{fontSize:12}}>New join requests will appear here for review</div>
                </div>
              ):requests.map(req=>(
                <div key={req.id} style={{...S.card,marginBottom:12,borderLeft:'3px solid var(--amber)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{req.user?.full_name||req.user?.username||'—'}</div>
                      <div style={{fontSize:13,color:'var(--muted)',marginBottom:req.message?8:0}}>{req.user?.email||'—'}</div>
                      {req.message&&(
                        <div style={{fontSize:13,color:'var(--muted)',background:'var(--surface2)',padding:'8px 12px',borderRadius:6,maxWidth:480,fontStyle:'italic',borderLeft:'2px solid var(--border)'}}>
                          &ldquo;{req.message}&rdquo;
                        </div>
                      )}
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:8}}>
                        Requested {new Date(req.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                      <select id={`role-${req.id}`} defaultValue="analyst"
                        style={{...S.input,width:'auto',padding:'6px 10px',fontSize:12}}>
                        {roles.filter(r=>r.name!=='owner').map(r=>(
                          <option key={r.id} value={r.name}>{r.label}</option>
                        ))}
                      </select>
                      <button style={S.btnP} onClick={()=>{
                        const sel=document.getElementById(`role-${req.id}`);
                        approve(req,sel?.value||'analyst');
                      }}>Approve</button>
                      <button style={S.btnD} onClick={()=>reject(req)}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── IC COMMITTEE ── */}
          {tab==='ic'&&(
            <div>
              <div style={{...S.card,marginBottom:16,background:'rgba(201,168,76,.04)',border:'1px solid rgba(201,168,76,.2)'}}>
                <p style={{fontSize:13,color:'var(--muted)',lineHeight:1.75,margin:0}}>
                  The <strong style={{color:'var(--gold)'}}>Investment Committee</strong> consists of members with voting rights on IC memos.
                  Owners and admins are included by default. Grant <em>Vote on IC Committee</em> permission via a role to add others.
                </p>
              </div>
              {!icMembers.length?(
                <div style={{...S.card,textAlign:'center',padding:'48px 24px',color:'var(--muted)'}}>
                  <div style={{fontSize:24,opacity:.2,marginBottom:12}}>⊞</div>
                  <div style={{fontWeight:600,marginBottom:6}}>No IC members configured</div>
                  <div style={{fontSize:12}}>Grant <em>Vote on IC Committee</em> to a role under Roles &amp; Permissions</div>
                </div>
              ):(
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
                  {icMembers.map(m=>{
                    const mrn=mem_rname(m);
                    const canDecide=m.role?.can_decide_ic||mrn==='owner';
                    return(
                      <div key={m.id} style={{...S.card,padding:'14px 16px',borderLeft:`3px solid ${ROLE_COLORS[mrn]||'var(--border)'}`}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                          <div style={{width:38,height:38,borderRadius:'50%',background:ROLE_COLORS[mrn]||'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#000',flexShrink:0}}>
                            {mem_name(m).split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
                          </div>
                          <div style={{minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:13,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mem_name(m)}</div>
                            <div style={{fontSize:11,color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{mem_email(m)}</div>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          <Tag c={ROLE_COLORS[mrn]||'var(--muted)'}>{mem_rlabel(m)}</Tag>
                          <Tag c="var(--green)">✓ Can vote</Tag>
                          {canDecide&&<Tag c="var(--gold)">Final decision</Tag>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {canManage&&(
                <div style={{...S.card,marginTop:20,background:'var(--surface2)'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Add to IC Committee</div>
                  <p style={{fontSize:12,color:'var(--muted)',lineHeight:1.7,margin:0}}>
                    Go to <strong>Roles &amp; Permissions</strong> and enable <em>&ldquo;Vote on IC Committee&rdquo;</em> on a role.
                    Or use <strong>Change Role</strong> in Members to assign a role that already includes voting rights.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── ROLES & PERMISSIONS ── */}
          {tab==='roles'&&(
            <div style={{display:'grid',gap:14}}>
              {!roles.length?(
                <div style={{...S.card,textAlign:'center',padding:'48px 24px',color:'var(--muted)'}}>
                  <div style={{fontSize:24,opacity:.2,marginBottom:12}}>◧</div>
                  <div style={{fontWeight:600,marginBottom:6}}>No roles loaded</div>
                  <div style={{fontSize:12}}>Check your API connection</div>
                </div>
              ):roles.map(role=>(
                <div key={role.id} style={{...S.card,borderLeft:`3px solid ${ROLE_COLORS[role.name]||'var(--border)'}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:16,marginBottom:2}}>{role.label}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{role.member_count??'?'} member{role.member_count!==1?'s':''} · {role.is_builtin?'Built-in role':'Custom role'}</div>
                    </div>
                    <Tag c={ROLE_COLORS[role.name]||'var(--muted)'}>{role.name}</Tag>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {PERM_LABELS.map(([key,label])=>(
                      <span key={key} style={{fontSize:11,padding:'3px 9px',borderRadius:4,
                        background:role[key]?'rgba(34,211,160,.08)':' var(--surface2)',
                        color:role[key]?'var(--green)':'var(--muted)',
                        border:`1px solid ${role[key]?'rgba(34,211,160,.25)':'var(--border)'}`}}>
                        {role[key]?'✓':'✗'} {label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Change role modal */}
      {roleEdit&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setRoleEdit(null)}>
          <div style={{...S.card,maxWidth:380,width:'90%',padding:24}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontWeight:700,fontSize:16,marginBottom:4}}>Change Role</h3>
            <p style={{color:'var(--muted)',fontSize:13,marginBottom:18}}>For <strong>{mem_name(roleEdit)}</strong></p>
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18}}>
              {roles.filter(r=>r.name!=='owner').map(r=>{
                const cur=mem_rname(roleEdit)===r.name||roleEdit.role?.name===r.name||roleEdit.role?.id===r.id;
                return(
                  <button key={r.id} onClick={()=>changeRole(roleEdit.id,r.id)}
                    style={{textAlign:'left',padding:'10px 14px',borderRadius:8,cursor:'pointer',
                      border:`1.5px solid ${cur?'var(--blue)':'var(--border)'}`,
                      background:cur?'var(--blue-dim)':'var(--surface2)',transition:'all .12s'}}>
                    <div style={{fontWeight:600,fontSize:13,color:cur?'var(--blue)':'var(--text)',marginBottom:2}}>{r.label}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{PERM_LABELS.filter(([k])=>r[k]).map(([,l])=>l).slice(0,3).join(' · ')}{PERM_LABELS.filter(([k])=>r[k]).length>3?'…':''}</div>
                  </button>
                );
              })}
            </div>
            <button style={S.btnG} onClick={()=>setRoleEdit(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* New role modal */}
      {newRole&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setNewRole(false)}>
          <div style={{...S.card,maxWidth:580,width:'100%',maxHeight:'90vh',overflowY:'auto',padding:28}} onClick={e=>e.stopPropagation()}>
            <h3 style={{fontWeight:700,fontSize:17,marginBottom:18}}>Create Custom Role</h3>
            <div style={{marginBottom:14}}>
              <label style={S.lbl}>Role name *</label>
              <input value={nrf.label} onChange={e=>setNrf(f=>({...f,label:e.target.value}))} placeholder="e.g. Senior Analyst" style={S.input}/>
            </div>
            <label style={S.lbl}>Permissions</label>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:18}}>
              {PERM_LABELS.map(([key,label])=>(
                <label key={key} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
                  <input type="checkbox" checked={!!nrf[key]} onChange={e=>setNrf(f=>({...f,[key]:e.target.checked}))} style={{width:15,height:15,accentColor:'var(--blue)',cursor:'pointer'}}/>
                  {label}
                </label>
              ))}
            </div>
            <div style={{display:'flex',gap:10}}>
              <button style={S.btnP} onClick={createRole}>Create Role</button>
              <button style={S.btnG} onClick={()=>setNewRole(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
