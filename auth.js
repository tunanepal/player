/* Tunanepal — sign in, register, forgot password.
   Three flows share one screen. Register and reset both run:
   phone → 6-digit code → set details. */

import { rpc, setToken } from './api.js';
import { $, $$, toast, busy, showError, clearError, applyTheme, savedTheme, onTick } from './ui.js';

let mode = 'login';          // login | register | forgot
let step = 'phone';          // phone | code | finish
let ticket = null;
let phone = '';
let resendAt = 0;
let stopTick = null;
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
  mode = next; step = 'phone'; ticket = null;
  clearError($('#gateErr'));
  render();
}

/* ────────────────────────────────────────────────────────────── rendering ── */
function render() {
  const titles = {
    login:    ['Sign in', 'Your number and password.'],
    register: ['Create account', 'Your number becomes your player ID.'],
    forgot:   ['Reset password', 'Enter your number and pick a new password.']
  };
  const [title, sub] = titles[mode];
  $('#gateTitle').textContent = title;
  $('#gateSub').textContent = step === 'phone' ? sub
    : step === 'code' ? `Enter the 6-digit code sent to ${phone}.`
    : 'Choose a new password.';

  $('#gateBody').innerHTML = step === 'phone' ? phoneStep()
    : step === 'code' ? codeStep()
    : finishStep();

  $('#gateSwitch').innerHTML = switcher();

  if (step === 'code') wireCode();
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
    ${mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Continue'}
  </button>`;

const codeStep = () => `
  <label class="field">
    <span class="label">6-digit code</span>
    <input id="fCode" class="mono otp" type="text" inputmode="numeric"
           autocomplete="one-time-code" placeholder="––––––" maxlength="6">
  </label>
  <div id="devCode"></div>
  <button class="btn" type="submit" id="gateGo">Verify code</button>
  <button class="btn btn--ghost" type="button" id="fResend" style="margin-top:8px">Resend code</button>
  <button class="btn btn--ghost" type="button" id="fBack" style="margin-top:8px">Change number</button>`;

const finishStep = () => `
  ${mode === 'register' ? `
  <label class="field">
    <span class="label">Full name</span>
    <input id="fName" type="text" autocomplete="name" placeholder="Your name" maxlength="40">
  </label>` : ''}
  <label class="field">
    <span class="label">${mode === 'register' ? 'Create a password' : 'New password'}</span>
    <input id="fPass1" type="password" autocomplete="new-password" placeholder="At least 6 characters">
  </label>
  <label class="field">
    <span class="label">Repeat password</span>
    <input id="fPass2" type="password" autocomplete="new-password" placeholder="Type it again">
  </label>
  <button class="btn" type="submit" id="gateGo">
    ${mode === 'register' ? 'Create account' : 'Save password'}
  </button>`;

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

/* ───────────────────────────────────────────────────── code step wiring ── */
function wireCode() {
  const input = $('#fCode');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) submit();
  });

  $('#fBack').addEventListener('click', () => { step = 'phone'; render(); });
  $('#fResend').addEventListener('click', (e) => sendCode(e.currentTarget, true));

  if (stopTick) stopTick();
  stopTick = onTick(() => {
    const btn = $('#fResend');
    if (!btn) { stopTick(); stopTick = null; return; }
    const left = Math.ceil((resendAt - Date.now()) / 1000);
    if (left > 0) { btn.disabled = true; btn.textContent = `Resend in ${left}s`; }
    else { btn.disabled = false; btn.textContent = 'Resend code'; }
  });
}

/* ─────────────────────────────────────────────────────────────── actions ── */
function submit() {
  const btn = $('#gateGo');
  if (!btn || btn.disabled) return;
  if (step === 'phone' && mode === 'login') return signIn(btn);
  if (step === 'phone' && mode === 'register') return doRegister(btn);
  if (step === 'phone') return sendCode(btn, false);
  if (step === 'code') return verify(btn);
  return finish(btn);
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

async function sendCode(btn, isResend) {
  const err = $('#gateErr'); clearError(err);
  const raw = isResend ? phone : $('#fPhone').value;
  try {
    const out = await busy(btn, 'Sending…', () =>
      rpc('tuna_otp_request', {
        p_phone: raw,
        p_purpose: mode === 'register' ? 'register' : 'reset'
      }));
    phone = out.phone;
    resendAt = Date.now() + (out.resend_in || 60) * 1000;
    step = 'code';
    render();

    /* Dev mode: no SMS gateway wired up yet, so the code comes back here. */
    if (out.dev_code) {
      $('#devCode').innerHTML =
        `<div class="alert alert--info">Testing mode — your code is
         <b class="mono" style="font-size:17px">${out.dev_code}</b>.
         Once an SMS gateway is connected this arrives by text instead.</div>`;
    } else {
      toast(`Code sent to ${phone}.`, 'good');
    }
  } catch (e) { showError($('#gateErr'), e.message); }
}

async function verify(btn) {
  const err = $('#gateErr'); clearError(err);
  const code = $('#fCode').value.trim();
  if (code.length !== 6) return showError(err, 'Enter all six digits.');
  try {
    const out = await busy(btn, 'Checking…', () =>
      rpc('tuna_otp_verify', {
        p_phone: phone, p_code: code,
        p_purpose: mode === 'register' ? 'register' : 'reset'
      }));
    ticket = out.ticket;
    step = 'finish';
    render();
  } catch (e) { showError(err, e.message); }
}

async function finish(btn) {
  const err = $('#gateErr'); clearError(err);
  const p1 = $('#fPass1').value, p2 = $('#fPass2').value;
  if (p1.length < 6) return showError(err, 'Use a password of at least 6 characters.');
  if (p1 !== p2) return showError(err, 'The two passwords do not match.');

  try {
    const out = await busy(btn, 'Saving…', () => mode === 'register'
      ? rpc('tuna_register_complete', { p_ticket: ticket, p_name: $('#fName').value, p_password: p1 })
      : rpc('tuna_reset_complete', { p_ticket: ticket, p_password: p1 }));
    await land(out);
  } catch (e) { showError(err, e.message); }
}

async function land(out) {
  setToken(out.token);
  applyTheme(out.player.theme || savedTheme());
  if (stopTick) { stopTick(); stopTick = null; }
  toast(out.created
    ? `Welcome to Tunanepal, ${out.player.name.split(' ')[0]}.`
    : `Welcome back, ${out.player.name.split(' ')[0]}.`, 'good');
  await onDone();
}
