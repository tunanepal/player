/* Tunanepal — support chat.
   A proper messaging screen rather than a form in a sheet: full height,
   bubbles, a sticky composer, and it keeps itself up to date while open. */

import { rpcAuth, upload } from './api.js';
import { BUCKET_PROOF } from './config.js';
import { $, $$, esc, ago, toast, skeletons } from './ui.js';

let poll = null;
let lastCount = -1;
let sending = false;

export function openSupportChat() {
  /* Built as its own layer over the app, so the tab bar and header get out
     of the way exactly like a messaging app. */
  const el = document.createElement('div');
  el.className = 'chatscreen';
  el.id = 'chatScreen';
  el.innerHTML = `
    <header class="chatbar">
      <button class="chatbar__back" id="chBack" aria-label="Back">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
             stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
             stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg>
      </button>
      <div class="chatbar__who">
        <b>Tunanepal support</b>
        <small id="chStatus">Loading…</small>
      </div>
    </header>

    <div class="chatfeed" id="chFeed">${skeletons(2, 54)}</div>

    <form class="chatinput" id="chForm">
      <label class="chatinput__clip" id="chClipWrap" aria-label="Attach">
        <input type="file" id="chFile" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
             stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
          <path d="M20 11.5 11.4 20a4.6 4.6 0 0 1-6.5-6.5l8.6-8.6a3.1 3.1 0 0 1 4.4 4.4l-8.6 8.6a1.5 1.5 0 0 1-2.2-2.2l7.9-7.9"/>
        </svg>
      </label>
      <textarea id="chBody" rows="1" placeholder="Message support…"></textarea>
      <button type="submit" class="chatinput__send" id="chSend" aria-label="Send">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z"/>
        </svg>
      </button>
    </form>

    <div class="chatfile" id="chFileTag" hidden></div>`;

  document.body.appendChild(el);
  document.body.classList.add('chat-open');

  $('#chBack').addEventListener('click', closeSupportChat);
  $('#chForm').addEventListener('submit', (e) => { e.preventDefault(); send(); });

  const ta = $('#chBody');
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
  /* Enter sends on a desktop keyboard; Shift+Enter makes a new line. On a
     phone the on-screen Return key inserts a line as people expect. */
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 700px)').matches) {
      e.preventDefault();
      send();
    }
  });

  $('#chFile').addEventListener('change', () => {
    const f = $('#chFile').files[0];
    const tag = $('#chFileTag');
    if (!f) { tag.hidden = true; return; }
    tag.hidden = false;
    tag.innerHTML = `<span>${esc(f.name.slice(0, 30))}</span>
      <button type="button" id="chFileX" aria-label="Remove">&times;</button>`;
    $('#chFileX').addEventListener('click', () => {
      $('#chFile').value = '';
      tag.hidden = true;
    });
  });

  load(true);
  poll = setInterval(() => load(false), 10000);
}

export function closeSupportChat() {
  clearInterval(poll);
  poll = null;
  lastCount = -1;
  document.body.classList.remove('chat-open');
  $('#chatScreen')?.remove();
}

/* the phone's back gesture and Escape both close the chat */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#chatScreen')) closeSupportChat();
});

/* ────────────────────────────────────────────────────────────── loading ── */
async function load(first) {
  const feed = $('#chFeed');
  if (!feed) return;

  let t;
  try { t = await rpcAuth('tuna_report_thread'); }
  catch (e) {
    if (first) feed.innerHTML = `<div class="alert alert--bad" style="margin:12px">${esc(e.message)}</div>`;
    return;
  }

  const msgs = t.messages || [];
  const status = $('#chStatus');

  if (status) {
    status.textContent = !msgs.length ? 'Send a message to start'
      : t.status === 'solved' || t.status === 'closed' ? 'Closed'
      : t.status === 'pending' ? 'An agent is on it'
      : 'We usually reply in minutes';
  }

  /* Only repaint when something actually changed, so the view does not jump
     under the reader's thumb every ten seconds. */
  if (msgs.length === lastCount && !first) return;
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  lastCount = msgs.length;

  feed.innerHTML = msgs.length
    ? `<div class="chatday">Support chat</div>` + msgs.map(bubble).join('')
    : `<div class="chatempty">
         <b>No messages yet</b>
         <p>Tell us what went wrong. If someone cheated, attach a screenshot
            or a clip as proof.</p>
       </div>`;

  if (first || atBottom) feed.scrollTop = feed.scrollHeight;
}

function bubble(m) {
  if (m.sender === 'system') {
    return `<div class="chatsys"><span>${esc(m.body)}</span></div>`;
  }
  const mine = m.sender === 'player';
  return `
    <div class="msg msg--${mine ? 'me' : 'them'}">
      ${m.media_url ? (m.media_type === 'video'
        ? `<video src="${esc(m.media_url)}" controls playsinline></video>`
        : `<img src="${esc(m.media_url)}" alt="attachment" loading="lazy">`) : ''}
      ${m.body ? `<p>${esc(m.body)}</p>` : ''}
      <time>${esc(ago(m.created_at))}</time>
    </div>`;
}

/* ────────────────────────────────────────────────────────────── sending ── */
async function send() {
  if (sending) return;
  const ta = $('#chBody');
  const file = $('#chFile').files[0];
  const body = ta.value.trim();
  if (!body && !file) return;

  sending = true;
  const btn = $('#chSend');
  btn.disabled = true;

  /* Show it straight away. If the send fails the row is marked, rather than
     the message vanishing and the player wondering what happened. */
  const feed = $('#chFeed');
  const temp = document.createElement('div');
  temp.className = 'msg msg--me msg--sending';
  temp.innerHTML = `${body ? `<p>${esc(body)}</p>` : ''}<time>sending…</time>`;
  if ($('.chatempty')) feed.innerHTML = '';
  feed.appendChild(temp);
  feed.scrollTop = feed.scrollHeight;

  try {
    let url = null, type = null;
    if (file) {
      url = await upload(BUCKET_PROOF, file);
      type = file.type.startsWith('video') ? 'video' : 'image';
    }
    await rpcAuth('tuna_report_send', { p_body: body, p_media_url: url, p_media_type: type });

    ta.value = '';
    ta.style.height = 'auto';
    $('#chFile').value = '';
    $('#chFileTag').hidden = true;
    lastCount = -1;
    await load(true);
  } catch (e) {
    temp.classList.add('msg--failed');
    temp.querySelector('time').textContent = 'not sent — tap to retry';
    temp.addEventListener('click', () => { temp.remove(); ta.value = body; send(); });
    toast(e.message, 'bad');
  } finally {
    sending = false;
    btn.disabled = false;
  }
}
