/* Tunanepal — Settings.
   Profile, leaderboard, history, theme, support chat, feedback, sign out. */

import { rpcAuth, upload } from './api.js';
import { BUCKET_PUBLIC, BUCKET_PROOF } from './config.js';
import {
  $, $$, esc, money, when, ago, initials, toast, busy, showError, clearError,
  emptyState, skeletons, openSheet, closeSheet, applyTheme
} from './ui.js';
import { state, refreshMe, signOut } from './session.js';

export async function showSettings() {
  const p = state.player;
  $('#settingsBody').innerHTML = `
    <div class="card profile">
      <div class="avatar avatar--lg" id="setAvatar">
        ${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(p.name))}
      </div>
      <h2>${esc(p.name)}</h2>
      <p class="mono muted">${esc(p.phone)}</p>
      <p class="xs muted" style="margin-top:2px">Your number is your player ID</p>

      <div class="profile__acts">
        <div class="filepick filepick--inline" id="avPick">
          <input type="file" id="avFile" accept="image/jpeg,image/png,image/webp">
          <span>Change photo</span>
        </div>
        ${p.avatar_url ? `<button class="btn btn--ghost btn--sm" id="avClear">Remove</button>` : ''}
      </div>
    </div>

    <div class="scoreline" style="margin-top:14px">
      <div><b class="mono" style="color:var(--marigold)">${money(p.points)}</b><small>Points</small></div>
      <div><b class="mono" style="color:var(--win)">${p.wins}</b><small>Wins</small></div>
      <div><b class="mono">${p.losses}</b><small>Losses</small></div>
    </div>

    <div class="section-head"><h2>Menu</h2></div>
    <div class="card card--flush">
      ${menuRow('leaderboard', 'Leaderboard', 'Daily, weekly and monthly ranks')}
      ${menuRow('history', 'History', 'Deposits, withdrawals and every transaction')}
      ${menuRow('theme', 'Theme', 'Cream or dark')}
      ${menuRow('password', 'Change password', 'Update your sign-in password')}
      ${menuRow('report', 'Report a problem', 'Chat with support, send proof')}
      ${menuRow('feedback', 'Feedback', 'Rate the app')}
    </div>

    <button class="btn btn--ghost" id="logoutBtn" style="margin-top:16px">Sign out</button>
    <p class="xs muted center" style="margin-top:20px">Tunanepal · v1.0</p>`;

  $('#avFile').addEventListener('change', changeAvatar);
  $('#avClear')?.addEventListener('click', clearAvatar);
  $('#logoutBtn').addEventListener('click', signOut);

  $$('[data-menu]').forEach((row) =>
    row.addEventListener('click', () => open(row.dataset.menu)));
}

const menuRow = (key, title, note) => `
  <button class="menurow" data-menu="${key}">
    <span class="grow">
      <b>${title}</b>
      <small>${note}</small>
    </span>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="m9 6 6 6-6 6"/></svg>
  </button>`;

function open(key) {
  if (key === 'leaderboard') return leaderboard();
  if (key === 'history') return history();
  if (key === 'theme') return theme();
  if (key === 'password') return password();
  if (key === 'report') return report();
  if (key === 'feedback') return feedback();
}

/* ───────────────────────────────────────────────────────────── profile ── */
async function changeAvatar() {
  const file = $('#avFile').files[0];
  if (!file) return;
  try {
    const url = await upload(BUCKET_PUBLIC, file);
    await rpcAuth('tuna_set_avatar', { p_url: url });
    await refreshMe();
    toast('Photo updated.', 'good');
    showSettings();
  } catch (e) { toast(e.message, 'bad'); }
}

async function clearAvatar() {
  try {
    await rpcAuth('tuna_set_avatar', { p_url: null });
    await refreshMe();
    toast('Photo removed.');
    showSettings();
  } catch (e) { toast(e.message, 'bad'); }
}

/* ───────────────────────────────────────────────────────── leaderboard ── */
async function leaderboard() {
  openSheet(`<h2>Leaderboard</h2><p class="sheet__sub">Ranked by matches won</p>
    <div class="tabs-inline" id="lbTabs">
      <button data-p="daily" aria-pressed="false">Today</button>
      <button data-p="weekly" aria-pressed="false">This week</button>
      <button data-p="monthly" aria-pressed="true">This month</button>
      <button data-p="all" aria-pressed="false">All time</button>
    </div>
    <div id="lbBody">${skeletons(4, 54)}</div>`);

  const load = async (period) => {
    $('#lbBody').innerHTML = skeletons(4, 54);
    try {
      const rows = await rpcAuth('tuna_leaderboard', { p_period: period }) || [];
      $('#lbBody').innerHTML = rows.length ? rows.map((r, i) => `
        <div class="lbrow">
          <span class="lbrank ${i < 3 ? 'lbrank--top' : ''}">#${i + 1}</span>
          <span class="avatar avatar--sm">
            ${r.avatar_url ? `<img src="${esc(r.avatar_url)}" alt="">` : esc(initials(r.name))}
          </span>
          <span class="grow"><b>${esc(r.name)}</b>
            <small>${r.wins} win${r.wins === 1 ? '' : 's'}</small></span>
          <span class="amount amount--up">${money(r.earned)}</span>
        </div>`).join('')
        : emptyState('No winners yet', 'Play a match to get on the board.');
    } catch (e) { $('#lbBody').innerHTML = emptyState('Could not load', e.message); }
  };

  $('#lbTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]');
    if (!b) return;
    [...$('#lbTabs').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    load(b.dataset.p);
  });
  load('monthly');
}

