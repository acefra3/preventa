import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Inyectar token JWT automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Manejar 401 → redirigir a login
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bt_token');
      localStorage.removeItem('bt_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  requestRecovery: (email: string) =>
    api.post('/auth/recovery', { email }).then(r => r.data),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }).then(r => r.data),
  getMe: () =>
    api.get('/auth/me').then(r => r.data),
};

// ─── Proposals ────────────────────────────────────────────
export const proposalsApi = {
  getAll: (params?: Record<string, string>) =>
    api.get('/proposals', { params }).then(r => r.data),
  getOne: (id: string) =>
    api.get(`/proposals/${id}`).then(r => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/proposals', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/proposals/${id}`, data).then(r => r.data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/proposals/${id}/status`, { status }).then(r => r.data),
};

// ─── Documents ────────────────────────────────────────────
export const documentsApi = {
  getByProposal: (proposalId: string) =>
    api.get(`/documents/proposal/${proposalId}`).then(r => r.data),
  uploadFile: (proposalId: string, file: File, meta: Record<string, unknown>) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(meta).forEach(([k, v]) => form.append(k, String(v)));
    return api.post(`/documents/upload/${proposalId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  addLink: (proposalId: string, data: Record<string, unknown>) =>
    api.post(`/documents/link/${proposalId}`, data).then(r => r.data),
  getDownloadUrl: (docId: string) =>
    api.get(`/documents/${docId}/download`).then(r => r.data),
};

// ─── Revisions ────────────────────────────────────────────
export const revisionsApi = {
  getByProposal: (proposalId: string) =>
    api.get(`/revisions/proposal/${proposalId}`).then(r => r.data),
  request: (proposalId: string, notes: string) =>
    api.post(`/revisions/${proposalId}`, { notes }).then(r => r.data),
  respond: (revisionId: string, adjustDeadline: string, preventaNote?: string) =>
    api.patch(`/revisions/${revisionId}/respond`, { adjustDeadline, preventaNote }).then(r => r.data),
  close: (revisionId: string) =>
    api.patch(`/revisions/${revisionId}/close`).then(r => r.data),
};

// ─── Users ────────────────────────────────────────────────
export const usersApi = {
  getAll: () => api.get('/users').then(r => r.data),
  getPreventa: () => api.get('/users/preventa').then(r => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/users/${id}`, data).then(r => r.data),
};

// ─── Dashboard ────────────────────────────────────────────
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats').then(r => r.data),
};

// ─── Notifications ────────────────────────────────────────
export const notificationsApi = {
  getAll: () => api.get('/notifications').then(r => r.data),
  markAllRead: () => api.patch('/notifications/read-all').then(r => r.data),
};

export default api;
