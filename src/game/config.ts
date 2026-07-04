/**
 * Central game configuration.
 *
 * Want to add a new item to the game? Just add a line to ITEMS below.
 * Want to tweak difficulty? Everything lives in TUNING.
 */

export type ItemKind = 'good' | 'bad';

export interface ItemDef {
  /** Unique id — also used to look up custom art in /assets/items/<id>.png */
  id: string;
  /** Emoji fallback art (used until custom assets are generated) */
  emoji: string;
  name: string;
  kind: ItemKind;
}

export const ITEMS: ItemDef[] = [
  // Good things → drop them into the heart!
  { id: 'strawberry', emoji: '🍓', name: 'Strawberry', kind: 'good' },
  { id: 'acorn', emoji: '🌰', name: 'Acorn', kind: 'good' },
  { id: 'peanut', emoji: '🥜', name: 'Peanut', kind: 'good' },
  { id: 'apple', emoji: '🍎', name: 'Apple', kind: 'good' },
  { id: 'cookie', emoji: '🍪', name: 'Cookie', kind: 'good' },
  { id: 'cherries', emoji: '🍒', name: 'Cherries', kind: 'good' },

  // Bad things → toss them in the dumpster!
  { id: 'bomb', emoji: '💣', name: 'Bomb', kind: 'bad' },
  { id: 'dynamite', emoji: '🧨', name: 'Dynamite', kind: 'bad' },
  { id: 'fire', emoji: '🔥', name: 'Fire', kind: 'bad' },
  { id: 'meteor', emoji: '☄️', name: 'Meteor', kind: 'bad' },
];

export const TUNING = {
  /** Squirrel run speed, as a fraction of screen width per second */
  squirrelBaseSpeed: 0.22,
  /** Extra speed added each level */
  squirrelSpeedPerLevel: 0.045,
  /** Gravity for falling items, as a fraction of screen height per second² */
  gravity: 1.7,
  /** Seconds before the squirrel picks up the next item after a drop */
  respawnDelay: 0.45,
  /** Points for sorting an item correctly */
  pointsPerCatch: 10,
  /** Score needed to advance a level (speeds things up) */
  pointsPerLevel: 50,
  /** How many mistakes you can make */
  maxLives: 3,
  /** Where the electric wire hangs, as a fraction of screen height */
  wireY: 0.14,
  /** How much the wire sags in the middle (fraction of screen height) */
  wireSag: 0.035,
  /** Where the bins sit, as a fraction of screen height */
  binY: 0.86,
};

/** The two sides of the screen. Good stuff goes left, bad stuff goes right. */
export const SIDES = {
  good: { emoji: '❤️', label: 'YUMMY!', tint: 'rgba(255, 105, 140, 0.10)' },
  bad: { emoji: '🗑️', label: 'TRASH!', tint: 'rgba(120, 130, 145, 0.12)' },
};
