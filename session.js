/* Tunanepal — session and player state. */

import { rpcAuth, getToken, clearToken } from './api.js';
import { $, esc, money, initials, applyTheme, toast } from './ui.js';

export const state = { player: null, unread: 0, ads: [] };

const listeners = new Set();
export const onPlayerChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const announce = () => { for (const fn of listeners) { try { fn(state.player); } catch {} } };

/* ─────────────────────────────────────────────────────────── top bar ── */
export function paintChrome() {
  const p = state.player;
  if (!p) return;

  $('#barName').textContent = p.name;
  $('#barPhone').textContent = p.phone;
  $('#barPoints').textContent = money(p.points);

  const av = $('#barAvatar');
  av.innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(p.name));

  const dot = $('#bellDot');
  dot.hidden = !state.unread;
  dot.textContent = state.unread > 9 ? '9+' : String(state.unread);

  announce();
}

export async function refreshMe() {
  const data = await rpcAuth('tuna_me');
  state.player = data.player;
  state.unread = data.unread || 0;
  state.ads = data.ads || [];
  if (state.player.theme) applyTheme(state.player.theme);
  paintChrome();
  return state.player;
}

export async function signOut() {
  try { await rpcAuth('tuna_logout'); } catch {}
  clearToken();
  state.player = null;
  location.reload();
}

/** Resumes a stored session on load. Returns false if there is nothing to resume. */
export async function resume() {
  if (!getToken()) return false;
  try { await refreshMe(); return true; }
  catch (e) {
    clearToken();
    if (e.blocked) toast(e.message, 'bad');
    return false;
  }
}
