/* Tunanepal — Customs.
   Post a room with your own rules. Your stake is held the moment you post,
   and comes straight back if nobody joins inside ten minutes. */

import { rpcAuth } from './api.js';
import { TEAM_SIZES, GUN_TYPES } from './config.js';
import {
  $, $$, esc, money, mmss, onTick, toast, busy, showError, clearError, emptyState
} from './ui.js';
import { state, refreshMe } from './session.js';

let game = 'pubg';
let myRoom = null;
let stopTick = null;

const form = {
  team_size: '1v1',
  gun_type: 'AR',
  headshot: true,
  limited_ammo: false,
  throwables: true,
  gun_attr: false,
  char_skill: false
};

const FF_RULES = [
  ['headshot',     'Headshot only'],
  ['limited_ammo', 'Limited ammo'],
  ['throwables',   'Throwables'],
  ['gun_attr',     'Gun attributes'],
  ['char_skill',   'Character skills']
];

export async function showCustoms() {
  render();
  await loadMyRoom();
}

export function leaveCustoms() {
  if (stopTick) { stopTick(); stopTick = null; }
}

/* ────────────────────────────────────────────────────────────── rendering ── */
function render() {
  $('#customsBody').innerHTML = `
    <div class="gamepick" id="cGamePick">
      <button data-g="pubg" aria-pressed="${game === 'pubg'}">
        <span class="g-mark"></span><span class="g-name">PUBG</span>
        <span class="g-count">Post a room</span>
      </button>
      <button data-g="freefire" aria-pressed="${game === 'freefire'}">
        <span class="g-mark"></span><span class="g-name">Free Fire</span>
        <span class="g-count">Post a room</span>
      </button>
    </div>

    <div id="myRoomSlot"></div>

    <div class="card" style="margin-top:16px">
      <div class="alert alert--bad" id="cErr" hidden></div>

      <label class="field">
        <span class="label">Players</span>
        <div class="seg" id="segTeam">
          ${TEAM_SIZES.map((t) => `<button type="button" data-v="${t}"
            aria-pressed="${form.team_size === t}">${t}</button>`).join('')}
        </div>
      </label>

      ${game === 'pubg' ? `
      <label class="field">
        <span class="label">Gun type</span>
        <div class="seg" id="segGun">
          ${GUN_TYPES.map((g) => `<button type="button" data-v="${g}"
            aria-pressed="${form.gun_type === g}">${g}</button>`).join('')}
        </div>
      </label>` : `
      ${FF_RULES.map(([key, label]) => `
      <label class="field">
        <span class="label">${label}</span>
        <div class="seg seg--yn" data-rule="${key}">
          <button type="button" data-v="1" aria-pressed="${form[key] === true}">Yes</button>
          <button type="button" data-v="0" aria-pressed="${form[key] === false}">No</button>
        </div>
      </label>`).join('')}`}

      <hr class="divider">

      <label class="field">
        <span class="label">Amount each side puts in</span>
        <div class="chiprow" id="amtChips">
          ${[20, 50, 100, 200, 500].map((a) =>
            `<button type="button" data-a="${a}">${a}</button>`).join('')}
        </div>
        <input id="cAmount" class="mono" type="number" inputmode="numeric" min="1" placeholder="Enter amount">
        <span class="hint" id="potHint">Winner takes the pot minus 12% commission.</span>
      </label>

      <label class="field">
        <span class="label">Game name (in-game lobby name)</span>
        <input id="cGameName" type="text" maxlength="40" placeholder="Shown only after someone joins">
      </label>

      <div class="two-up">
        <label class="field">
          <span class="label">Room ID</span>
          <input id="cRoomId" class="mono" type="text" maxlength="20" placeholder="e.g. 88123456">
        </label>
        <label class="field">
          <span class="label">Room password</span>
          <input id="cRoomPass" class="mono" type="text" maxlength="20" placeholder="e.g. 4477">
        </label>
      </div>

      <p class="xs muted" style="margin-bottom:14px">
        The game name, room ID and password stay hidden from everyone until an
        opponent pays in. Your stake is held now and returned if nobody joins.
      </p>

      <button class="btn" id="cSubmit">Post room</button>
    </div>`;

  wire();
}

function wire() {
  $('#cGamePick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-g]');
    if (!b || b.dataset.g === game) return;
    game = b.dataset.g;
    render();
    loadMyRoom();
  });

  segment('#segTeam', (v) => { form.team_size = v; });
  segment('#segGun', (v) => { form.gun_type = v; });

  $$('[data-rule]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      form[seg.dataset.rule] = b.dataset.v === '1';
      [...seg.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    });
  });

  $('#amtChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    $('#cAmount').value = b.dataset.a;
    $$('#amtChips button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    updatePot();
  });

  $('#cAmount').addEventListener('input', updatePot);
  $('#cSubmit').addEventListener('click', submit);
}

function segment(sel, set) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    set(b.dataset.v);
    [...el.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  });
}

