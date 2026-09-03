/* Tunanepal — Settings.
   Profile, leaderboard, history, theme, support chat, feedback, sign out. */

import { rpcAuth, upload } from './api.js';
import { BUCKET_PUBLIC } from './config.js';
import {
  $, $$, esc, money, when, ago, initials, toast, busy, showError, clearError,
  emptyState, skeletons, openSheet, closeSheet, applyTheme
} from './ui.js';
import { state, refreshMe, signOut } from './session.js';
import { openSupportChat } from './chat.js';
import { rankBadge, rankChip } from './ranks.js';
import { openInstall, installMenuNote, isInstalled } from './install.js';

export async function showSettings() {
  const p = state.player;
  $('#settingsBody').innerHTML = `
    <div class="card profile">
      <div class="avatar avatar--lg" id="setAvatar">
        ${p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc(initials(p.name))}
      </div>
      <h2>${esc(p.name)}</h2>
      ${p.rank ? rankChip(p.rank, p.rank_label) : ''}
      <p class="mono muted" style="margin-top:6px">${esc(p.phone)}</p>
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
      ${menuRow('rank', 'My rank', 'Your tier, progress and rewards')}
      ${menuRow('leaderboard', 'Leaderboard', 'Daily, weekly and monthly ranks')}
      ${menuRow('history', 'History', 'Deposits, withdrawals and every transaction')}
      ${menuRow('theme', 'Theme', 'Cream or dark')}
      ${menuRow('password', 'Change password', 'Update your sign-in password')}
      ${menuRow('report', 'Report a problem', 'Chat with support, send proof')}
      ${menuRow('feedback', 'Feedback', 'Rate the app')}
      ${isInstalled() ? '' : menuRow('install', 'Get the app', installMenuNote())}
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
  if (key === 'rank') return myRank();
  if (key === 'leaderboard') return leaderboard();
  if (key === 'history') return history();
  if (key === 'theme') return theme();
  if (key === 'password') return password();
  if (key === 'report') return openSupportChat();
  if (key === 'feedback') return feedback();
  if (key === 'install') return openInstall();
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

/* ──────────────────────────────────────────────────────────── my rank ── */
async function myRank() {
  openSheet(`<h2>My rank</h2>
    <p class="sheet__sub">Climb by winning matches. Each tier pays once.</p>
    <div id="rkBody">${skeletons(2, 90)}</div>`);

  const paint = async () => {
    let d;
    try { d = await rpcAuth('tuna_my_rank'); }
    catch (e) { $('#rkBody').innerHTML = emptyState('Could not load', e.message); return; }

    const cur = d.current;
    const next = d.next;

    $('#rkBody').innerHTML = `
      <div class="rankhero rank--${esc(cur.key)}">
        <div class="rankhero__mark">${rankBadge(cur.key, 46)}</div>
        <span class="rankhero__badge">${esc(cur.label)}</span>
        <b>${d.wins} win${d.wins === 1 ? '' : 's'}</b>
        <small>${d.losses} lost · ${money(d.total_claimed)} collected so far</small>

        ${next ? `
          <div class="rankbar"><i style="width:${Math.max(3, d.band_progress)}%"></i></div>
          <p class="rankhero__next">
            ${next.wins_needed} more win${next.wins_needed === 1 ? '' : 's'}
            to reach <b>${esc(next.label)}</b>${next.reward > 0 ? ' · ' + money(next.reward) : ''}
          </p>`
        : `<p class="rankhero__next">Top tier reached. Nothing above this one.</p>`}
      </div>

      <p class="eyebrow" style="margin:18px 0 8px">All tiers</p>
      ${d.tiers.map((t) => `
        <div class="ranktier ${t.is_current ? 'ranktier--now' : ''} ${t.reached ? '' : 'ranktier--locked'}">
          <span class="ranktier__mark">${rankBadge(t.key, 26)}</span>
          <div class="grow">
            <b>${esc(t.label)}</b>
            <small>${t.max_wins === null
              ? `${t.min_wins}+ wins`
              : `${t.min_wins}–${t.max_wins} wins`}</small>
          </div>
          <span class="ranktier__reward">${t.reward > 0 ? money(t.reward) : '—'}</span>
          ${t.claimed
            ? '<span class="pill pill--win">Collected</span>'
            : t.claimable
              ? `<button class="btn btn--sm btn--marigold" data-claim="${esc(t.key)}">Collect</button>`
              : '<span class="pill">Locked</span>'}
        </div>`).join('')}

      <p class="xs muted" style="margin-top:14px">
        Rewards are paid into your points balance and can be collected once
        each. A tier you have already passed can still be collected.</p>

      <button class="btn btn--ghost" id="rkDone" style="margin-top:14px">Close</button>`;

    $('#rkDone').addEventListener('click', closeSheet);
    $$('[data-claim]').forEach((b) => b.addEventListener('click', async (e) => {
      try {
        const out = await busy(e.currentTarget, 'Collecting…', () =>
          rpcAuth('tuna_claim_rank', { p_rank: b.dataset.claim }));
        toast(`${out.label} reward collected — ${money(out.reward)} added.`, 'good');
        await refreshMe();
        paint();
      } catch (ex) { toast(ex.message, 'bad'); }
    }));
  };

  await paint();
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
          <span class="grow">
            <b>${esc(r.name)} ${r.rank ? rankBadge(r.rank, 15) : ''}</b>
            <small>${esc(r.rank_label || '')}${r.rank_label ? ' · ' : ''}${r.played} game${r.played === 1 ? '' : 's'} played</small>
          </span>
          <span class="lbwins">
            <b>${r.wins}</b><small>won</small>
          </span>
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
      <button data-h="purchases" aria-pressed="false">Store</button>
      <button data-h="fines" aria-pressed="false">Fines</button>
    </div>
    <div id="hBody">${skeletons(4, 56)}</div>`);

  let data = null;
  try {
    data = await rpcAuth('tuna_history');
    data.fines = await rpcAuth('tuna_my_fines') || [];
  } catch (e) { $('#hBody').innerHTML = emptyState('Could not load', e.message); return; }

  const paint = (key) => {
    const rows = data[key] || [];
    if (!rows.length) {
      $('#hBody').innerHTML = emptyState('Nothing here', 'This list is still empty.');
      return;
    }
    if (key === 'fines') {
      $('#hBody').innerHTML = rows.map((r) => `
        <div class="listrow">
          <div class="grow"><b>${esc(r.reason)}</b>
            <small>${esc(when(r.created_at))} · ${money(r.collected)} of ${money(r.amount)} taken</small></div>
          <span class="pill ${r.outstanding > 0 ? 'pill--bad' : 'pill--win'}">
            ${r.outstanding > 0 ? money(r.outstanding) + ' owed' : 'cleared'}</span>
        </div>`).join('');
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
