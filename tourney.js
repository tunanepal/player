/* Tunanepal — tournaments.
   Admin-run events. Players register, an admin confirms the slot, and the
   room details unlock by themselves shortly before the match. */

import { rpcAuth } from './api.js';
import { GAMES } from './config.js';
import {
  $, $$, esc, money, when, toast, busy, showError, clearError,
  emptyState, skeletons, openSheet, closeSheet
} from './ui.js';
import { refreshMe } from './session.js';

let list = [];

/* ────────────────────────────────────────────────────────── home section ── */
export async function paintTournaments(slotId, game = null) {
  const slot = $(`#${slotId}`);
  if (!slot) return;
  slot.innerHTML = skeletons(1, 170);

  try {
    list = await rpcAuth('tuna_tournaments', { p_game: game }) || [];
  } catch (e) {
    slot.innerHTML = `<div class="alert alert--bad">${esc(e.message)}</div>`;
    return;
  }

  if (!list.length) {
    slot.innerHTML = `<div class="card card--quiet">${emptyState(
      'No tournaments right now',
      'When we run one it appears here with the prize pool and registration dates.')}</div>`;
    return;
  }

  slot.innerHTML = list.map(card).join('');
  $$('[data-tourn]', slot).forEach((b) =>
    b.addEventListener('click', () => sheet(Number(b.dataset.tourn))));
}

function regPill(t) {
  if (t.my_status === 'confirmed') return '<span class="pill pill--win">Confirmed</span>';
  if (t.my_status === 'pending')   return '<span class="pill pill--wait">Awaiting approval</span>';
  if (t.my_status === 'rejected')  return '<span class="pill pill--bad">Rejected</span>';
  if (t.status === 'live')         return '<span class="pill pill--info">Live now</span>';
  if (t.reg_open_now)              return '<span class="pill pill--win">Registration open</span>';
  if (t.taken >= t.max_slots)      return '<span class="pill pill--bad">Slots full</span>';
  return '<span class="pill">Registration closed</span>';
}

