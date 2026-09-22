/* Tunanepal — sign in, register, forgot password.
   Three flows share one screen. Register and reset both run:
   phone → 6-digit code → set details.

   Security notes (migrations 23–25):
   - tuna_login and tuna_register answer failures with { ok:false, error, ... }
     instead of an HTTP error, so their server-side counters commit.
   - locked_until  → account lockout   (23)
   - retry_at      → rate limit        (24)
   - captcha       → register captcha  (25) */

import { rpc, setToken } from './api.js';
import { $, esc, toast, busy, showError, clearError, applyTheme, savedTheme } from './ui.js';

let mode = 'login';          // login | register | forgot
let step = 'phone';          // phone | sent
let phone = '';
let onDone = null;

let holdTimer = null;        // countdown while sign-in is locked or rate limited
let captcha = null;          // { id, kind, prompt, options }
let capChoice = null;        // selected sign key
let capKind = null;          // 'maths' | 'sign' | null (server picks)

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
  stopHold();   // the button it was driving is about to be replaced

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

  if (mode === 'register' && step === 'phone') loadCaptcha();

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
  </label>
  <div class="field capbox" id="capBox"><span class="xs muted">Loading check…</span></div>` : ''}
  <button class="btn" type="submit" id="gateGo">${btnLabel()}</button>`;

const sentStep = () => `
  <div class="alert alert--good">
    Request sent for <b class="mono">${esc(phone)}</b>.
  </div>
  <p class="small" style="margin-bottom:14px">
    Support will set a new password for your account and pass it to you.
    Once you are back in, change it from Settings.
  </p>
  <button class="btn btn--ghost" type="button" id="fBackLogin">Back to sign in</button>`;

function btnLabel() {
  return mode === 'login' ? 'Sign in'
       : mode === 'register' ? 'Create account'
       : 'Send reset request';
}

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

/* ───────────────────────────────────────────────────── hold / countdown ── */
/* Shared by the lockout (locked_until) and the rate limiter (retry_at). */

function stopHold() {
  if (holdTimer) { clearInterval(holdTimer); holdTimer = null; }
}

function startHold(untilISO, word) {
  stopHold();

  const until = new Date(untilISO).getTime();
  if (!Number.isFinite(until)) return;

  const btn = $('#gateGo');
  if (!btn) return;

  const tick = () => {
    const left = until - Date.now();
    if (left <= 0) {
      stopHold();
      btn.disabled = false;
      btn.textContent = btnLabel();
      clearError($('#gateErr'));
      return;
    }
    const mins = Math.floor(left / 60000);
    const secs = Math.floor((left % 60000) / 1000);
    btn.disabled = true;
    btn.textContent = `${word} — ${mins}:${String(secs).padStart(2, '0')}`;
  };

  tick();
  holdTimer = setInterval(tick, 1000);
}

/* Reads the { ok:false } shape the server sends for lockout and rate limit. */
function handleGate(out, err) {
  showError(err, out.error);
  if (out.locked_until) startHold(out.locked_until, 'Locked');
  else if (out.retry_at) startHold(out.retry_at, 'Wait');
}

/* ─────────────────────────────────────────────────────────────── captcha ── */

const SIGNS = {
  stop: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <polygon points="21,3 43,3 61,21 61,43 43,61 21,61 3,43 3,21" fill="#c1121f"/>
    <text x="32" y="38" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">STOP</text></svg>`,

  no_entry: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="28" fill="#c1121f"/>
    <rect x="14" y="27" width="36" height="10" rx="2" fill="#fff"/></svg>`,

  give_way: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <polygon points="4,8 60,8 32,58" fill="#fff" stroke="#c1121f" stroke-width="7"
             stroke-linejoin="round"/></svg>`,

  speed_50: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="28" fill="#fff" stroke="#c1121f" stroke-width="7"/>
    <text x="32" y="41" text-anchor="middle" font-size="24" font-weight="700" fill="#111">50</text></svg>`,

  one_way: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="4" y="18" width="56" height="28" rx="3" fill="#1d4e89"/>
    <path d="M16 32h26M36 24l10 8-10 8" stroke="#fff" stroke-width="5"
          fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

  no_parking: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="28" fill="#1d4e89" stroke="#c1121f" stroke-width="6"/>
    <text x="32" y="42" text-anchor="middle" font-size="26" font-weight="700" fill="#fff">P</text>
    <line x1="12" y1="52" x2="52" y2="12" stroke="#c1121f" stroke-width="6"/></svg>`
};

