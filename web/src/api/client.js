import axios from 'axios';

export const TOKEN_KEY = 'po_sync_token';

const client = axios.create({ baseURL: '/api', timeout: 30000 });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErrorMessage(err) {
  return err?.response?.data?.error || err?.message || 'Something went wrong';
}

export default client;
