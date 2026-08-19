/* Tunanepal — Load.
   Three jobs: put money in, take money out, buy PUBG UC. */

import { rpcAuth, upload } from './api.js';
import { BUCKET_PROOF } from './config.js';
import {
  $, $$, esc, money, when, toast, busy, showError, clearError, emptyState, skeletons
} from './ui.js';
import { state, refreshMe } from './session.js';

let tab = 'deposit';
let method = 'esewa';
let qr = null;
let packs = [];
let chosenPack = null;
let history = null;

export async function showLoad() {
  render();
  await Promise.all([loadHistory(), tab === 'deposit' ? loadQr() : null]);
}

function render() {
  $('#loadBody').innerHTML = `
    <div class="balance-card">
      <small>Your balance</small>
      <b class="mono">${money(state.player?.points || 0)}</b>
    </div>

    <div class="tabs-inline" id="loadTabs">
      <button data-t="deposit"  aria-pressed="${tab === 'deposit'}">Deposit</button>
      <button data-t="withdraw" aria-pressed="${tab === 'withdraw'}">Withdraw</button>
      <button data-t="store"    aria-pressed="${tab === 'store'}">PUBG UC store</button>
    </div>

    <div id="loadPane"></div>
    <div id="loadHistory"></div>`;

  $('#loadTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (!b || b.dataset.t === tab) return;
    tab = b.dataset.t;
    showLoad();
  });

  if (tab === 'deposit') paneDeposit();
  if (tab === 'withdraw') paneWithdraw();
  if (tab === 'store') paneStore();
}

/* ═══════════════════════════════════════════════════════════════ DEPOSIT ══ */
function paneDeposit() {
  $('#loadPane').innerHTML = `
    <div class="notice-red">
      <span class="notice-red__mark">⚠</span>
      <div>
        <b>Please note ➤</b>
        <p>Aafno wallet bata matrai pay garnu hola ra Rs 100 vanda tala ko
           payment accepted hune chaina.</p>
      </div>
    </div>

    <div class="card">
      <div class="alert alert--bad" id="dErr" hidden></div>

      <label class="field">
        <span class="label">Pay with</span>
        <div class="seg" id="segMethod">
          <button type="button" data-v="esewa"  aria-pressed="${method === 'esewa'}">eSewa</button>
          <button type="button" data-v="khalti" aria-pressed="${method === 'khalti'}">Khalti</button>
        </div>
      </label>

      <div id="qrSlot">${skeletons(1, 200)}</div>

      <label class="field">
        <span class="label">Amount you sent</span>
        <div class="chiprow" id="dChips">
          ${[100, 200, 500, 1000, 2000].map((a) =>
            `<button type="button" data-a="${a}">${a}</button>`).join('')}
        </div>
        <input id="dAmount" class="mono" type="number" inputmode="numeric" min="1" placeholder="Enter amount">
      </label>

      <div class="two-up">
        <label class="field">
          <span class="label">Your name on the wallet</span>
          <input id="dName" type="text" maxlength="40" placeholder="Account holder name">
        </label>
        <label class="field">
          <span class="label">Number you paid from</span>
          <input id="dPhone" class="mono" type="tel" inputmode="numeric" maxlength="14" placeholder="98XXXXXXXX">
        </label>
      </div>

      <label class="field">
        <span class="label">Payment screenshot</span>
        <div class="filepick" id="dPick">
          <input type="file" id="dFile" accept="image/jpeg,image/png,image/webp">
          <span id="dFileLabel">Tap to choose the screenshot</span>
        </div>
        <span class="hint">Must clearly show the amount and transaction ID.</span>
      </label>

      <button class="btn btn--marigold" id="dSubmit">Submit deposit</button>
      <p class="xs muted center" style="margin-top:10px">
        An admin checks it and your points appear, usually within minutes.</p>
    </div>`;

  $('#segMethod').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.dataset.v === method) return;
    method = b.dataset.v;
    [...$('#segMethod').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    loadQr();
  });

  chips('#dChips', '#dAmount');
  filePicker('#dFile', '#dFileLabel');
  $('#dSubmit').addEventListener('click', submitDeposit);
}

