/* Tunanepal — My games.
   Every match you have played, and the place you claim a win. */

import { rpcAuth, upload } from './api.js';
import { BUCKET_PROOF } from './config.js';
import {
  $, $$, esc, money, when, toast, busy, showError, clearError,
  emptyState, skeletons, openSheet, closeSheet
} from './ui.js';
import { refreshMe } from './session.js';
import { myTournaments, myTournamentCard, wireTournamentCards } from './tourney.js';

let games = [];
let tourns = [];
let filter = 'all';

export async function showGames() {
  const body = $('#gamesBody');
  if (!games.length) body.innerHTML = skeletons(3, 120);
  try {
    [games, tourns] = await Promise.all([
      rpcAuth('tuna_my_games').then((r) => r || []),
      myTournaments()
    ]);
  } catch (e) { body.innerHTML = emptyState('Could not load', e.message); return; }
  render();
}

function render() {
  const totals = games.reduce((a, g) => {
    if (g.result === 'win') { a.wins++; a.earned += g.earned || 0; }
    if (g.result === 'loss') a.losses++;
    a.staked += g.stake || 0;
    return a;
  }, { wins: 0, losses: 0, earned: 0, staked: 0 });

  const shown = games.filter((g) =>
    filter === 'all' ? true
    : filter === 'live' ? ['playing', 'claimed', 'disputed'].includes(g.status)
    : filter === 'won' ? g.result === 'win'
    : g.result === 'loss');

  $('#gamesBody').innerHTML = `
    <div class="scoreline">
      <div><b class="mono" style="color:var(--win)">${totals.wins}</b><small>Won</small></div>
      <div><b class="mono">${totals.losses}</b><small>Lost</small></div>
      <div><b class="mono" style="color:var(--marigold)">${money(totals.earned)}</b><small>Earned</small></div>
    </div>

    <div class="tabs-inline" id="gFilter">
      <button data-f="all"  aria-pressed="${filter === 'all'}">All</button>
      <button data-f="live" aria-pressed="${filter === 'live'}">In play</button>
      <button data-f="won"  aria-pressed="${filter === 'won'}">Won</button>
      <button data-f="lost" aria-pressed="${filter === 'lost'}">Lost</button>
      <button data-f="tourn" aria-pressed="${filter === 'tourn'}">Tournaments${
        tourns.length ? ` (${tourns.length})` : ''}</button>
    </div>

    ${filter === 'tourn'
      ? (tourns.length ? tourns.map(myTournamentCard).join('')
         : emptyState('No tournaments joined', 'Register for one from the Home tab.'))
      : shown.length ? shown.map(card).join('')
      : emptyState('Nothing here yet', 'Join a room from Home and your matches show up here.')}`;

  $('#gFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    render();
  });

  $$('[data-claim]').forEach((b) =>
    b.addEventListener('click', () => claimSheet(Number(b.dataset.claim))));

  wireTournamentCards($('#gamesBody'));
}

function statusPill(g) {
  if (g.status === 'settled') return g.result === 'win'
    ? `<span class="pill pill--win">Won ${money(g.earned)}</span>`
    : `<span class="pill">Lost</span>`;
  if (g.status === 'disputed') return `<span class="pill pill--bad">Under review</span>`;
  if (g.status === 'void') return `<span class="pill">Voided</span>`;
  if (g.status === 'claimed') return g.claimed_by_me
    ? `<span class="pill pill--wait">Waiting on admin</span>`
    : `<span class="pill pill--wait">Opponent claimed</span>`;
  return `<span class="pill pill--info">In play</span>`;
}

function card(g) {
  const canClaim = g.status === 'playing' || (g.status === 'claimed' && !g.claimed_by_me);
  return `
  <article class="card room">
    <div class="room__top">
      <div class="room__title">
        <h3>${esc(g.team_size.toUpperCase())} · ${esc(g.game === 'pubg' ? 'PUBG' : 'Free Fire')}</h3>
        <small>vs ${esc(g.opponent || 'opponent')} · ${esc(when(g.created_at))}</small>
      </div>
      ${statusPill(g)}
    </div>

    <div class="spec">
      <div><small>You staked</small><b class="mono">${money(g.stake)}</b></div>
      <div><small>Winner gets</small><b class="mono" style="color:var(--win)">${money(g.payout)}</b></div>
    </div>

    ${['playing', 'claimed'].includes(g.status) && g.room_code ? `
      <div class="creds">
        <div class="full"><small>Game name</small><b>${esc(g.game_name || '—')}</b></div>
        <div><small>Room ID</small><b>${esc(g.room_code)}</b></div>
        <div><small>Password</small><b>${esc(g.room_pass || '—')}</b></div>
      </div>` : ''}

    ${g.admin_note ? `<p class="xs muted">Admin: ${esc(g.admin_note)}</p>` : ''}

    ${canClaim
      ? `<button class="btn btn--win" data-claim="${g.id}">I won this match</button>`
      : g.status === 'claimed' && g.claimed_by_me
        ? `<p class="xs muted center">Proof sent. An admin is checking it.</p>`
        : ''}
  </article>`;
}

/* ─────────────────────────────────────────────────────────── claim a win ── */
function claimSheet(id) {
  const g = games.find((x) => x.id === id);
  openSheet(`
    <h2>Claim your win</h2>
    <p class="sheet__sub">Match #${g.id} · ${esc(g.team_size.toUpperCase())} vs ${esc(g.opponent)}</p>
    <div class="alert alert--bad" id="clErr" hidden></div>

    <div class="stakebox">
      <div><small>Payout if confirmed</small><b>${money(g.payout)}</b></div>
      <div class="win-line">Pot ${money(g.pot)}<b>− ${money(g.commission)} fee</b></div>
    </div>

    <label class="field">
      <span class="label">Result screenshot</span>
      <div class="filepick" id="clPick">
        <input type="file" id="clFile" accept="image/jpeg,image/png,image/webp">
        <span id="clLabel">Tap to choose your winning screenshot</span>
      </div>
      <span class="hint">Show the final scoreboard clearly. Fake proof gets your account blocked.</span>
    </label>

    <button class="btn btn--win" id="clGo">Send proof</button>
    <button class="btn btn--ghost" id="clCancel" style="margin-top:8px">Cancel</button>
  `);

  $('#clFile').addEventListener('change', () => {
    const f = $('#clFile').files[0];
    $('#clLabel').textContent = f ? `✓ ${f.name.slice(0, 28)}` : 'Tap to choose your winning screenshot';
    $('#clPick').toggleAttribute('data-has', !!f);
  });

  $('#clCancel').addEventListener('click', closeSheet);

  $('#clGo').addEventListener('click', async (e) => {
    const err = $('#clErr'); clearError(err);
    const file = $('#clFile').files[0];
    if (!file) return showError(err, 'Attach your winning screenshot.');
    try {
      const out = await busy(e.currentTarget, 'Uploading…', async () => {
        const url = await upload(BUCKET_PROOF, file);
        return rpcAuth('tuna_claim_win', { p_match: g.id, p_proof: url });
      });
      closeSheet();
      toast(out.status === 'disputed'
        ? 'Both players claimed this one. An admin will decide.'
        : 'Proof sent. Your payout is released once it is confirmed.', 'good');
      await refreshMe();
      showGames();
    } catch (ex) { showError(err, ex.message); }
  });
}