function card(t) {
  const pct = Math.min(100, Math.round((t.taken / t.max_slots) * 100));
  return `
  <article class="tourn">
    ${t.banner_url
      ? `<img class="tourn__banner" src="${esc(t.banner_url)}" alt="" loading="lazy">`
      : `<div class="tourn__banner tourn__banner--blank">
           <span>${esc(GAMES[t.game].short)}</span></div>`}

    <div class="tourn__body">
      <div class="tourn__head">
        <div class="grow">
          <h3>${esc(t.title)}</h3>
          <small>${esc(GAMES[t.game].short)}${t.mode ? ' · ' + esc(t.mode) : ''}${t.map ? ' · ' + esc(t.map) : ''}</small>
        </div>
        ${regPill(t)}
      </div>

      <div class="prizerow">
        <div><small>1st</small><b>${money(t.prize_1)}</b></div>
        <div><small>2nd</small><b>${money(t.prize_2)}</b></div>
        <div><small>3rd</small><b>${money(t.prize_3)}</b></div>
      </div>

      <div class="tourn__meta">
        <span>Starts <b>${esc(when(t.starts_at))}</b></span>
        <span>Entry <b>${t.entry_fee ? money(t.entry_fee) : 'Free'}</b></span>
      </div>

      <div class="slotbar"><i style="width:${pct}%"></i></div>
      <div class="tourn__meta">
        <span class="mono">${t.taken}/${t.max_slots} slots</span>
        ${t.my_slot ? `<span style="color:var(--win)">Your slot #${t.my_slot}</span>` : ''}
      </div>

      ${t.revealed && t.room_id ? `
        <div class="creds" style="margin-bottom:10px">
          <div><small>Room ID</small><b>${esc(t.room_id)}</b></div>
          <div><small>Password</small><b>${esc(t.room_pass || '—')}</b></div>
        </div>` : ''}

      <button class="btn ${t.my_status ? 'btn--ghost' : ''}" data-tourn="${t.id}">
        ${t.my_status ? 'View details' : t.reg_open_now ? 'Register' : 'View details'}
      </button>
    </div>
  </article>`;
}

/* ───────────────────────────────────────────────────────── detail sheet ── */
async function sheet(id) {
  const t = list.find((x) => x.id === id);
  if (!t) return;

  const dates = [
    ['Registration opens', t.reg_opens_at],
    ['Registration closes', t.reg_closes_at],
    ['Match starts', t.starts_at]
  ].filter(([, v]) => v);

  openSheet(`
    <h2>${esc(t.title)}</h2>
    <p class="sheet__sub">${esc(GAMES[t.game].short)}${t.mode ? ' · ' + esc(t.mode) : ''}${t.map ? ' · ' + esc(t.map) : ''}</p>
    <div class="alert alert--bad" id="tErr" hidden></div>

    ${t.my_status === 'confirmed' ? `<div class="alert alert--good">
      Your slot is confirmed. Room ID and password unlock here
      ${t.reveal_minutes} minutes before the match.</div>` : ''}
    ${t.my_status === 'pending' ? `<div class="alert alert--info">
      Registered. An admin is reviewing your entry — you will get a notification
      once your slot is confirmed.</div>` : ''}
    ${t.my_status === 'rejected' ? `<div class="alert alert--bad">
      Your registration was rejected and the entry fee returned.</div>` : ''}

    ${t.revealed && t.room_id ? `
      <p class="eyebrow" style="margin-bottom:8px">Room details</p>
      <div class="creds" style="margin-bottom:16px">
        <div><small>Room ID</small><b>${esc(t.room_id)}</b></div>
        <div><small>Password</small><b>${esc(t.room_pass || '—')}</b></div>
      </div>` : ''}

    <p class="eyebrow" style="margin-bottom:8px">Prize pool ${money(t.prize_pool)}</p>
    <div class="prizerow" style="margin-bottom:16px">
      <div><small>1st</small><b>${money(t.prize_1)}</b></div>
      <div><small>2nd</small><b>${money(t.prize_2)}</b></div>
      <div><small>3rd</small><b>${money(t.prize_3)}</b></div>
    </div>

    ${dates.map(([label, v]) =>
      `<div class="kv"><span>${label}</span><b>${esc(when(v))}</b></div>`).join('')}
    <div class="kv"><span>Entry fee</span><b>${t.entry_fee ? money(t.entry_fee) : 'Free'}</b></div>
    ${t.per_kill ? `<div class="kv"><span>Per kill</span><b>${money(t.per_kill)}</b></div>` : ''}
    <div class="kv"><span>Slots</span><b class="mono">${t.taken}/${t.max_slots}</b></div>

    ${t.rules ? `<p class="eyebrow" style="margin:16px 0 8px">Rules</p>
      <div class="rulebook"><p class="rule-text">${esc(t.rules)}</p></div>` : ''}

    ${!t.my_status && t.reg_open_now ? `
      <label class="field" style="margin-top:14px">
        <span class="label">Your in-game name</span>
        <input id="trIgn" type="text" maxlength="30" placeholder="Exactly as it shows in game">
      </label>
      <label class="field">
        <span class="label">Your in-game ID</span>
        <input id="trUid" class="mono" type="text" inputmode="numeric" maxlength="15" placeholder="Numbers only">
      </label>
      <button class="btn" id="trGo">
        ${t.entry_fee ? `Register · ${money(t.entry_fee)}` : 'Register free'}</button>
      <button class="btn btn--ghost" id="trClose" style="margin-top:8px">Close</button>`
    : `<button class="btn btn--ghost" id="trClose" style="margin-top:16px">Close</button>`}
  `);

  $('#trClose').addEventListener('click', closeSheet);
  $('#trGo')?.addEventListener('click', async (e) => {
    const err = $('#tErr');
    clearError(err);
    const ign = $('#trIgn').value.trim();
    const uid = $('#trUid').value.trim();
    if (ign.length < 2) return showError(err, 'Enter your in-game name.');
    if (!/^\d{5,15}$/.test(uid)) return showError(err, 'Enter your in-game ID — numbers only.');

    try {
      await busy(e.currentTarget, 'Registering…', () => rpcAuth('tuna_tournament_register', {
        p_id: t.id, p_ingame_name: ign, p_ingame_uid: uid
      }));
      closeSheet();
      toast('Registered. An admin will confirm your slot.', 'good');
      await refreshMe();
      paintTournaments('tournSlot');
    } catch (ex) { showError(err, ex.message); }
  });
}

/* ─────────────────────────────────────────────── used by the My games tab ── */
export async function myTournaments() {
  return await rpcAuth('tuna_my_tournaments') || [];
}

export function myTournamentCard(t) {
  const soon = new Date(t.starts_at) - Date.now();
  const mins = Math.round(soon / 60000);
  return `
  <article class="card room">
    <div class="room__top">
      <div class="room__title">
        <span class="pennant pennant--indigo">Tournament</span>
        <h3 style="margin-top:8px">${esc(t.title)}</h3>
        <small>${esc(GAMES[t.game].short)}${t.map ? ' · ' + esc(t.map) : ''} · ${esc(when(t.starts_at))}</small>
      </div>
      ${regPill(t)}
    </div>

    <div class="prizerow">
      <div><small>1st</small><b>${money(t.prize_1)}</b></div>
      <div><small>2nd</small><b>${money(t.prize_2)}</b></div>
      <div><small>3rd</small><b>${money(t.prize_3)}</b></div>
    </div>

    ${t.revealed && t.room_id ? `
      <div class="creds">
        <div><small>Room ID</small><b>${esc(t.room_id)}</b></div>
        <div><small>Password</small><b>${esc(t.room_pass || '—')}</b></div>
      </div>`
    : t.my_status === 'confirmed' ? `
      <p class="xs muted center" style="padding:6px 0">
        Room details unlock ${t.reveal_minutes} minutes before the match${
          mins > 0 && mins < 2880 ? ` · starts in ${mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' hr'}` : ''}.</p>`
    : t.my_status === 'pending' ? `
      <p class="xs muted center" style="padding:6px 0">Waiting for an admin to confirm your slot.</p>`
    : ''}

    ${t.my_slot ? `<div class="kv" style="border:0;padding-bottom:0">
      <span>Your slot</span><b class="mono">#${t.my_slot} · ${esc(t.my_ingame_name || '')}</b></div>` : ''}
  </article>`;
}