/* ───────────────────────────────────────────────────────────── history ── */
async function history() {
  openSheet(`<h2>History</h2><p class="sheet__sub">Everything that moved your points</p>
    <div class="tabs-inline" id="hTabs">
      <button data-h="ledger" aria-pressed="true">All</button>
      <button data-h="deposits" aria-pressed="false">Deposits</button>
      <button data-h="withdrawals" aria-pressed="false">Withdrawals</button>
      <button data-h="purchases" aria-pressed="false">UC orders</button>
    </div>
    <div id="hBody">${skeletons(4, 56)}</div>`);

  let data = null;
  try { data = await rpcAuth('tuna_history'); }
  catch (e) { $('#hBody').innerHTML = emptyState('Could not load', e.message); return; }

  const paint = (key) => {
    const rows = data[key] || [];
    if (!rows.length) {
      $('#hBody').innerHTML = emptyState('Nothing here', 'This list is still empty.');
      return;
    }
    $('#hBody').innerHTML = rows.map((r) => key === 'ledger' ? `
      <div class="listrow">
        <div class="grow"><b>${esc(r.note || r.kind)}</b>
          <small>${esc(when(r.created_at))}</small></div>
        <div style="text-align:right">
          <div class="amount ${r.amount > 0 ? 'amount--up' : 'amount--down'}">
            ${r.amount > 0 ? '+' : '−'}${money(Math.abs(r.amount))}</div>
          <small class="xs muted mono">bal ${money(r.balance_after)}</small>
        </div>
      </div>` : `
      <div class="listrow">
        <div class="grow">
          <b>${r.pack_title ? esc(r.pack_title) : money(r.amount)}</b>
          <small>${esc(when(r.created_at))}${r.admin_note ? ' · ' + esc(r.admin_note) : ''}</small>
        </div>
        <span class="pill ${r.status === 'approved' || r.status === 'delivered' ? 'pill--win'
          : r.status === 'pending' ? 'pill--wait' : 'pill--bad'}">${esc(r.status)}</span>
      </div>`).join('');
  };

  $('#hTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-h]');
    if (!b) return;
    [...$('#hTabs').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    paint(b.dataset.h);
  });
  paint('ledger');
}

/* ─────────────────────────────────────────────────────────────── theme ── */
function theme() {
  const cur = document.documentElement.dataset.theme || 'cream';
  openSheet(`<h2>Theme</h2><p class="sheet__sub">Pick how Tunanepal looks</p>
    <div class="themepick">
      <button data-t="cream" aria-pressed="${cur === 'cream'}">
        <span class="swatch swatch--cream"></span><b>Cream</b><small>Light and warm</small>
      </button>
      <button data-t="dark" aria-pressed="${cur === 'dark'}">
        <span class="swatch swatch--dark"></span><b>Dark</b><small>Easy at night</small>
      </button>
    </div>
    <button class="btn btn--ghost" id="thDone" style="margin-top:16px">Done</button>`);

  $('.themepick').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b) return;
    applyTheme(b.dataset.t);
    $$('.themepick button').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    try { await rpcAuth('tuna_set_theme', { p_theme: b.dataset.t }); } catch {}
  });
  $('#thDone').addEventListener('click', closeSheet);
}

/* ──────────────────────────────────────────────────────────── password ── */
function password() {
  openSheet(`<h2>Change password</h2>
    <p class="sheet__sub">You will stay signed in on this device</p>
    <div class="alert alert--bad" id="pwErr" hidden></div>
    <label class="field"><span class="label">Current password</span>
      <input type="password" id="pwCur" autocomplete="current-password"></label>
    <label class="field"><span class="label">New password</span>
      <input type="password" id="pwNew" autocomplete="new-password" placeholder="At least 6 characters"></label>
    <label class="field"><span class="label">Repeat new password</span>
      <input type="password" id="pwNew2" autocomplete="new-password"></label>
    <button class="btn" id="pwGo">Save password</button>
    <button class="btn btn--ghost" id="pwCancel" style="margin-top:8px">Cancel</button>`);

  $('#pwCancel').addEventListener('click', closeSheet);
  $('#pwGo').addEventListener('click', async (e) => {
    const err = $('#pwErr'); clearError(err);
    const n1 = $('#pwNew').value, n2 = $('#pwNew2').value;
    if (n1.length < 6) return showError(err, 'Use at least 6 characters.');
    if (n1 !== n2) return showError(err, 'The two passwords do not match.');
    try {
      await busy(e.currentTarget, 'Saving…', () =>
        rpcAuth('tuna_set_password', { p_new: n1, p_current: $('#pwCur').value }));
      closeSheet();
      toast('Password changed.', 'good');
    } catch (ex) { showError(err, ex.message); }
  });
}

