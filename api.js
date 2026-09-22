/* Tunanepal — thin Supabase client.
   Only two things are ever needed: call an RPC, and upload a file. Writing
   these by hand keeps the app free of a CDN dependency, so it still boots
   from the service-worker cache when the network is patchy. */

import { SUPABASE_URL, SUPABASE_KEY, TOKEN_KEY } from './config.js';

const headers = () => ({
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
});

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/** Postgres RAISE messages arrive as { message }. Surface them as-is —
 *  they are already written for players, not for developers. */
function readError(payload, status) {
  const raw = payload?.message || payload?.error_description || payload?.error;
  if (!raw) return status === 0 ? 'No connection. Check your internet.' : 'Something went wrong. Try again.';
  return String(raw).replace(/^ERROR:\s*/i, '');
}

export async function rpc(fn, args = {}) {
  let res, body;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(args)
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
}

/** Authenticated RPC — prepends the stored session token. */
export const rpcAuth = (fn, args = {}) => rpc(fn, { p_token: getToken(), ...args });

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov'
};

/** Uploads under a random name and returns the public URL. */
export async function upload(bucket, file) {
  const ext = EXT[file.type];
  if (!ext) throw new Error('Use a JPG, PNG or WebP image.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is too large. Keep it under 25 MB.');

  const path = `${crypto.randomUUID()}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'false'
    },
    body: file
  });
  if (!res.ok) {
    const b = await res.json().catch(() => null);
    throw new Error(readError(b, res.status) || 'Upload failed. Try again.');
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
