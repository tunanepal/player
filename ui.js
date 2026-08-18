/* Tunanepal — shared UI helpers. */

import { CURRENCY, THEME_KEY } from './config.js';

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escapes anything that came from a player before it touches innerHTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString('en-IN')}`;
export const num   = (n) => Number(n || 0).toLocaleString('en-IN');

export const initials = (name) =>
  String(name || 'T').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function avatarHTML(player, cls = '') {
  const inner = player?.avatar_url
    ? `<img src="${esc(player.avatar_url)}" alt="">`
    : esc(initials(player?.name));
  return `<span class="avatar ${cls}">${inner}</span>`;
}

/* ─────────────────────────────────────────────────────────────────── time ── */
export function when(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const today = new Date().toDateString();
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today) return `Today, ${t}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${t}`;
}

export function ago(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return when(iso);
}

export const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ────────────────────────────────────────────────────────────────── toast ── */
let toastTimer;
export function toast(message, kind = '') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast ${kind ? 'toast--' + kind : ''}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
}

/* ────────────────────────────────────────────────────────────────── sheet ── */
let onSheetClose = null;

export function openSheet(html, { onClose } = {}) {
  closeSheet();
  onSheetClose = onClose || null;
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  scrim.id = 'sheetScrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet__grip"></div>${html}</div>`;
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeSheet(); });
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  const first = scrim.querySelector('input, button, select, textarea');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 120);
  return scrim;
}

export function closeSheet() {
  const scrim = $('#sheetScrim');
  if (!scrim) return;
  scrim.remove();
  document.body.style.overflow = '';
  if (onSheetClose) { const fn = onSheetClose; onSheetClose = null; fn(); }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ───────────────────────────────────────────────────────── button states ── */
export async function busy(btn, label, task) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await task(); }
  finally { btn.disabled = false; btn.textContent = original; }
}

export function showError(container, message) {
  if (!container) return toast(message, 'bad');
  container.textContent = message;
  container.hidden = false;
  container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export const clearError = (container) => { if (container) container.hidden = true; };

/* ────────────────────────────────────────────────────────────────── theme ── */
export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'cream';
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#14161F' : '#F6F1E4';
  return t;
}

export const savedTheme = () => localStorage.getItem(THEME_KEY) || 'cream';

/* ─────────────────────────────────────────── one shared 1-second heartbeat
   Every countdown on screen ticks off this single interval rather than each
   card owning a timer, so a list of forty rooms still costs one tick.     */
const tickers = new Set();
export const onTick = (fn) => { tickers.add(fn); return () => tickers.delete(fn); };
setInterval(() => { for (const fn of tickers) { try { fn(); } catch {} } }, 1000);

export function emptyState(title, note) {
  return `<div class="empty"><div class="display">${esc(title)}</div><p>${esc(note)}</p></div>`;
}

export function skeletons(count = 3, height = 120) {
  return Array.from({ length: count },
    () => `<div class="skeleton" style="height:${height}px;margin-bottom:11px"></div>`).join('');
}