function updatePot() {
  const a = parseInt($('#cAmount').value, 10);
  const hint = $('#potHint');
  if (!a || a < 1) {
    hint.textContent = 'Winner takes the pot minus 12% commission.';
    return;
  }
  const pot = a * 2;
  hint.innerHTML = `Pot ${money(pot)} · commission ${money(Math.round(pot * 0.12))} ·
    <b style="color:var(--win)">winner gets ${money(Math.round(pot * 0.88))}</b>`;
}

/* ───────────────────────────────────────────────────────── your open room ── */
async function loadMyRoom() {
  try { myRoom = await rpcAuth('tuna_my_room'); }
  catch (e) { myRoom = null; toast(e.message, 'bad'); }
  paintMyRoom();
}

function paintMyRoom() {
  const slot = $('#myRoomSlot');
  if (!slot) return;

  if (!myRoom) {
    slot.innerHTML = '';
    if (stopTick) { stopTick(); stopTick = null; }
    return;
  }

  slot.innerHTML = `
    <div class="card room" style="margin-top:16px;border-color:var(--crimson)">
      <div class="room__top">
        <div class="room__title">
          <span class="pennant">Waiting for opponent</span>
          <h3 style="margin-top:8px">${esc(myRoom.team_size.toUpperCase())} ·
            ${esc(myRoom.game === 'pubg' ? 'PUBG' : 'Free Fire')}</h3>
          <small>Your room is live on the Home tab</small>
        </div>
        <div class="room__stake"><b>${money(myRoom.amount)}</b><small>per side</small></div>
      </div>
      <div class="creds">
        <div class="full"><small>Game name</small><b>${esc(myRoom.game_name || '—')}</b></div>
        <div><small>Room ID</small><b>${esc(myRoom.room_code || '—')}</b></div>
        <div><small>Password</small><b>${esc(myRoom.room_pass || '—')}</b></div>
      </div>
      <div class="room__foot">
        <div class="fuse">
          <span class="fuse__track"><i class="fuse__fill" id="myFuse"></i></span>
          <span class="fuse__time" id="myClock">—</span>
        </div>
        <button class="btn btn--ghost btn--sm" id="cCancel">Cancel</button>
      </div>
    </div>`;

  $('#cCancel').addEventListener('click', async (e) => {
    try {
      await busy(e.currentTarget, 'Cancelling…', () =>
        rpcAuth('tuna_cancel_room', { p_room: myRoom.id }));
      toast('Room cancelled. Your stake is back.', 'good');
      myRoom = null;
      paintMyRoom();
      refreshMe();
    } catch (ex) { toast(ex.message, 'bad'); }
  });

  if (stopTick) stopTick();
  stopTick = onTick(tick);
  tick();
}

function tick() {
  if (!myRoom) return;
  const fill = $('#myFuse'), clock = $('#myClock');
  if (!fill || !clock) return;
  const left = new Date(myRoom.expires_at) - Date.now();
  const total = new Date(myRoom.expires_at) - new Date(myRoom.created_at);
  if (left <= 0) {
    clock.textContent = '0:00';
    fill.style.width = '0%';
    myRoom = null;
    paintMyRoom();
    refreshMe();
    return;
  }
  clock.textContent = mmss(left);
  fill.style.width = `${(left / total) * 100}%`;
  fill.toggleAttribute('data-low', left < 180000);
  fill.toggleAttribute('data-out', left < 60000);
}

/* ─────────────────────────────────────────────────────────────── posting ── */
async function submit(e) {
  const err = $('#cErr');
  clearError(err);

  const amount = parseInt($('#cAmount').value, 10);
  const gameName = $('#cGameName').value.trim();
  const roomId = $('#cRoomId').value.trim();
  const roomPass = $('#cRoomPass').value.trim();

  if (!amount || amount < 1) return showError(err, 'Enter the amount each side puts in.');
  if (amount > state.player.points)
    return showError(err, `Not enough points. You have ${money(state.player.points)} — load your wallet first.`);
  if (!gameName) return showError(err, 'Enter the game name.');
  if (!roomId) return showError(err, 'Enter the room ID.');
  if (!roomPass) return showError(err, 'Enter the room password.');

  const args = {
    p_game: game,
    p_team_size: form.team_size,
    p_amount: amount,
    p_game_name: gameName,
    p_room_code: roomId,
    p_room_pass: roomPass
  };
  if (game === 'pubg') {
    args.p_gun_type = form.gun_type;
  } else {
    args.p_headshot = form.headshot;
    args.p_limited_ammo = form.limited_ammo;
    args.p_throwables = form.throwables;
    args.p_gun_attr = form.gun_attr;
    args.p_char_skill = form.char_skill;
  }

  try {
    const out = await busy(e.currentTarget, 'Posting…', () => rpcAuth('tuna_create_room', args));
    myRoom = out.room;
    await refreshMe();
    toast('Room posted. It is live on Home for ten minutes.', 'good');
    $('#cAmount').value = ''; $('#cGameName').value = '';
    $('#cRoomId').value = ''; $('#cRoomPass').value = '';
    updatePot();
    paintMyRoom();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (ex) {
    showError(err, ex.message);
  }
}
