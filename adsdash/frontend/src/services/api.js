// ============================================================
// src/services/api.js — PTI Analytics (timeout corregido)
// ============================================================
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
  timeout: 15000, // 15 segundos — antes eran 10 minutos
});

// Interceptor: si la sesión expiró, redirigir al login
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  login:    (email, password) => api.post('/auth/login',    { email, password }),
  logout:   ()                => api.post('/auth/logout'),
  me:       ()                => api.get('/auth/me'),
};

// ── Clients ───────────────────────────────────────────────
export const clientsAPI = {
  list:   ()            => api.get('/clients'),
  get:    (id)          => api.get(`/clients/${id}`),
  create: (data)        => api.post('/clients', data),
  update: (id, data)    => api.put(`/clients/${id}`, data),
  delete: (id)          => api.delete(`/clients/${id}`),
};

// ── Dashboard ─────────────────────────────────────────────
export const dashboardAPI = {
  overview:       (clientId, start, end) =>
    api.get('/dashboard/overview',        { params: { clientId, start, end }, timeout: 20000 }),
  clientsSummary: (start, end) =>
    api.get('/dashboard/clients-summary', { params: { start, end }, timeout: 20000 }),
};

// ── Google Ads ────────────────────────────────────────────
export const googleAPI = {
  authUrl:    (clientId) => api.get('/google/auth-url', { params: { clientId } }),
  accounts:   (clientId) => api.get('/google/accounts', { params: { clientId } }),
  summary:    (clientId, start, end) => api.get('/google/summary',    { params: { clientId, start, end } }),
  campaigns:  (clientId, start, end) => api.get('/google/campaigns',  { params: { clientId, start, end } }),
  timeseries: (clientId, start, end) => api.get('/google/timeseries', { params: { clientId, start, end } }),
};

// ── Meta Ads ──────────────────────────────────────────────
export const metaAPI = {
  authUrl:    (clientId) => api.get('/meta/auth-url', { params: { clientId } }),
  accounts:   (clientId) => api.get('/meta/accounts', { params: { clientId } }),
  summary:    (clientId, start, end) => api.get('/meta/summary',    { params: { clientId, start, end } }),
  campaigns:  (clientId, start, end) => api.get('/meta/campaigns',  { params: { clientId, start, end } }),
  timeseries: (clientId, start, end) => api.get('/meta/timeseries', { params: { clientId, start, end } }),
  adsets:     (clientId, start, end, campaignId) => api.get('/meta/adsets', { params: { clientId, start, end, campaignId } }),
};

// ── Reports ───────────────────────────────────────────────
export const reportsAPI = {
  list:   (clientId) => api.get('/reports',      { params: { clientId } }),
  get:    (id)       => api.get(`/reports/${id}`),
  create: (data)     => api.post('/reports', data),
  update: (id, data) => api.put(`/reports/${id}`, data),
  delete: (id)       => api.delete(`/reports/${id}`),
  share:  (id, days) => api.post(`/reports/${id}/share`, { days }),
  exportCsv: (id)    => api.get(`/reports/${id}/export/csv`, { responseType: 'blob' }),
  exportPdf: (id)    => api.get(`/reports/${id}/export/pdf`, { responseType: 'blob', timeout: 30000 }),
};

export const adsAPI = {
  top: (clientId, params) => api.get(`/ads/top/${clientId}`, { params }),
};

export default api;
