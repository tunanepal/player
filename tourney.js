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
const wired = new Set();

/* One listener per container instead of one per button. Re-rendering the
   list can never leave a dead card behind. */
function delegate(el) {
  if (!el || wired.has(el)) return;
  wired.add(el);
  el.addEventListener('click', (e) => {
    const hit = e.target.closest('[data-tourn]');
    if (!hit || !el.contains(hit)) return;
    sheet(Number(hit.dataset.tourn));
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hit = e.target.closest('[data-tourn]');
    if (!hit) return;
    e.preventDefault();
    sheet(Number(hit.dataset.tourn));
  });
}

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
  delegate(slot);
}

/* My games renders its own cards, so it opts in through this. */
export function wireTournamentCards(el) { delegate(el); }

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
  <article class="tourn tourn--tap" data-tourn="${t.id}" role="button" tabindex="0"
           aria-label="${esc(t.title)} — open details">
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
        <span class="mono">${t.taken}/${t.max_slots} ${t.players_per_team > 1 ? 'teams' : 'slots'}</span>
        ${t.my_slot ? `<span style="color:var(--win)">Your slot #${t.my_slot}</span>` : ''}
      </div>

      ${t.revealed && t.room_id ? `
        <div class="creds" style="margin-bottom:10px">
          <div><small>Room ID</small><b>${esc(t.room_id)}</b></div>
          <div><small>Password</small><b>${esc(t.room_pass || '—')}</b></div>
        </div>` : ''}

      <span class="btn ${t.my_status ? 'btn--ghost' : ''}" role="presentation">
        ${t.my_status ? 'View details' : t.reg_open_now ? 'Register now' : 'View details'}
      </span>
    </div>
  </article>`;
}

/* ───────────────────────────────────────────────────────── detail sheet ── */
async function sheet(id) {
  let t = list.find((x) => x.id === id);
  if (!t) {
    /* opened from My games, where the local list is a different one */
    try {
      const mine = await rpcAuth('tuna_my_tournaments') || [];
      t = mine.find((x) => x.id === id);
    } catch (e) { return toast(e.message, 'bad'); }
  }
  if (!t) return toast('That tournament is no longer listed.', 'bad');

  const dates = [
    ['Registration opens', t.reg_opens_at],
    ['Registration closes', t.reg_closes_at],
    ['Match starts', t.starts_at]
  ].filter(([, v]) => v);

  openSheet(`
    <h2>${esc(t.title)}</h2>
    <p class="sheet__sub">${esc(GAMES[t.game].short)}${t.mode ? ' · ' + esc(t.mode) : ''}${t.map ? ' · ' + esc(t.map) : ''}</p>
    <div class="alert alert--bad" id="tErr" hidden></div>

    ${t.my_roster && t.my_roster.length ? `
      <p class="eyebrow" style="margin-bottom:8px">
        ${t.my_team ? esc(t.my_team) : 'Your entry'}${t.my_slot ? ' · slot #' + t.my_slot : ''}</p>
      <div class="card card--quiet" style="padding:0;margin-bottom:14px">
        ${t.my_roster.map((m, i) => `
          <div class="listrow" style="padding:9px 12px">
            <span class="rosterrow__n">${i === 0 && t.my_roster.length > 1 ? 'C' : i + 1}</span>
            <div class="grow"><b>${esc(m.name)}</b><small class="mono">${esc(m.uid)}</small></div>
          </div>`).join('')}
      </div>` : ''}

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
      <p class="eyebrow" style="margin:18px 0 8px">
        ${t.players_per_team > 1 ? 'Your team' : 'Your details'}</p>

      ${t.players_per_team > 1 ? `
        <div class="alert alert--info">
          One person registers the whole team and pays once. You get the room ID
          — send it to your teammates yourself before the match.
        </div>
        <label class="field">
          <span class="label">Team name</span>
          <input id="trTeam" type="text" maxlength="30" placeholder="e.g. Himal Warriors">
        </label>` : ''}

      ${Array.from({ length: t.players_per_team }, (_, i) => `
        <div class="rosterrow">
          <span class="rosterrow__n">${i === 0 && t.players_per_team > 1 ? 'C' : i + 1}</span>
          <div class="two-up grow">
            <label class="field">
              <span class="label">${i === 0 && t.players_per_team > 1
                ? 'Captain in-game name' : 'In-game name'}</span>
              <input class="tr-name" type="text" maxlength="30" placeholder="As it shows in game">
            </label>
            <label class="field">
              <span class="label">In-game ID</span>
              <input class="tr-uid mono" type="text" inputmode="numeric" maxlength="15" placeholder="Numbers only">
            </label>
          </div>
        </div>`).join('')}

      <button class="btn" id="trGo">
        ${t.entry_fee ? `Register${t.players_per_team > 1 ? ' team' : ''} · ${money(t.entry_fee)}` : 'Register free'}</button>
      <button class="btn btn--ghost" id="trClose" style="margin-top:8px">Close</button>`
    : `<button class="btn btn--ghost" id="trClose" style="margin-top:16px">Close</button>`}
  `);

  $('#trClose').addEventListener('click', closeSheet);
  $('#trGo')?.addEventListener('click', async (e) => {
    const err = $('#tErr');
    clearError(err);

    const names = $$('.tr-name').map((i) => i.value.trim());
    const uids  = $$('.tr-uid').map((i) => i.value.trim());
    const team  = $('#trTeam')?.value.trim() || null;

    for (let i = 0; i < names.length; i++) {
      const who = t.players_per_team > 1 ? `player ${i + 1}` : 'you';
      if (names[i].length < 2) return showError(err, `Enter the in-game name for ${who}.`);
      if (!/^\d{5,15}$/.test(uids[i])) return showError(err, `In-game ID for ${who} must be 5 to 15 digits.`);
    }
    if (t.players_per_team > 1 && !team) return showError(err, 'Enter your team name.');

    const roster = names.map((n, i) => ({ name: n, uid: uids[i] }));

    try {
      await busy(e.currentTarget, 'Registering…', () => rpcAuth('tuna_tournament_register', {
        p_id: t.id, p_roster: roster, p_team_name: team
      }));
      closeSheet();
      toast('Registered. An admin will confirm your slot.', 'good');
      await refreshMe();
      if ($('#tournSlot')) paintTournaments('tournSlot');
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
  <article class="card room tourn--tap" data-tourn="${t.id}" role="button" tabindex="0"
           aria-label="${esc(t.title)} — open details">
    <div class="room__top">
      <div class="room__title">
        <span class="pennant pennant--indigo">Tournament</span>
        <h3 style="margin-top:8px">${esc(t.title)}</h3>
        <small>${esc(GAMES[t.game].short)}${t.map ? ' · ' + esc(t.map) : ''} · ${esc(when(t.starts_at))}</small>
        ${t.my_team ? `<small><b>${esc(t.my_team)}</b>${t.my_roster?.length ? ' · ' + t.my_roster.length + ' players' : ''}</small>` : ''}
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