async function loadQr() {
  const slot = $('#qrSlot');
  if (!slot) return;
  let failed = null;
  try {
    qr = await rpcAuth('tuna_active_qr', { p_method: method });
  } catch (e) { qr = null; failed = e.message; }

  if (failed) {
    slot.innerHTML = `<div class="alert alert--bad">${esc(failed)}</div>`;
    return;
  }
  if (!qr) {
    slot.innerHTML = `<div class="alert alert--info">
      No ${method === 'esewa' ? 'eSewa' : 'Khalti'} QR is active right now.
      Try the other wallet, or check back shortly.</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="qrbox">
      <img src="${esc(qr.image_url)}" alt="${esc(method)} QR code" loading="lazy">
      <div class="qrbox__meta">
        ${qr.wallet_name ? `<div class="kv"><span>Account name</span><b>${esc(qr.wallet_name)}</b></div>` : ''}
        ${qr.wallet_no ? `<div class="kv"><span>Number</span><b class="mono">${esc(qr.wallet_no)}</b></div>` : ''}
        <p class="xs muted" style="margin-top:8px">
          Scan this in your ${method === 'esewa' ? 'eSewa' : 'Khalti'} app, pay, then fill the form below.</p>
      </div>
    </div>`;
}

async function submitDeposit(e) {
  const err = $('#dErr');
  clearError(err);

  const amount = parseInt($('#dAmount').value, 10);
  const name = $('#dName').value.trim();
  const phone = $('#dPhone').value.trim();
  const file = $('#dFile').files[0];

  if (!amount || amount < 1) return showError(err, 'Enter the amount you sent.');
  if (!name) return showError(err, 'Enter the name on the wallet you paid from.');
  if (!phone) return showError(err, 'Enter the number you paid from.');
  if (!file) return showError(err, 'Attach the payment screenshot.');

  try {
    await busy(e.currentTarget, 'Uploading…', async () => {
      const url = await upload(BUCKET_PROOF, file);
      await rpcAuth('tuna_deposit', {
        p_amount: amount, p_method: method,
        p_sender_name: name, p_sender_phone: phone, p_screenshot: url
      });
    });
    toast('Deposit submitted. An admin will confirm it shortly.', 'good');
    showLoad();
  } catch (ex) { showError(err, ex.message); }
}

/* ══════════════════════════════════════════════════════════════ WITHDRAW ══ */
function paneWithdraw() {
  const bal = state.player?.points || 0;
  $('#loadPane').innerHTML = `
    <div class="card">
      <div class="alert alert--bad" id="wErr" hidden></div>

      ${bal < 100 ? `<div class="alert alert--info">
        Minimum withdrawal is Rs 100. You have ${money(bal)}.</div>` : ''}

      <label class="field">
        <span class="label">Amount to withdraw</span>
        <div class="chiprow" id="wChips">
          ${[100, 500, 1000].map((a) => `<button type="button" data-a="${a}">${a}</button>`).join('')}
          <button type="button" data-a="${bal}">All (${bal})</button>
        </div>
        <input id="wAmount" class="mono" type="number" inputmode="numeric" min="100" max="${bal}" placeholder="Enter amount">
        <span class="hint">Available: ${money(bal)}</span>
      </label>

      <label class="field">
        <span class="label">Receive in</span>
        <div class="seg" id="segWallet">
          <button type="button" data-v="eSewa"  aria-pressed="true">eSewa</button>
          <button type="button" data-v="Khalti" aria-pressed="false">Khalti</button>
          <button type="button" data-v="Bank"   aria-pressed="false">Bank</button>
        </div>
      </label>

      <div class="two-up">
        <label class="field">
          <span class="label">Wallet number</span>
          <input id="wNumber" class="mono" type="text" maxlength="30" placeholder="98XXXXXXXX">
        </label>
        <label class="field">
          <span class="label">Name on the wallet</span>
          <input id="wName" type="text" maxlength="40" placeholder="Account holder name">
        </label>
      </div>

      <p class="xs muted" style="margin-bottom:14px">
        The amount is held as soon as you request it, so it cannot be staked in
        a room while you wait. If the request is rejected it comes back in full.</p>

      <button class="btn" id="wSubmit" ${bal < 100 ? 'disabled' : ''}>Request withdrawal</button>
    </div>`;

  chips('#wChips', '#wAmount');
  let wallet = 'eSewa';
  $('#segWallet').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    wallet = b.dataset.v;
    [...$('#segWallet').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
  });

  $('#wSubmit').addEventListener('click', async (e) => {
    const err = $('#wErr'); clearError(err);
    const amount = parseInt($('#wAmount').value, 10);
    const number = $('#wNumber').value.trim();
    const name = $('#wName').value.trim();

    if (!amount || amount < 100) return showError(err, 'Minimum withdrawal is Rs 100.');
    if (amount > bal) return showError(err, `Not enough points. You have ${money(bal)}.`);
    if (!number) return showError(err, 'Enter your wallet number.');
    if (!name) return showError(err, 'Enter the name on the wallet.');

    try {
      await busy(e.currentTarget, 'Sending…', () => rpcAuth('tuna_withdraw', {
        p_amount: amount, p_wallet_type: wallet, p_wallet_no: number, p_wallet_name: name
      }));
      await refreshMe();
      toast('Withdrawal requested. An admin will pay it out.', 'good');
      showLoad();
    } catch (ex) { showError(err, ex.message); }
  });
}

