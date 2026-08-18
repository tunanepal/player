/* Tunanepal — session and player state. */

import { rpc, rpcAuth, getToken, setToken, clearToken } from './api.js';
import { $, esc, money, initials, applyTheme, savedTheme, toast, showError, clearError, busy } from './ui.js';

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

/* ───────────────────────────────────────────────────────────── sign in ── */
export function initGate({ onSignedIn }) {
  const form = $('#loginForm');
  const err = $('#gateErr');
  const pwWrap = $('#gatePassword');

  /* Ask for a password only once we know the account has one. Numbers that
     never set one keep signing in with just their name. */
  let checkedPhone = null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(err);
    const btn = $('#loginBtn');

    const phone = $('#inPhone').value;
    const name = $('#inName').value;
    const password = pwWrap.hidden ? null : $('#inPassword').value;

    try {
      const out = await busy(btn, 'Checking…', () =>
        rpc('tuna_login', { p_phone: phone, p_name: name, p_password: password }));
      setToken(out.token);
      state.player = out.player;
      applyTheme(out.player.theme || savedTheme());
      toast(out.created
        ? `Welcome to Tunanepal, ${out.player.name.split(' ')[0]}.`
        : `Welcome back, ${out.player.name.split(' ')[0]}.`, 'good');
      await onSignedIn();
    } catch (ex) {
      /* The account has a password set — reveal the field and let them retry. */
      if (/wrong password/i.test(ex.message) && pwWrap.hidden) {
        pwWrap.hidden = false;
        checkedPhone = phone;
        showError(err, 'This number has a password. Enter it to continue.');
        $('#inPassword').focus();
        return;
      }
      showError(err, ex.message);
    }
  });

  $('#inPhone').addEventListener('input', () => {
    if (checkedPhone && $('#inPhone').value !== checkedPhone) {
      pwWrap.hidden = true;
      $('#inPassword').value = '';
    }
  });
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
