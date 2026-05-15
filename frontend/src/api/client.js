import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject Supabase JWT on every request
api.interceptors.request.use((config) => {
  try {
    const session = JSON.parse(localStorage.getItem('tafdil-erp-session') || '{}');
    const token = session?.access_token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Uniform error shape
api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    const data = err.response?.data;
    const message =
      data?.message ||
      (Array.isArray(data?.errors) && data.errors.map(e => `${e.path}: ${e.msg}`).join(', ')) ||
      err.message ||
      'Erreur réseau';
    console.error('[API]', err.response?.status, err.config?.url, data);
    return Promise.reject(new Error(message));
  }
);

export default api;
