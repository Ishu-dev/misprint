import type { Stats } from './config';

export interface Upgrade {
  id: string;
  name: string;
  text: string;
  max: number;
  apply(s: Stats): void;
}

export const UPGRADES: Upgrade[] = [
  { id: 'wide', name: 'Wide Roller', text: 'Your roller paints a wider stripe.', max: 3, apply: (s) => void (s.rollerCells += 1) },
  { id: 'fuse', name: 'Quick Fuse', text: 'Violet goes off 120 ms sooner after you stop overprinting.', max: 3, apply: (s) => void (s.fuseMs = Math.max(300, s.fuseMs - 120)) },
  { id: 'feet', name: 'Light Feet', text: 'Roll 12% faster.', max: 3, apply: (s) => void (s.playerSpeed *= 1.12) },
  { id: 'long', name: 'Archival Ink', text: 'Ink lasts 2.5 s longer before it fades.', max: 3, apply: (s) => void (s.inkLifeMs += 2500) },
  { id: 'caustic', name: 'Caustic Ink', text: 'Your ink burns blobs 40% harder.', max: 3, apply: (s) => void (s.inkDps *= 1.4) },
  {
    id: 'bleed',
    name: 'Bleed Edge',
    text: 'Blasts reach 14 px further.',
    max: 3,
    apply: (s) => {
      s.blastPad += 14;
      s.blastMax += 40;
    },
  },
  { id: 'heavy', name: 'Heavy Violet', text: 'Blasts deal 3 more damage.', max: 2, apply: (s) => void (s.blastDamage += 3) },
  { id: 'drop', name: 'Spare Drop', text: '+1 max HP, and heal 1.', max: 3, apply: (s) => void (s.playerHp += 1) },
  { id: 'trigger', name: 'Hair Trigger', text: 'Swap cooldown 120 ms shorter.', max: 2, apply: (s) => void (s.swapCooldownMs = Math.max(120, s.swapCooldownMs - 120)) },
  { id: 'wet', name: 'Wet Splat', text: 'Dead blobs overprint the ink they die on, so blasts chain.', max: 1, apply: (s) => void (s.chainSplat = 1) },
];