async function loadCaptcha() {
  const box = $('#capBox');
  if (!box) return;

  captcha = null;
  capChoice = null;
  box.innerHTML = '<span class="xs muted">Loading check…</span>';

  try {
    const out = await rpc('tuna_captcha_new', { p_kind: capKind });

    if (!out || out.ok === false) {
      box.innerHTML = `<span class="xs muted">${esc((out && out.error) || 'Check unavailable.')}</span>`;
      return;
    }

    captcha = out;
    box.innerHTML = captchaMarkup(out);
    wireCaptcha(box);
  } catch (e) {
    box.innerHTML = `<span class="xs muted">Could not load the check. ${esc(e.message)}</span>`;
  }
}

function captchaMarkup(c) {
  const flip = c.kind === 'sign'
    ? '<button type="button" class="linkbtn" data-cap="maths">Use a maths question instead</button>'
    : '<button type="button" class="linkbtn" data-cap="sign">Tap a sign instead</button>';

  if (c.kind === 'maths') {
    return `
      <span class="label">${esc(c.prompt)}</span>
      <input id="fCap" class="mono" type="text" inputmode="numeric"
             autocomplete="off" placeholder="Your answer" maxlength="4">
      <span class="xs muted">${flip}</span>`;
  }

  const tiles = (c.options || []).map((k) => `
    <button type="button" class="signbtn" data-sign="${esc(k)}">
      ${SIGNS[k] || ''}
    </button>`).join('');

  return `
    <span class="label">${esc(c.prompt)}</span>
    <div class="signgrid">${tiles}</div>
    <span class="xs muted">${flip}</span>`;
}

function wireCaptcha(box) {
  box.addEventListener('click', (e) => {
    const flip = e.target.closest('button[data-cap]');
    if (flip) {
      capKind = flip.dataset.cap;
      loadCaptcha();
      return;
    }

    const tile = e.target.closest('button[data-sign]');
    if (!tile) return;
    capChoice = tile.dataset.sign;
    box.querySelectorAll('.signbtn').forEach((b) => b.classList.remove('is-picked'));
    tile.classList.add('is-picked');
  });
}

function captchaAnswer() {
  if (!captcha) return null;
  if (captcha.kind === 'maths') return ($('#fCap')?.value || '').trim() || null;
  return capChoice;
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
  stopHold();
  try {
    const out = await busy(btn, 'Checking…', () =>
      rpc('tuna_login', { p_phone: $('#fPhone').value, p_password: $('#fPass').value }));

    if (out && out.ok === false) return handleGate(out, err);

    await land(out);
  } catch (e) { showError(err, e.message); }
}

async function doRegister(btn) {
  const err = $('#gateErr'); clearError(err);
  stopHold();

  const name = $('#fName').value.trim();
  const p1 = $('#fPass1').value, p2 = $('#fPass2').value;
  const ans = captchaAnswer();

  if (name.length < 3) return showError(err, 'Enter your full name, at least 3 characters.');
  if (p1.length < 6) return showError(err, 'Use a password of at least 6 characters.');
  if (p1 !== p2) return showError(err, 'The two passwords do not match.');
  if (!captcha) return showError(err, 'Wait for the check to load, then try again.');
  if (!ans) {
    return showError(err, captcha.kind === 'maths'
      ? 'Answer the maths question first.'
      : 'Tap the sign it asks for first.');
  }

  try {
    const out = await busy(btn, 'Creating…', () =>
      rpc('tuna_register', {
        p_phone: $('#fPhone').value,
        p_name: name,
        p_password: p1,
        p_captcha_id: captcha.id,
        p_captcha_answer: ans
      }));

    if (out && out.ok === false) {
      handleGate(out, err);
      loadCaptcha();          // the challenge is spent either way
      return;
    }

    await land(out);
  } catch (e) {
    showError(err, e.message);
    loadCaptcha();
  }
}

async function askReset(btn) {
  const err = $('#gateErr'); clearError(err);
  try {
    const out = await busy(btn, 'Sending…', () => rpc('tuna_request_password_reset', {
      p_phone: $('#fPhone').value, p_note: $('#fNote')?.value || null
    }));

    if (out && out.ok === false) return handleGate(out, err);

    phone = out.phone;
    step = 'sent';
    render();
    $('#fBackLogin').addEventListener('click', () => setMode('login'));
  } catch (e) { showError(err, e.message); }
}

async function land(out) {
  stopHold();
  captcha = null; capChoice = null;
  setToken(out.token);
  applyTheme(out.player.theme || savedTheme());
   import('./notifications.js').then(n => n.initNotifications(out.player.id));
  toast(out.created
    ? `Welcome to Tunanepal, ${out.player.name.split(' ')[0]}.`
    : `Welcome back, ${out.player.name.split(' ')[0]}.`, 'good');
  await onDone();
}
