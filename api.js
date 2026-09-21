import { SUPABASE_URL, SUPABASE_KEY, TOKEN_KEY } from './config.js';

export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const headers = () => ({
  'apikey': SUPABASE_KEY,
  'Content-Type': 'application/json'
});

export const rpc = async (fn, args = {}) => {
  let res, body;
  try {
    const h = headers();
    const token = getToken();
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }

    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', 
      headers: h, 
      body: JSON.stringify(args)
    });
  } catch {
    throw new Error('No connection. Check your internet.');
  }
  
  try { body = await res.json(); } catch { body = null; }
  
  if (!res.ok) {
    const err = new Error(readError(body, res.status));
    err.expired = /session expired/i.test(err.message);
    err.blocked = /blocked/i.test(err.message);
    throw err;
  }

  return body;
};

export const rpcAuth = async (fn, args = {}) => {
  let res, body;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', 
      headers: headers(), 
      body: JSON.stringify(args)
    });
  } catch {
    throw new Error('No connection. Check your internet.');
  }
  
  try { body = await res.json(); } catch { body = null; }
  
  if (!res.ok) {
    const err = new Error(readError(body, res.status));
    err.expired = /session expired/i.test(err.message);
    err.blocked = /blocked/i.test(err.message);
    throw err;
  }

  return body;
};

function readError(payload, status) {
  const raw = payload?.message || payload?.error_description || payload?.error;
  if (raw) return String(raw).replace(/^ERROR:\s*/i, '');
  return status === 0 ? 'No connection. Check your internet.' : 'Something went wrong. Try again.';
}
