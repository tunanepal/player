/* Tunanepal — Home.
   Rooms posted from the Customs tab surface here for ten minutes. A room
   shows its rules to everyone but hides the game name, room ID and password
   until someone puts their stake in. */

import { rpcAuth } from './api.js';
import { GAMES } from './config.js';
import { SCHEMA } from './customs.js';
import {
  $, esc, money, when, mmss, onTick, toast, openSheet, closeSheet,
  busy, showError, clearError, emptyState, skeletons, avatarHTML
} from './ui.js';
import { refreshMe } from './session.js';

let activeGame = 'pubg';
let rooms = [];
let pollTimer = null;
let stopTick = null;

/* ─────────────────────────────────────────────────────────── ad banner ── */
let adIndex = 0, adTimer = null;

export function paintAds(ads) {
  const wrap = $('#adstrip');
  if (!ads?.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="adstrip__track" id="adTrack">
      ${ads.map((a) => a.link
        ? `<a href="${esc(a.link)}" target="_blank" rel="noopener noreferrer"><img src="${esc(a.image_url)}" alt="" loading="lazy"></a>`
        : `<div class="slide"><img src="${esc(a.image_url)}" alt="" loading="lazy"></div>`).join('')}
    </div>
    ${ads.length > 1 ? `<div class="adstrip__dots" id="adDots">${ads.map((_, i) =>
      `<i ${i === 0 ? 'data-on' : ''}></i>`).join('')}</div>` : ''}`;

  clearInterval(adTimer);
  if (ads.length > 1) {
    adIndex = 0;
    adTimer = setInterval(() => {
      adIndex = (adIndex + 1) % ads.length;
      $('#adTrack').style.transform = `translateX(-${adIndex * 100}%)`;
      $$dots(adIndex);
    }, 5000);
  }
}

function $$dots(active) {
  const dots = $('#adDots');
  if (!dots) return;
  [...dots.children].forEach((d, i) => d.toggleAttribute('data-on', i === active));
}

/* ───────────────────────────────────────────────────────── game chooser ── */
export function initHome() {
  $('#gamepick').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-game]');
    if (!btn) return;
    activeGame = btn.dataset.game;
    syncGamePick();
    loadRooms();
  });
  syncGamePick();
}

function syncGamePick() {
  $$g().forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.game === activeGame)));
}
const $$g = () => [...$('#gamepick').querySelectorAll('button[data-game]')];

/* ────────────────────────────────────────────────────────────── loading ── */
export async function showHome() {
  clearInterval(pollTimer);
  pollTimer = setInterval(loadRooms, 15000);   // rooms are short-lived; keep fresh
  await loadRooms();
}

export function leaveHome() {
  clearInterval(pollTimer);
  clearInterval(adTimer);
  if (stopTick) { stopTick(); stopTick = null; }
}

async function loadRooms() {
  const list = $('#roomList');
  if (!rooms.length) list.innerHTML = skeletons(2, 150);
  try {
    rooms = await rpcAuth('tuna_rooms', { p_game: activeGame }) || [];
    paintRooms();
  } catch (e) {
    if (e.expired || e.blocked) return;
    list.innerHTML = emptyState('Could not load rooms', e.message);
  }
}

function countRooms() {
  $$g().forEach((b) => {
    const el = b.querySelector('.g-count');
    if (b.dataset.game === activeGame) el.textContent = `${rooms.length} live`;
  });
}

function paintRooms() {
  const list = $('#roomList');
  countRooms();

  if (!rooms.length) {
    list.innerHTML = emptyState(
      `No ${GAMES[activeGame].short} rooms right now`,
      'Rooms stay up for ten minutes. Post your own from the Customs tab.');
    if (stopTick) { stopTick(); stopTick = null; }
    return;
  }

  list.innerHTML = rooms.map(roomCard).join('');
  list.querySelectorAll('[data-details]').forEach((b) =>
    b.addEventListener('click', () => openDetails(Number(b.dataset.details))));

  if (stopTick) stopTick();
  stopTick = onTick(tickFuses);
  tickFuses();
}

function roomCard(r) {
  const tags = specTags(r);
  return `
  <article class="card room" data-room="${r.id}">
    <div class="room__top">
      ${avatarHTML({ name: r.host_name, avatar_url: r.host_avatar }, 'avatar--sm')}
      <div class="room__title">
        <h3>${esc((r.team_size || '').toUpperCase())} · ${esc(r.match_type || GAMES[r.game].short)}</h3>
        <small>Hosted by ${esc(r.host_name)}${r.is_host ? ' · you' : ''}</small>
      </div>
      <div class="room__stake">
        <b>${money(r.amount)}</b>
        <small>per side</small>
      </div>
    </div>

    <div class="room__tags">${tags.slice(0, 4).join('')}
      ${tags.length > 4 ? `<span class="tag">+${tags.length - 4}</span>` : ''}</div>

    <div class="room__foot">
      <div class="fuse">
        <span class="fuse__track"><i class="fuse__fill" data-fill="${r.id}"></i></span>
        <span class="fuse__time" data-clock="${r.id}">—</span>
      </div>
      <button class="btn btn--sm ${r.is_host ? 'btn--ghost' : ''}" data-details="${r.id}">
        ${r.is_host ? 'Your room' : 'Details'}
      </button>
    </div>
  </article>`;
}

/** The rule chips. Free Fire toggles read as on/off; PUBG shows its gun type. */
function specTags(r) {
  const out = [];
  if (r.game === 'pubg' && r.gun_type) out.push(`<span class="tag">${esc(r.gun_type)}</span>`);
  const yn = (label, v) => v === null || v === undefined
    ? '' : `<span class="tag tag--${v ? 'on' : 'off'}">${label} ${v ? 'on' : 'off'}</span>`;
  out.push(yn('Headshot', r.headshot));
  out.push(yn('Limited ammo', r.limited_ammo));
  out.push(yn('Throwables', r.throwables));
  out.push(yn('Gun attributes', r.gun_attr));
  out.push(yn('Character skill', r.char_skill));
  return out.filter(Boolean);
}

/* ─────────────────────────────────────────────────── the ten-minute fuse ── */
function tickFuses() {
  const now = Date.now();
  let expired = false;
  for (const r of rooms) {
    const left = new Date(r.expires_at) - now;
    const total = new Date(r.expires_at) - new Date(r.created_at);
    const clock = document.querySelector(`[data-clock="${r.id}"]`);
    const fill = document.querySelector(`[data-fill="${r.id}"]`);
    if (!clock || !fill) continue;
    if (left <= 0) { expired = true; clock.textContent = '0:00'; fill.style.width = '0%'; continue; }
    clock.textContent = mmss(left);
    fill.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
    fill.toggleAttribute('data-low', left < 180000);
    fill.toggleAttribute('data-out', left < 60000);
  }
  if (expired) loadRooms();   // sweep the dead ones and refund their hosts
}

/* ─────────────────────────────────────────────────────── rulebook render ──
   The rulebook is stored as plain lines so it can be edited from the admin
   panel without touching code:
     #  heading    x  forbidden    y  allowed    !  penalty    -  neutral  */
function renderRules(text) {
  if (!text) return '';
  return text.split(String.fromCharCode(10)).map((raw) => {
    const line = raw.trim();
    if (!line) return '';
    const body = esc(line.slice(1).trim());
    switch (line[0]) {
      case '#': return `<h4 class="rule-head">${body}</h4>`;
      case 'x': return `<li class="rule rule--no"><span>✕</span>${body}</li>`;
      case 'y': return `<li class="rule rule--yes"><span>✓</span>${body}</li>`;
      case '!': return `<p class="rule-warn">${body}</p>`;
      case '-': return `<li class="rule rule--neutral"><span>•</span>${body}</li>`;
      default:  return `<p class="rule-text">${esc(line)}</p>`;
    }
  }).join('');
}

/* Turns the stored settings into readable rows, using the same labels the
   host saw when they posted the room. */
function specRows(r) {
  const fields = SCHEMA[r.game]?.fields || [];
  const rows = [];
  for (const f of fields) {
    let v = f.opt ? r.options?.[f.key] : r[f.key];
    if (f.key === 'team_size') v = r.team_size;
    if (v === null || v === undefined || v === '') continue;
    const val = typeof v === 'boolean'
      ? `<b class="${v ? 'yes' : 'no'}">${v ? 'Yes' : 'No'}</b>`
      : `<b>${esc(String(v))}</b>`;
    rows.push(`<div><small>${esc(f.label)}</small>${val}</div>`);
  }
  return rows;
}

/* ───────────────────────────────────────────────────────── details sheet ── */
async function openDetails(id) {
  let r, rules = '';
  try {
    r = await rpcAuth('tuna_room_details', { p_room: id });
    rules = await rpcAuth('tuna_rules', { p_game: r.game });
  } catch (e) { return toast(e.message, 'bad'); }
  if (!r) return toast('This room is no longer listed.', 'bad');

  const pot = r.amount * 2;
  const payout = Math.round(pot * 0.88);

  openSheet(`
    <h2>${esc((r.team_size || '').toUpperCase())} · ${esc(r.match_type || GAMES[r.game].short)}</h2>
    <p class="sheet__sub">${esc(GAMES[r.game].short)} · hosted by ${esc(r.host_name)}</p>
    <div class="alert alert--bad" id="joinErr" hidden></div>

    <p class="eyebrow" style="margin-bottom:8px">Match settings</p>
    <div class="spec">${specRows(r).join('')}</div>

    <div class="stakebox">
      <div>
        <small>You put in</small>
        <b>${money(r.amount)}</b>
      </div>
      <div class="win-line">
        Winner takes
        <b>${money(payout)}</b>
        <span class="xs muted">${money(pot)} pot, 12% commission</span>
      </div>
    </div>

    ${r.is_host
      ? `<div class="alert alert--info">This is your room. Your stake is already held — if nobody joins in ten minutes it comes straight back.</div>
         <button class="btn btn--ghost" id="joinBack">Back to home</button>`
      : `
      <div class="rulebook">
        <p class="eyebrow rulebook__title">Match room rules — read before joining</p>
        <ul class="rulelist">${renderRules(rules)}</ul>
      </div>

      <label class="agree" id="agreeWrap">
        <input type="checkbox" id="agreeBox">
        <span>I have read the match room rules and I agree to them.</span>
      </label>

      <button class="btn" id="joinYes" disabled>Join for ${money(r.amount)}</button>
      <button class="btn btn--ghost" id="joinNo" style="margin-top:8px">Not interested</button>
      <p class="xs muted center" style="margin-top:10px">
        Game name, room ID and password unlock the moment you pay in.</p>`}
  `);

  $('#joinNo')?.addEventListener('click', closeSheet);
  $('#joinBack')?.addEventListener('click', closeSheet);

  const box = $('#agreeBox');
  if (box) {
    box.addEventListener('change', () => {
      $('#joinYes').disabled = !box.checked;
      $('#agreeWrap').toggleAttribute('data-on', box.checked);
    });
  }

  $('#joinYes')?.addEventListener('click', (e) => accept(e.currentTarget, r));
}

/* ────────────────────────────────────────────────────────── accept a room ── */
async function accept(btn, room) {
  const err = $('#joinErr');
  clearError(err);
  try {
    const out = await busy(btn, 'Joining…', () =>
      rpcAuth('tuna_accept_room', { p_room: room.id, p_agreed: true }));
    await refreshMe();
    showCreds(out, room);
    loadRooms();
  } catch (e) {
    showError(err, e.message);
  }
}

function showCreds(out, room) {
  openSheet(`
    <span class="pennant pennant--win">You're in</span>
    <h2 style="margin-top:10px">Get to the lobby</h2>
    <p class="sheet__sub">Match #${out.match_id} · ${esc(room.team_size.toUpperCase())}</p>

    <div class="creds" style="margin-bottom:14px">
      <div class="full"><small>Game name</small><b>${esc(out.game_name)}</b></div>
      <div><small>Room ID</small><b>${esc(out.room_code)}</b></div>
      <div><small>Password</small><b>${esc(out.room_pass)}</b></div>
    </div>

    <div class="kv"><span>Pot</span><b class="mono">${money(out.pot)}</b></div>
    <div class="kv"><span>App commission</span><b class="mono">− ${money(out.commission)}</b></div>
    <div class="kv"><span>Winner receives</span><b class="mono" style="color:var(--win)">${money(out.payout)}</b></div>

    <p class="small muted" style="margin:14px 0 16px">
      Play the match, then mark your win in My Games and upload the result screenshot.
      Payouts are released once an admin confirms the proof.</p>

    <button class="btn btn--win" id="credsCopy">Copy room ID</button>
    <button class="btn btn--ghost" id="credsDone" style="margin-top:8px">Done</button>
  `);

  $('#credsCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(out.room_code); toast('Room ID copied.', 'good'); }
    catch { toast('Copy is blocked — write it down instead.', 'bad'); }
  });
  $('#credsDone').addEventListener('click', closeSheet);
}
