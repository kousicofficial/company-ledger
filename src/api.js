import axios from 'axios';

/**
 * api.js — Centralized Axios instance for FinanceFlow PRO
 *
 * All API calls go through this single instance so that:
 *  - The base URL is defined in one place
 *  - Response/error interceptors apply globally
 *  - Future auth headers (e.g. Bearer tokens) can be injected here
 */
const api = axios.create({
  baseURL: "https://company-ledger-backend-1.onrender.com/api",
  headers: { 'Content-Type': 'application/json' },
  timeout: 12000,        // 12-second timeout for slow connections
});

/* ─── Response Interceptor ─────────────────────────────────
 * Normalises error messages so callers always get a plain string.
 * ─────────────────────────────────────────────────────────── */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

/* ─── Company API helpers ──────────────────────────────────
 * Thin wrappers so App.jsx never constructs raw URLs.
 * ─────────────────────────────────────────────────────────── */
export const companyApi = {
  /** GET  /companies?page=1&limit=100 */
  getAll: (params = {}) => api.get('/companies', { params }),

  /** GET  /companies/:id */
  getById: (id) => api.get(`/companies/${id}`),

  /** POST /companies */
  create: (data) => api.post('/companies', data),

  /** PUT  /companies/:id */
  update: (id, data) => api.put(`/companies/${id}`, data),

  /** DELETE /companies/:id */
  remove: (id) => api.delete(`/companies/${id}`),
};

export default api;