/* ────────────────────────────────────────────────── report a problem ── */
async function report() {
  openSheet(`<h2>Report a problem</h2>
    <p class="sheet__sub">Send a message, photo or video. Support replies here.</p>
    <div class="chatbox" id="chatBox">${skeletons(2, 48)}</div>
    <div class="alert alert--bad" id="rErr" hidden></div>
    <label class="field" style="margin-top:12px">
      <textarea id="rBody" placeholder="Describe what happened. If someone cheated, attach proof."></textarea>
    </label>
    <div class="filepick" id="rPick">
      <input type="file" id="rFile" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime">
      <span id="rLabel">Attach photo or video (optional)</span>
    </div>
    <button class="btn" id="rSend" style="margin-top:12px">Send message</button>`);

  const paint = async () => {
    try {
      const t = await rpcAuth('tuna_report_thread');
      const msgs = t.messages || [];
      $('#chatBox').innerHTML = msgs.length ? msgs.map((m) => `
        <div class="bubble bubble--${m.sender}">
          ${m.body ? `<p>${esc(m.body)}</p>` : ''}
          ${m.media_url ? (m.media_type === 'video'
            ? `<video src="${esc(m.media_url)}" controls playsinline></video>`
            : `<img src="${esc(m.media_url)}" alt="attachment" loading="lazy">`) : ''}
          <time>${esc(ago(m.created_at))}</time>
        </div>`).join('')
        : `<p class="xs muted center" style="padding:16px">No messages yet. Say what went wrong.</p>`;
      $('#chatBox').scrollTop = $('#chatBox').scrollHeight;
    } catch (e) { $('#chatBox').innerHTML = emptyState('Could not load', e.message); }
  };
  await paint();

  $('#rFile').addEventListener('change', () => {
    const f = $('#rFile').files[0];
    $('#rLabel').textContent = f ? `✓ ${f.name.slice(0, 26)}` : 'Attach photo or video (optional)';
    $('#rPick').toggleAttribute('data-has', !!f);
  });

  $('#rSend').addEventListener('click', async (e) => {
    const err = $('#rErr'); clearError(err);
    const body = $('#rBody').value.trim();
    const file = $('#rFile').files[0];
    if (!body && !file) return showError(err, 'Write a message or attach a file.');
    try {
      await busy(e.currentTarget, 'Sending…', async () => {
        let url = null, type = null;
        if (file) {
          url = await upload(BUCKET_PROOF, file);
          type = file.type.startsWith('video') ? 'video' : 'image';
        }
        await rpcAuth('tuna_report_send', { p_body: body, p_media_url: url, p_media_type: type });
      });
      $('#rBody').value = ''; $('#rFile').value = '';
      $('#rLabel').textContent = 'Attach photo or video (optional)';
      await paint();
      toast('Sent. Support will reply here.', 'good');
    } catch (ex) { showError(err, ex.message); }
  });
}

/* ────────────────────────────────────────────────────────────── feedback ── */
function feedback() {
  let stars = 0;
  openSheet(`<h2>Feedback</h2><p class="sheet__sub">How is Tunanepal treating you?</p>
    <div class="alert alert--bad" id="fbErr" hidden></div>
    <div class="stars" id="stars">
      ${[1, 2, 3, 4, 5].map((n) => `<button data-s="${n}" aria-label="${n} stars">★</button>`).join('')}
    </div>
    <label class="field" style="margin-top:14px">
      <span class="label">Anything to add? (optional)</span>
      <textarea id="fbMsg" placeholder="What would make it better?"></textarea>
    </label>
    <button class="btn" id="fbGo">Send feedback</button>
    <button class="btn btn--ghost" id="fbCancel" style="margin-top:8px">Cancel</button>`);

  $('#stars').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]');
    if (!b) return;
    stars = Number(b.dataset.s);
    $$('#stars button').forEach((x) => x.toggleAttribute('data-on', Number(x.dataset.s) <= stars));
  });
  $('#fbCancel').addEventListener('click', closeSheet);
  $('#fbGo').addEventListener('click', async (e) => {
    const err = $('#fbErr'); clearError(err);
    if (!stars) return showError(err, 'Tap a star rating first.');
    try {
      await busy(e.currentTarget, 'Sending…', () =>
        rpcAuth('tuna_feedback', { p_stars: stars, p_message: $('#fbMsg').value }));
      closeSheet();
      toast('Thanks for the feedback.', 'good');
    } catch (ex) { showError(err, ex.message); }
  });
}
