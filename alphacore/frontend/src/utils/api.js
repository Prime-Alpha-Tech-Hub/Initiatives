import axios from 'axios';

const api = axios.create({
  baseURL: '/alphacore',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-refresh on 401 — skip for auth endpoints to avoid loops
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    const isAuthEndpoint = original.url?.includes('/auth/login') ||
                           original.url?.includes('/auth/register') ||
                           original.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) throw new Error('No refresh token');
        const { data } = await axios.post('/api/accounts/auth/refresh/', { refresh });
        localStorage.setItem('access_token', data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Typed API helpers ─────────────────────────────────────────────────────────
export const authApi = {
  login:   (email, password) => api.post('/accounts/auth/login/', { username: email, password }),
  me:      ()                => api.get('/core/me/'),
};

export const dealsApi = {
  list:     (params) => api.get('/deals/', { params }),
  get:      (id)     => api.get(`/deals/${id}/`),
  create:   (data)   => api.post('/deals/', data),
  update:   (id, d)  => api.patch(`/deals/${id}/`, d),
  remove:   (id)     => api.delete(`/deals/${id}/`),
  advance:  (id, d)  => api.post(`/deals/${id}/advance_stage/`, d),
  addNote:  (id, d)  => api.post(`/deals/${id}/add_note/`, d),
  pipeline: ()       => api.get('/deals/pipeline_summary/'),
};

export const ddApi = {
  getChecklist: (dealId) => api.get('/diligence/checklists/', { params: { deal: dealId } }),
  createFromDeal: (dealId) => api.post('/diligence/checklists/create_from_deal/', { deal_id: dealId }),
  updateItem:   (id, d)  => api.patch(`/diligence/items/${id}/`, d),
  completeItem: (id)     => api.post(`/diligence/items/${id}/mark_complete/`),
  addFinding:   (data)   => api.post('/diligence/findings/', data),
};

export const committeeApi = {
  list:            (params) => api.get('/committee/memos/', { params }),
  get:             (id)     => api.get(`/committee/memos/${id}/`),
  create:          (data)   => api.post('/committee/memos/', data),
  update:          (id, d)  => api.patch(`/committee/memos/${id}/`, d),
  submit:          (id, d)  => api.post(`/committee/memos/${id}/submit/`, d),
  vote:            (id, d)  => api.post(`/committee/memos/${id}/cast_vote/`, d),
  decide:          (id, d)  => api.post(`/committee/memos/${id}/decide/`, d),
  requestRevision: (id, d)  => api.post(`/committee/memos/${id}/request_revision/`, d),
  addComment:      (id, d)  => api.post(`/committee/memos/${id}/add_comment/`, d),
  history:         (id)     => api.get(`/committee/memos/${id}/history/`),
  sendReminders:   (id)     => api.post(`/committee/memos/${id}/send_reminders/`),
  exportMemo:      (id)     => api.get(`/committee/memos/${id}/export/`),
};

export const portfolioApi = {
  list:        (params) => api.get('/portfolio/positions/', { params }),
  get:         (id)     => api.get(`/portfolio/positions/${id}/`),
  create:      (data)   => api.post('/portfolio/positions/', data),
  update:      (id, d)  => api.patch(`/portfolio/positions/${id}/`, d),
  summary:     ()       => api.get('/portfolio/positions/summary/'),
  addSnapshot: (id, d)  => api.post(`/portfolio/positions/${id}/add_snapshot/`, d),
  alerts:      (params) => api.get('/portfolio/alerts/', { params }),
  resolveAlert:(id)     => api.post(`/portfolio/alerts/${id}/resolve/`),
};

export const docsApi = {
  list:   (params) => api.get('/documents/', { params }),
  get:    (id)     => api.get(`/documents/${id}/`),
  upload: (formData) => api.post('/documents/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  remove: (id)     => api.delete(`/documents/${id}/`),
  stats:  ()       => api.get('/documents/repository_stats/'),
};

export const accountsApi = {
  register:       (data)     => api.post('/accounts/auth/register/', data),
  login:          (u, p)     => api.post('/accounts/auth/login/', { username: u, password: p }),
  me:             ()         => api.get('/accounts/auth/me/'),
  updateMe:       (data)     => api.patch('/accounts/auth/me/', data),

  // Onboarding
  createCompany:  (data)     => api.post('/accounts/onboarding/create-company/', data),
  requestJoin:    (data)     => api.post('/accounts/onboarding/request-join/', data),

  // Company
  searchCompanies:(q)        => api.get('/accounts/companies/search/', { params: { q } }),
  myCompany:      ()         => api.get('/accounts/companies/mine/'),
  updateCompany:  (id, data) => api.patch(`/accounts/companies/${id}/`, data),

  // Roles
  getRoles:       ()         => api.get('/accounts/roles/'),
  createRole:     (data)     => api.post('/accounts/roles/', data),
  updateRole:     (id, data) => api.patch(`/accounts/roles/${id}/`, data),
  deleteRole:     (id)       => api.delete(`/accounts/roles/${id}/`),

  // Members
  members:        ()         => api.get('/accounts/members/'),
  getMembers:     ()         => api.get('/accounts/members/'),
  changeRole:     (id, role_id) => api.post(`/accounts/members/${id}/change_role/`, { role_id }),
  delegateApproval: (id, can) => api.post(`/accounts/members/${id}/delegate_approval/`, { can_approve: can }),
  removeMember:   (id)       => api.post(`/accounts/members/${id}/remove_member/`),

  // Join requests
  getPendingRequests: ()     => api.get('/accounts/join-requests/'),
  pendingCount:   ()         => api.get('/accounts/join-requests/pending_count/'),
  approveRequest: (id, role) => api.post(`/accounts/join-requests/${id}/approve/`, { role }),
  rejectRequest:  (id, note) => api.post(`/accounts/join-requests/${id}/reject/`, { note }),
  myJoinStatus:   ()         => api.get('/accounts/join-requests/my_status/'),

  // Integration API keys
  listApiKeys:    ()         => api.get('/accounts/api-keys/'),
  createApiKey:   (data)     => api.post('/accounts/api-keys/create/', data),
  revokeApiKey:   (id)       => api.delete(`/accounts/api-keys/${id}/revoke/`),

  // Integration connections
  listIntegrations:  ()      => api.get('/accounts/integrations/'),
  saveIntegration:   (data)  => api.post('/accounts/integrations/save/', data),
  pingIntegration:   (id)    => api.post(`/accounts/integrations/${id}/ping/`),

  // Relinquish admin
  relinquishAdmin: (company_id) => api.post('/accounts/relinquish-admin/', { company_id }),
};

export const reportingApi = {
  // Recipients
  listRecipients:   ()      => api.get('/reporting/recipients/'),
  createRecipient:  (data)  => api.post('/reporting/recipients/', data),
  deleteRecipient:  (id)    => api.post(`/reporting/recipients/${id}/deactivate/`),
  // Reports
  listReports:      ()      => api.get('/reporting/reports/'),
  getReport:        (id)    => api.get(`/reporting/reports/${id}/`),
  generateReport:   (data)  => api.post('/reporting/reports/generate/', data),
  sendReport:       (id, d) => api.post(`/reporting/reports/${id}/send/`, d),
  retryFailed:      (id)    => api.post(`/reporting/reports/${id}/retry_failed/`),
  previewUrl:       (id)    => `/alphacore/api/reporting/reports/${id}/preview/`,
  exportPdf:        (id)    => api.post(`/reporting/reports/${id}/export_pdf/`),
  downloadPdfUrl:   (id)    => `/alphacore/api/reporting/reports/${id}/download_pdf/`,
};

export const knowledgeApi = {
  // Collections
  listCollections:  ()       => api.get('/knowledge/collections/'),
  createCollection: (data)   => api.post('/knowledge/collections/', data),
  updateCollection: (id, d)  => api.patch(`/knowledge/collections/${id}/`, d),
  deleteCollection: (id)     => api.delete(`/knowledge/collections/${id}/`),

  // Articles
  listArticles:    (params)  => api.get('/knowledge/articles/', { params }),
  getArticle:      (id)      => api.get(`/knowledge/articles/${id}/`),
  createArticle:   (data)    => api.post('/knowledge/articles/', data),
  updateArticle:   (id, d)   => api.patch(`/knowledge/articles/${id}/`, d),
  deleteArticle:   (id)      => api.delete(`/knowledge/articles/${id}/`),
  searchArticles:  (q, p)    => api.get('/knowledge/articles/search/', { params: { q, ...p } }),
  pinned:          ()        => api.get('/knowledge/articles/pinned/'),
  recent:          (n)       => api.get('/knowledge/articles/recent/', { params: { limit: n || 10 } }),
  togglePin:       (id)      => api.post(`/knowledge/articles/${id}/toggle_pin/`),
  recordView:      (id)      => api.post(`/knowledge/articles/${id}/view/`),
  addComment:      (id, d)   => api.post(`/knowledge/articles/${id}/add_comment/`, d),
  restoreVersion:  (id, vn)  => api.post(`/knowledge/articles/${id}/restore_version/`, { version_num: vn }),
};
