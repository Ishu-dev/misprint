export const W = 960;
export const H = 540;
export const CELL = 12;

export const COLORS = {
  paper: 0xf4ecd9,
  pink: 0xff5fa2,
  teal: 0x2fa6c0,
  violet: 0x5a2d82,
  ink: 0x2a2335,
};

export const INK = { NONE: 0, PINK: 1, TEAL: 2, VIOLET: 3 } as const;
export type InkColor = typeof INK.PINK | typeof INK.TEAL;

export const other = (c: InkColor): InkColor => (c === INK.PINK ? INK.TEAL : INK.PINK);
export const hexOf = (c: InkColor): number => (c === INK.PINK ? COLORS.pink : COLORS.teal);

// Tuning. Everything a playtest is likely to change lives here.
export const T = {
  playerSpeed: 230,
  playerRadius: 13,
  playerHp: 5,
  invulnMs: 900,
  swapCooldownMs: 400,
  rollerRadius: 11,
  inkLifeMs: 7000, // pink/teal ink fades after this
  fuseMs: 700, // violet overprint explodes this long after it first appears
  fuseHoldMaxMs: 1500, // a patch you keep growing still goes off at most this long after the fuse
  overprintMinAgeMs: 350, // ink younger than this is repainted, not overprinted (stops swap-at-feet blasts)
  fullBlastCells: 15, // patches this big deal full blast damage; smaller ones deal less
  inkDps: 2.2, // damage per second to an enemy standing on the opposite ink
  inkSlow: 0.55, // speed multiplier on the opposite ink
  blastDamage: 6,
  blastPad: 28,
  blastMax: 220,
  maxEnemies: 180,
  runSeconds: 600, // a full print run is 10 minutes
  waveSeconds: 40, // an upgrade pick comes at the end of every wave
  chainSplat: 0, // 1 once the Wet Splat upgrade lets dead blobs overprint
  shiftEveryMs: 3000, // shifter colour period (plus or minus 400 ms)
  shiftWarnMs: 600, // shifter flickers this long before it swaps
  splitImmuneMs: 450, // fresh runts from a splitter ignore ink this long
};

/** Per-run copy of T. Upgrades change this, never T itself. */
export type Stats = typeof T;
export const freshStats = (): Stats => ({ ...T });

export const KINDS = {
  blob: { r: 13, speed: 75, hp: 3, scale: 1, splat: 16, tex: 'blob' },
  runt: { r: 9, speed: 125, hp: 1, scale: 0.7, splat: 11, tex: 'blob' },
  brute: { r: 24, speed: 42, hp: 12, scale: 1.8, splat: 30, tex: 'blob' },
  // Swaps ink every few seconds, so a safe neighbour can turn on you.
  shifter: { r: 13, speed: 82, hp: 4, scale: 1.05, splat: 16, tex: 'shifter' },
  // Bursts into two runts of the opposite colour when it dies.
  splitter: { r: 16, speed: 58, hp: 5, scale: 1.25, splat: 20, tex: 'splitter' },
} as const;
export type Kind = keyof typeof KINDS;

export const FONT = '"Courier New", Courier, monospace';
