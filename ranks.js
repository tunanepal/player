/* Tunanepal — rank emblems.

   Seven badges, drawn as inline SVG so they stay sharp at any size and take
   their colour from the tier. The shapes escalate deliberately: a plain ring
   for Newbie, chevrons that multiply through the middle tiers, then a crown,
   a star, and finally the flag pennant for Tunamaster.

   Each one has to read at 18px on a leaderboard row, so no fine detail. */

export const RANK_ORDER =
  ['newbie', 'silver', 'platinum', 'diamond', 'crown', 'ace', 'tunamaster'];

export const RANK_LABEL = {
  newbie: 'Newbie', silver: 'Silver', platinum: 'Platinum',
  diamond: 'Diamond', crown: 'Crown', ace: 'Ace', tunamaster: 'Tunamaster'
};

/* two-stop colours, matching the tier styling in screens.css */
export const RANK_COLOUR = {
  newbie:     ['#B9AF9A', '#8C8371'],
  silver:     ['#C3CDDB', '#7A8798'],
  platinum:   ['#7FDCEA', '#2E9AAC'],
  diamond:    ['#8FC0FF', '#3B6FD4'],
  crown:      ['#C79BFF', '#7C3FD1'],
  ace:        ['#FFA268', '#DB5A15'],
  tunamaster: ['#FF5A6E', '#8E1026']
};

const SHAPES = {
  /* a bare ring — the start of the ladder, nothing earned yet */
  newbie: `
    <circle cx="16" cy="16" r="9" fill="none" stroke="url(#g)" stroke-width="2.6"/>
    <circle cx="16" cy="16" r="2.6" fill="url(#g)"/>`,

  /* shield, one chevron */
  silver: `
    <path d="M16 4 27 8v9c0 6-4.6 9.6-11 11-6.4-1.4-11-5-11-11V8Z" fill="url(#g)"/>
    <path d="M10.5 16.5 16 12l5.5 4.5" fill="none" stroke="#fff" stroke-width="2.4"
          stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`,

  /* shield, two chevrons */
  platinum: `
    <path d="M16 4 27 8v9c0 6-4.6 9.6-11 11-6.4-1.4-11-5-11-11V8Z" fill="url(#g)"/>
    <path d="M10.5 14.5 16 10l5.5 4.5M10.5 20 16 15.5l5.5 4.5" fill="none" stroke="#fff"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`,

  /* a cut gem */
  diamond: `
    <path d="M16 3 29 12l-13 17L3 12Z" fill="url(#g)"/>
    <path d="M3 12h26M16 3l-6 9 6 17 6-17Z" fill="none" stroke="#fff"
          stroke-width="1.5" opacity=".55"/>`,

  /* a crown with three points */
  crown: `
    <path d="M4 22 6 9l6 5 4-7 4 7 6-5 2 13Z" fill="url(#g)"/>
    <rect x="4" y="23" width="24" height="4.4" rx="1.6" fill="url(#g)"/>
    <circle cx="16" cy="14.5" r="1.9" fill="#fff" opacity=".85"/>`,

  /* a star inside a ring */
  ace: `
    <circle cx="16" cy="16" r="13" fill="url(#g)"/>
    <path d="M16 6.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6-5.9-3.2-5.9 3.2 1.2-6.6-4.8-4.6 6.6-.9Z"
          fill="#fff" opacity=".95"/>`,

  /* the double pennant of the Nepali flag — the one silhouette in the app
     nothing else shares, so it stays legible even at 14px */
  tunamaster: `
    <path d="M7 3.5h2.4v25H7z" fill="url(#g)"/>
    <path d="M9.4 3.5 27 12.2 15.6 15.4 26 21.6 9.4 27.4Z" fill="url(#g)"/>
    <circle cx="14.6" cy="10.4" r="2.1" fill="#fff" opacity=".95"/>
    <circle cx="15.2" cy="21" r="1.8" fill="#fff" opacity=".95"/>`
};

/** Inline SVG badge for a tier. Size is in pixels. */
export function rankBadge(key, size = 18) {
  const k = SHAPES[key] ? key : 'newbie';
  const [a, b] = RANK_COLOUR[k];
  /* the gradient id must be unique or every badge on the page inherits the
     colours of the first one drawn */
  const id = `rg${k}${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="rankbadge" viewBox="0 0 32 32" width="${size}" height="${size}"
     role="img" aria-label="${RANK_LABEL[k]}"><defs>
     <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
     </linearGradient></defs>
     ${SHAPES[k].replace(/url\(#g\)/g, `url(#${id})`)}</svg>`;
}

/** Badge plus the tier name, for a profile or a header. */
export function rankChip(key, label, size = 16) {
  const k = SHAPES[key] ? key : 'newbie';
  return `<span class="rankchip rank--${k}">
    ${rankBadge(k, size)}<b>${label || RANK_LABEL[k]}</b></span>`;
}
