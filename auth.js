/* Tunanepal — sign in, register, forgot password.
   Three flows share one screen. Register and reset both run:
   phone → 6-digit code → set details. */

import { rpc, setToken } from './api.js';
import { $, esc, toast, busy, showError, clearError, applyTheme, savedTheme } from './ui.js';

let mode = 'login';          // login | register | forgot
let step = 'phone';          // phone | sent
let phone = '';
let onDone = null;

export function initAuth({ onSignedIn }) {
  onDone = onSignedIn;
  render();

  $('#gateForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });

  $('#gateSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    setMode(btn.dataset.mode);
  });
}

function setMode(next) {
  mode = next; step = 'phone';
  clearError($('#gateErr'));
  render();
}

/* ────────────────────────────────────────────────────────────── rendering ── */
function render() {
  const titles = {
    login:    ['Sign in', 'Your number and password.'],
    register: ['Create account', 'Your number becomes your player ID.'],
    forgot:   ['Forgot password', 'We will reset it for you by hand.']
  };
  const [title, sub] = titles[mode];
  $('#gateTitle').textContent = title;
  $('#gateSub').textContent = step === 'sent'
    ? 'Request received.' : sub;

  $('#gateBody').innerHTML = step === 'sent' ? sentStep() : phoneStep();

  $('#gateSwitch').innerHTML = switcher();

  const first = $('#gateBody').querySelector('input');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

const phoneStep = () => `
  <label class="field">
    <span class="label">Mobile number</span>
    <input id="fPhone" class="mono" type="tel" inputmode="numeric" autocomplete="tel"
           placeholder="98XXXXXXXX" maxlength="14" value="${phone}">
    ${mode === 'register' ? '<span class="hint">This becomes your player ID. It cannot be changed later.</span>' : ''}
  </label>
  ${mode === 'login' ? `
  <label class="field">
    <span class="label">Password</span>
    <input id="fPass" type="password" autocomplete="current-password" placeholder="Your password">
  </label>` : ''}
  ${mode === 'forgot' ? `
  <label class="field">
    <span class="label">Message for support (optional)</span>
    <textarea id="fNote" maxlength="200" placeholder="Anything that helps us find your account"></textarea>
  </label>` : ''}
  ${mode === 'register' ? `
  <label class="field">
    <span class="label">Full name</span>
    <input id="fName" type="text" autocomplete="name" placeholder="Your name" maxlength="40">
  </label>
  <label class="field">
    <span class="label">Create a password</span>
    <input id="fPass1" type="password" autocomplete="new-password" placeholder="At least 6 characters">
  </label>
  <label class="field">
    <span class="label">Repeat password</span>
    <input id="fPass2" type="password" autocomplete="new-password" placeholder="Type it again">
  </label>` : ''}
  <button class="btn" type="submit" id="gateGo">
    ${mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset request'}
  </button>`;

const sentStep = () => `
  <div class="alert alert--good">
    Request sent for <b class="mono">${esc(phone)}</b>.
  </div>
  <p class="small" style="margin-bottom:14px">
    Support will set a new password for your account and pass it to you.
    Once you are back in, change it from Settings.
  </p>
  <button class="btn btn--ghost" type="button" id="fBackLogin">Back to sign in</button>`;

function switcher() {
  if (step !== 'phone') return '';
  if (mode === 'login') return `
    <p class="xs muted center">
      New here? <button class="linkbtn" data-mode="register">Create an account</button>
      &nbsp;·&nbsp;
      <button class="linkbtn" data-mode="forgot">Forgot password</button>
    </p>`;
  return `<p class="xs muted center">
      Already registered? <button class="linkbtn" data-mode="login">Sign in</button>
    </p>`;
}

/* ─────────────────────────────────────────────────────────────── actions ── */
function submit() {
  const btn = $('#gateGo');
  if (!btn || btn.disabled) return;
  if (mode === 'login') return signIn(btn);
  if (mode === 'register') return doRegister(btn);
  return askReset(btn);
}

async function signIn(btn) {
  const err = $('#gateErr'); clearError(err);
  try {
    const out = await busy(btn, 'Checking…', () =>
      rpc('tuna_login', { p_phone: $('#fPhone').value, p_password: $('#fPass').value }));
    await land(out);
  } catch (e) { showError(err, e.message); }
}

async function doRegister(btn) {
  const err = $('#gateErr'); clearError(err);
  const name = $('#fName').value.trim();
  const p1 = $('#fPass1').value, p2 = $('#fPass2').value;

  if (name.length < 3) return showError(err, 'Enter your full name, at least 3 characters.');
  if (p1.length < 6) return showError(err, 'Use a password of at least 6 characters.');
  if (p1 !== p2) return showError(err, 'The two passwords do not match.');

  try {
    const out = await busy(btn, 'Creating…', () =>
      rpc('tuna_register', { p_phone: $('#fPhone').value, p_name: name, p_password: p1 }));
    await land(out);
  } catch (e) { showError(err, e.message); }
}

async function askReset(btn) {
  const err = $('#gateErr'); clearError(err);
  try {
    const out = await busy(btn, 'Sending…', () => rpc('tuna_request_password_reset', {
      p_phone: $('#fPhone').value, p_note: $('#fNote')?.value || null
    }));
    phone = out.phone;
    step = 'sent';
    render();
    $('#fBackLogin').addEventListener('click', () => setMode('login'));
  } catch (e) { showError(err, e.message); }
}

async function land(out) {
  setToken(out.token);
  applyTheme(out.player.theme || savedTheme());
  toast(out.created
    ? `Welcome to Tunanepal, ${out.player.name.split(' ')[0]}.`
    : `Welcome back, ${out.player.name.split(' ')[0]}.`, 'good');
  await onDone();
}
