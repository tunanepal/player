/* Tunanepal — bootstrap and tab routing. */

import { $, $$, applyTheme, savedTheme, toast, openSheet, closeSheet, esc, ago, emptyState } from './ui.js';
import { rpcAuth } from './api.js';
import { initGate, resume, refreshMe, state, paintChrome } from './session.js';
import { initHome, showHome, leaveHome, paintAds } from './home.js';

applyTheme(savedTheme());

/* ───────────────────────────────────────────────────────────── routing ── */
const SCREENS = {
  home:     { enter: showHome,  leave: leaveHome },
  load:     {},
  customs:  {},
  games:    {},
  settings: {}
};

let current = null;

export async function go(name) {
  if (!SCREENS[name] || name === current) return;
  if (current && SCREENS[current].leave) SCREENS[current].leave();

  $$('.screen').forEach((s) => s.toggleAttribute('data-on', s.id === `screen-${name}`));
  $$('.tabbar button').forEach((b) =>
    b.setAttribute('aria-current', b.dataset.screen === name ? 'page' : 'false'));

  current = name;
  window.scrollTo({ top: 0 });

  if (SCREENS[name].enter) {
    try { await SCREENS[name].enter(); }
    catch (e) { toast(e.message, 'bad'); }
  }
}

$('#tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-screen]');
  if (btn) go(btn.dataset.screen);
});

/* ─────────────────────────────────────────────────────── notifications ── */
$('#bellBtn').addEventListener('click', async () => {
  openSheet(`<h2>Notifications</h2><p class="sheet__sub">Updates from Tunanepal</p>
             <div id="notifBody">${'<div class="skeleton" style="height:64px;margin-bottom:8px"></div>'.repeat(3)}</div>`);
  try {
    const list = await rpcAuth('tuna_notifications') || [];
    $('#notifBody').innerHTML = list.length ? list.map((n) => `
      <div class="listrow">
        <div class="grow">
          <b>${esc(n.title)}</b>
          <small>${esc(n.body)}</small>
        </div>
        <span class="xs muted" style="white-space:nowrap">${esc(ago(n.created_at))}</span>
      </div>`).join('') : emptyState('Nothing yet', 'Match results and wallet updates land here.');
    await rpcAuth('tuna_read_notifications');
    state.unread = 0;
    paintChrome();
  } catch (e) {
    $('#notifBody').innerHTML = emptyState('Could not load', e.message);
  }
});

/* ────────────────────────────────────────────────────────────── launch ── */
async function enterApp() {
  await refreshMe();
  paintAds(state.ads);
  $('#gate').hidden = true;
  $('#app').hidden = false;
  initHome();
  await go('home');
}

(async function start() {
  initGate({ onSignedIn: enterApp });

  if (await resume()) {
    paintAds(state.ads);
    $('#gate').hidden = true;
    $('#app').hidden = false;
    initHome();
    await go('home');
  } else {
    $('#gate').hidden = false;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();

/* Coming back to the tab after a while: rooms expire fast, so resync. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.player && current === 'home') {
    showHome().catch(() => {});
  }
});
