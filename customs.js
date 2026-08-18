/* Tunanepal — Customs.
   Post a room with every setting pinned down, so the joiner knows exactly
   what they are walking into and nobody can argue about it afterwards. */

import { rpcAuth } from './api.js';
import {
  $, $$, esc, money, mmss, onTick, toast, busy, showError, clearError
} from './ui.js';
import { state, refreshMe } from './session.js';

/* ─────────────────────────────────────────────── what each game can set ──
   choice → a row of buttons, one selected
   yn     → yes / no
   Anything flagged `opt` is stored in the room's options JSON, so new
   settings can be added here without another database migration.        */
export const SCHEMA = {
  pubg: {
    label: 'PUBG Mobile',
    fields: [
      { key: 'match_type', label: 'Match type', type: 'choice',
        values: ['TDM', 'Classic', 'Arena', 'Sniper Training', 'Domination'], def: 'TDM' },
      { key: 'team_size', label: 'Players', type: 'choice',
        values: ['1v1', '2v2', '4v4'], def: '1v1' },
      { key: 'map', label: 'Map', type: 'choice',
        values: ['Warehouse', 'Ruins', 'Hangar', 'Erangel', 'Miramar', 'Sanhok', 'Livik'], def: 'Warehouse' },
      { key: 'gun_type', label: 'Gun type', type: 'choice',
        values: ['AR', 'SMG', 'SNIPER', 'SHOTGUN', 'PISTOL', 'All guns'], def: 'AR' },
      { key: 'rounds', label: 'Rounds', type: 'choice',
        values: ['3', '5', '7', '10'], def: '5' },
      { key: 'perspective', label: 'Perspective', type: 'choice',
        values: ['TPP', 'FPP'], def: 'TPP', opt: true },
      { key: 'scope', label: 'Scopes allowed', type: 'yn', def: true, opt: true },
      { key: 'grenades', label: 'Grenades', type: 'yn', def: false, opt: true },
      { key: 'healing', label: 'Healing items', type: 'yn', def: false, opt: true },
      { key: 'vehicles', label: 'Vehicles', type: 'yn', def: false, opt: true },
      { key: 'level4_helmet', label: 'Level 4 helmet', type: 'yn', def: false, opt: true },
      { key: 'gun_chips', label: 'Gun chips', type: 'yn', def: false, opt: true },
      { key: 'loadout', label: 'Loadout compulsory', type: 'yn', def: true, opt: true },
      { key: 'spectators', label: 'Spectators allowed', type: 'yn', def: false, opt: true }
    ]
  },
  freefire: {
    label: 'Free Fire',
    fields: [
      { key: 'match_type', label: 'Match type', type: 'choice',
        values: ['Clash Squad', 'Battle Royale', 'Lone Wolf'], def: 'Clash Squad' },
      { key: 'team_size', label: 'Players', type: 'choice',
        values: ['1v1', '2v2', '3v3', '4v4'], def: '1v1' },
      { key: 'map', label: 'Map', type: 'choice',
        values: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra'], def: 'Bermuda' },
      { key: 'rounds', label: 'Rounds', type: 'choice',
        values: ['7', '9', '13'], def: '7' },
      { key: 'coins', label: 'Starting coins', type: 'choice',
        values: ['500', '1000', '2000', '5000', '9000'], def: '5000', opt: true },
      { key: 'gun_limit', label: 'Gun restriction', type: 'choice',
        values: ['All guns', 'AR only', 'SMG only', 'Sniper only', 'Shotgun only', 'Pistol only'],
        def: 'All guns', opt: true },
      { key: 'headshot', label: 'Headshot only', type: 'yn', def: true },
      { key: 'limited_ammo', label: 'Limited ammo', type: 'yn', def: false },
      { key: 'throwables', label: 'Throwables', type: 'yn', def: false },
      { key: 'gun_attr', label: 'Gun attributes', type: 'yn', def: false },
      { key: 'char_skill', label: 'Character skills', type: 'yn', def: false },
      { key: 'advanced_settings', label: 'Advanced settings', type: 'yn', def: true, opt: true },
      { key: 'loadout', label: 'Loadout compulsory', type: 'yn', def: true, opt: true },
      { key: 'airdrop', label: 'Airdrops', type: 'yn', def: false, opt: true },
      { key: 'gloo_meter', label: 'Gloo wall meter', type: 'yn', def: false, opt: true },
      { key: 'turrets', label: 'Turrets', type: 'yn', def: false, opt: true },
      { key: 'random_store', label: 'Random store', type: 'yn', def: false, opt: true },
      { key: 'spectators', label: 'Spectators allowed', type: 'yn', def: false, opt: true }
    ]
  }
};

let game = 'pubg';
let values = {};
let myRoom = null;
let stopTick = null;

function resetValues() {
  values = {};
  for (const f of SCHEMA[game].fields) values[f.key] = f.def;
}

export async function showCustoms() {
  if (!Object.keys(values).length) resetValues();
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

      <p class="eyebrow" style="margin-bottom:10px">Match settings</p>
      ${SCHEMA[game].fields.map(fieldHTML).join('')}

      <hr class="divider">
      <p class="eyebrow" style="margin-bottom:10px">Stake</p>

      <label class="field">
        <span class="label">Amount each side puts in</span>
        <div class="chiprow" id="amtChips">
          ${[10, 20, 30, 50, 100, 200, 500].map((a) =>
            `<button type="button" data-a="${a}">${a}</button>`).join('')}
        </div>
        <input id="cAmount" class="mono" type="number" inputmode="numeric" min="1" placeholder="Enter amount">
        <span class="hint" id="potHint">Winner takes the pot minus 12% commission.</span>
      </label>

      <hr class="divider">
      <p class="eyebrow" style="margin-bottom:10px">Room details — hidden until someone joins</p>

      <label class="field">
        <span class="label">Game name (your in-game name)</span>
        <input id="cGameName" type="text" maxlength="40" placeholder="So your opponent can find you">
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

      <div class="alert alert--info">
        Set your in-game room to match these settings exactly. If it does not
        match, the joiner can claim a refund and you lose the stake.
      </div>

      <button class="btn" id="cSubmit">Post room</button>
    </div>`;

  wire();
}

function fieldHTML(f) {
  if (f.type === 'yn') {
    return `<label class="field field--tight">
      <span class="label">${esc(f.label)}</span>
      <div class="seg seg--yn" data-f="${f.key}">
        <button type="button" data-v="1" aria-pressed="${values[f.key] === true}">Yes</button>
        <button type="button" data-v="0" aria-pressed="${values[f.key] === false}">No</button>
      </div>
    </label>`;
  }
  return `<label class="field field--tight">
    <span class="label">${esc(f.label)}</span>
    <div class="seg seg--wrap" data-f="${f.key}">
      ${f.values.map((v) => `<button type="button" data-v="${esc(v)}"
        aria-pressed="${String(values[f.key]) === String(v)}">${esc(v)}</button>`).join('')}
    </div>
  </label>`;
}

function wire() {
  $('#cGamePick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-g]');
    if (!b || b.dataset.g === game) return;
    game = b.dataset.g;
    resetValues();
    render();
    loadMyRoom();
  });

  $$('[data-f]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const key = seg.dataset.f;
      const f = SCHEMA[game].fields.find((x) => x.key === key);
      values[key] = f.type === 'yn' ? b.dataset.v === '1' : b.dataset.v;
      [...seg.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    });
  });

  $('#amtChips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    $('#cAmount').value = b.dataset.a;
    [...$('#amtChips').children].forEach((c) => c.toggleAttribute('data-on', c === b));
    updatePot();
  });

  $('#cAmount').addEventListener('input', updatePot);
  $('#cSubmit').addEventListener('click', submit);
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
          <h3 style="margin-top:8px">${esc((myRoom.team_size || '').toUpperCase())} ·
            ${esc(myRoom.match_type || (myRoom.game === 'pubg' ? 'PUBG' : 'Free Fire'))}</h3>
          <small>Live on the Home tab now</small>
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
  if (!gameName) return showError(err, 'Enter your in-game name.');
  if (!roomId) return showError(err, 'Enter the room ID.');
  if (!roomPass) return showError(err, 'Enter the room password.');

  const options = {};
  const args = {
    p_game: game,
    p_amount: amount,
    p_game_name: gameName,
    p_room_code: roomId,
    p_room_pass: roomPass
  };

  for (const f of SCHEMA[game].fields) {
    const v = values[f.key];
    if (f.opt) { options[f.key] = v; continue; }
    if (f.key === 'team_size') args.p_team_size = v;
    else if (f.key === 'rounds') args.p_rounds = parseInt(v, 10) || null;
    else args['p_' + f.key] = v;
  }
  args.p_options = options;

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
