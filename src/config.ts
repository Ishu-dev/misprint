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
  inkDps: 2.2, // damage per second to an enemy standing on the opposite ink
  inkSlow: 0.55, // speed multiplier on the opposite ink
  blastDamage: 6,
  blastPad: 28,
  blastMax: 220,
  maxEnemies: 180,
  runSeconds: 600, // a full print run is 10 minutes
};

export const KINDS = {
  blob: { r: 13, speed: 75, hp: 3, scale: 1, splat: 16 },
  runt: { r: 9, speed: 125, hp: 1, scale: 0.7, splat: 11 },
  brute: { r: 24, speed: 42, hp: 12, scale: 1.8, splat: 30 },
} as const;
export type Kind = keyof typeof KINDS;

export const FONT = '"Courier New", Courier, monospace';