/* ═════════════════════════════════════════════════════════════════ STORE ══ */
async function paneStore() {
  $('#loadPane').innerHTML = `<div id="packSlot">${skeletons(2, 70)}</div>`;
  try { packs = await rpcAuth('tuna_uc_packs') || []; }
  catch (e) {
    $('#packSlot').innerHTML = `<div class="alert alert--bad">${esc(e.message)}</div>`;
    return;
  }

  if (!packs.length) {
    $('#packSlot').innerHTML = emptyState('Store is empty', 'UC packs will appear here soon.');
    return;
  }

  $('#packSlot').innerHTML = `
    <p class="small muted" style="margin-bottom:12px">
      Pick a pack, pay by QR, then send us your PUBG ID. UC is delivered to
      your account after the payment is confirmed.</p>
    <div class="packgrid">
      ${packs.map((p) => `
        <button class="pack" data-p="${p.id}">
          <b>${esc(p.title)}</b>
          <small>${p.uc_amount} UC</small>
          <span class="pack__price mono">${money(p.price)}</span>
        </button>`).join('')}
    </div>
    <div id="packForm"></div>`;

  $$('.pack').forEach((b) => b.addEventListener('click', () => {
    chosenPack = packs.find((p) => p.id === Number(b.dataset.p));
    $$('.pack').forEach((x) => x.toggleAttribute('data-on', x === b));
    packForm();
  }));
}

async function packForm() {
  const p = chosenPack;
  $('#packForm').innerHTML = `
    <div class="card" style="margin-top:14px">
      <div class="alert alert--bad" id="sErr" hidden></div>
      <div class="kv"><span>Pack</span><b>${esc(p.title)} · ${p.uc_amount} UC</b></div>
      <div class="kv"><span>Price</span><b class="mono">${money(p.price)}</b></div>

      <label class="field" style="margin-top:14px">
        <span class="label">Pay with</span>
        <div class="seg" id="segSMethod">
          <button type="button" data-v="esewa" aria-pressed="true">eSewa</button>
          <button type="button" data-v="khalti" aria-pressed="false">Khalti</button>
        </div>
      </label>

      <div id="sQrSlot">${skeletons(1, 180)}</div>

      <label class="field">
        <span class="label">Your PUBG ID</span>
        <input id="sPubg" class="mono" type="text" maxlength="20" placeholder="Numbers from your PUBG profile">
      </label>

      <div class="two-up">
        <label class="field">
          <span class="label">Wallet number you paid from</span>
          <input id="sNumber" class="mono" type="text" maxlength="20" placeholder="98XXXXXXXX">
        </label>
        <label class="field">
          <span class="label">Name on that wallet</span>
          <input id="sName" type="text" maxlength="40" placeholder="Account holder name">
        </label>
      </div>

      <label class="field">
        <span class="label">Payment screenshot</span>
        <div class="filepick" id="sPick">
          <input type="file" id="sFile" accept="image/jpeg,image/png,image/webp">
          <span id="sFileLabel">Tap to choose the screenshot</span>
        </div>
      </label>

      <button class="btn btn--marigold" id="sSubmit">Order ${p.uc_amount} UC</button>
    </div>`;

  let sMethod = 'esewa';
  const paintQr = async () => {
    let q = null, qErr = null;
    try { q = await rpcAuth('tuna_active_qr', { p_method: sMethod }); }
    catch (e) { qErr = e.message; }
    if (qErr) { $('#sQrSlot').innerHTML = `<div class="alert alert--bad">${esc(qErr)}</div>`; return; }
    $('#sQrSlot').innerHTML = q
      ? `<div class="qrbox"><img src="${esc(q.image_url)}" alt="QR" loading="lazy">
           <div class="qrbox__meta">
             ${q.wallet_name ? `<div class="kv"><span>Name</span><b>${esc(q.wallet_name)}</b></div>` : ''}
             ${q.wallet_no ? `<div class="kv"><span>Number</span><b class="mono">${esc(q.wallet_no)}</b></div>` : ''}
           </div></div>`
      : `<div class="alert alert--info">No QR active for that wallet right now.</div>`;
  };
  await paintQr();

  $('#segSMethod').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    sMethod = b.dataset.v;
    [...$('#segSMethod').children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    paintQr();
  });

  filePicker('#sFile', '#sFileLabel');

  $('#sSubmit').addEventListener('click', async (e) => {
    const err = $('#sErr'); clearError(err);
    const pubg = $('#sPubg').value.trim();
    const number = $('#sNumber').value.trim();
    const name = $('#sName').value.trim();
    const file = $('#sFile').files[0];

    if (!pubg) return showError(err, 'Enter your PUBG ID.');
    if (!number) return showError(err, 'Enter the wallet number you paid from.');
    if (!name) return showError(err, 'Enter the name on that wallet.');
    if (!file) return showError(err, 'Attach the payment screenshot.');

    try {
      await busy(e.currentTarget, 'Sending…', async () => {
        const url = await upload(BUCKET_PROOF, file);
        await rpcAuth('tuna_buy_uc', {
          p_pack: p.id, p_pubg_id: pubg,
          p_wallet_no: number, p_wallet_name: name, p_screenshot: url
        });
      });
      toast('Order placed. UC arrives once payment is confirmed.', 'good');
      chosenPack = null;
      showLoad();
    } catch (ex) { showError(err, ex.message); }
  });
}

