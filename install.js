/* Tunanepal — "get the app".
   Three different realities behind one button:
     Android Chrome → a real install prompt the browser gives us
     iPhone Safari  → no API exists, so we show the Share-sheet steps
     APK            → offered as a fallback when a file is hosted
   Anyone already running the installed app sees none of it. */

import { APK_URL } from './config.js';
import { $, esc, openSheet, closeSheet, toast } from './ui.js';

const DISMISS_KEY = 'tuna.install.hidden';

let deferredPrompt = null;

/* Chrome fires this when the app qualifies for installation. Holding onto
   the event lets us show our own button instead of its mini-infobar. */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  paintInstall();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  localStorage.setItem(DISMISS_KEY, '1');
  paintInstall();
  toast('Tunanepal added to your home screen.', 'good');
});

/* ─────────────────────────────────────────────────────────── detection ── */
export function platform() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

const dismissed = () => localStorage.getItem(DISMISS_KEY) === '1';

/* ────────────────────────────────────────────────── the card on Home ──── */
export function paintInstall() {
  const slot = $('#installSlot');
  if (!slot) return;

  if (isInstalled() || dismissed()) { slot.hidden = true; return; }

  const p = platform();
  slot.hidden = false;
  slot.innerHTML = `
    <div class="installcard">
      <div class="installcard__icon">
        <img src="./icon-192.png" alt="" width="46" height="46">
      </div>
      <div class="grow">
        <b>Get the Tunanepal app</b>
        <small>${p === 'ios'
          ? 'Add it to your home screen from Safari'
          : 'Full screen, opens instantly, works offline'}</small>
      </div>
      <button class="btn btn--sm" id="installGo">Install</button>
      <button class="installcard__x" id="installX" aria-label="Dismiss">&times;</button>
    </div>`;

  $('#installX').addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    slot.hidden = true;
  });
  $('#installGo').addEventListener('click', openInstall);
}

/* ────────────────────────────────────────────────────── the sheet ─────── */
export async function openInstall() {
  const p = platform();

  /* Android or desktop Chrome, and the browser has offered us the prompt */
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') return;      // appinstalled tidies up
    return toast('You can install any time from Settings.');
  }

  if (p === 'ios') return iosSheet();
  return androidSheet();
}

function iosSheet() {
  openSheet(`
    <h2>Add to your home screen</h2>
    <p class="sheet__sub">iPhone installs apps from Safari, not from a file.</p>

    <div class="alert alert--info">
      This only works in <b>Safari</b>. If you are reading this in Chrome or
      inside Facebook or Instagram, open <b>tunanepal.com</b> in Safari first.
    </div>

    <ol class="steplist">
      <li><span>1</span>Tap the <b>Share</b> button at the bottom of Safari
        — the square with an arrow pointing up.</li>
      <li><span>2</span>Scroll down the list and tap <b>Add to Home Screen</b>.</li>
      <li><span>3</span>Tap <b>Add</b> in the top right corner.</li>
    </ol>

    <p class="small muted">Tunanepal then opens full screen with its own icon,
      exactly like an app from the App Store.</p>

    <button class="btn btn--ghost" id="insDone" style="margin-top:14px">Got it</button>`);
  $('#insDone').addEventListener('click', closeSheet);
}

function androidSheet() {
  openSheet(`
    <h2>Install Tunanepal</h2>
    <p class="sheet__sub">Two ways — pick whichever suits you.</p>

    <div class="installopt">
      <b>From your browser</b>
      <p class="small muted">Open the <b>⋮</b> menu in Chrome and tap
        <b>Add to Home screen</b> or <b>Install app</b>. Nothing to download.</p>
    </div>

    ${APK_URL ? `
    <div class="installopt">
      <b>Download the APK</b>
      <p class="small muted">A normal Android app file. Your phone will ask you
        to allow installing from this source — that is expected, tap allow.</p>
      <a class="btn btn--marigold" href="${esc(APK_URL)}" download>Download for Android</a>
    </div>` : ''}

    <button class="btn btn--ghost" id="insDone" style="margin-top:6px">Close</button>`);
  $('#insDone').addEventListener('click', closeSheet);
}

/* Settings uses this so the option never disappears for good. */
export function installMenuNote() {
  if (isInstalled()) return 'Already installed on this device';
  return platform() === 'ios'
    ? 'Add to your home screen from Safari'
    : 'Add Tunanepal to your home screen';
}

export function resetDismissed() { localStorage.removeItem(DISMISS_KEY); }
