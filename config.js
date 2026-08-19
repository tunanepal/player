/* Tunanepal — project configuration.
   The publishable key is meant to ship in the client. It grants nothing on
   its own: every table is locked by RLS and only the tuna_* functions run. */

export const SUPABASE_URL = 'https://dzxtwtcizoogqqacnpdd.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_WVMexNwIj4J3bNZwbrEZPg_HBqmX013';

export const BUCKET_PUBLIC = 'tuna-public';   // avatars, QR codes, banners
export const BUCKET_PROOF  = 'tuna-proof';    // payment + win screenshots

/* Direct download for the Android app file. Leave blank and the install
   sheet simply offers the browser route instead. Example once hosted:
   'https://tunanepal.com/tunanepal.apk'                                   */
export const APK_URL = '';

export const TOKEN_KEY = 'tuna.session';
export const THEME_KEY = 'tuna.theme';

/* 1 point = Rs 1 */
export const CURRENCY = 'Rs';

export const GAMES = {
  pubg:     { label: 'PUBG Mobile', short: 'PUBG' },
  freefire: { label: 'Free Fire',   short: 'Free Fire' }
};

export const TEAM_SIZES = ['1v1', '2v2', '4v4'];
export const GUN_TYPES  = ['AR', 'SMG', 'SNIPER', 'SHOTGUN'];