/* ═══════════════════════════════════════════════════════════════ HISTORY ══ */
async function loadHistory() {
  try { history = await rpcAuth('tuna_history'); }
  catch (e) { toast(e.message, 'bad'); return; }

  const rows = tab === 'deposit' ? history.deposits
             : tab === 'withdraw' ? history.withdrawals
             : history.purchases;

  const title = tab === 'deposit' ? 'Your deposits'
              : tab === 'withdraw' ? 'Your withdrawals'
              : 'Your UC orders';

  const slot = $('#loadHistory');
  if (!slot) return;

  slot.innerHTML = `
    <div class="section-head"><h2>${title}</h2></div>
    ${rows?.length ? `<div class="card">${rows.map(historyRow).join('')}</div>`
                   : emptyState('Nothing yet', 'Your requests will be listed here.')}`;
}

function historyRow(r) {
  const status = r.status;
  const cls = status === 'approved' || status === 'delivered' ? 'pill--win'
            : status === 'pending' ? 'pill--wait' : 'pill--bad';
  const label = r.pack_title
    ? `${esc(r.pack_title)} · ${r.uc_amount} UC`
    : r.wallet_type
      ? `${money(r.amount)} to ${esc(r.wallet_type)}`
      : `${money(r.amount)} via ${esc(r.method || '')}`;

  return `<div class="listrow">
    <div class="grow">
      <b>${label}</b>
      <small>${esc(when(r.created_at))}${r.admin_note ? ' · ' + esc(r.admin_note) : ''}</small>
      ${r.payout ? `<small>Payout: ${r.payout}</small>` : ''}
    </div>
    <span class="pill ${cls}">${esc(status)}</span>
  </div>`;
}

/* ─────────────────────────────────────────────────────────────── helpers ── */
function chips(chipSel, inputSel) {
  const box = $(chipSel);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    $(inputSel).value = b.dataset.a;
    [...box.children].forEach((c) => c.toggleAttribute('data-on', c === b));
  });
}

function filePicker(inputSel, labelSel) {
  const input = $(inputSel);
  if (!input) return;
  input.addEventListener('change', () => {
    const f = input.files[0];
    $(labelSel).textContent = f ? `✓ ${f.name.slice(0, 28)}` : 'Tap to choose the screenshot';
    $(labelSel).parentElement.toggleAttribute('data-has', !!f);
  });
}
