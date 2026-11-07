# Misprint

Top-down survival prototype in a two-colour risograph style. Vite + TypeScript + Phaser 3.90.

    npm install
    npm run dev        # http://localhost:5173 (or the port Vite prints)
    npm run build      # typecheck + production build into dist/

## Controls
- WASD / arrows: roll
- Space / Shift / click: swap ink (pink or teal)
- M: mute music and sound effects
- R: restart after a run ends

## Rules in the prototype
- Ink swap: blobs of your current colour cannot hurt you.
- Roller trail: your ink burns and slows blobs of the other colour. Ink fades after 7 s.
- Overprint: rolling over the other colour turns it violet. A violet patch explodes 0.7 s after you stop adding to it (at most 1.5 s more if you keep going). Small patches still explode but hit softer. Ink under 0.35 s old is repainted, not overprinted. Dead blobs splat their own ink onto bare paper only.
- Enemies: blob, runt (from 0:40), shifter (0:55, swaps colour about every 3 s and flickers 0.6 s before), splitter (1:15, bursts into two runts of the opposite colour), brute (1:30).
- Waves: every 40 s the arena freezes and you pick 1 of 3 upgrades (keys 1/2/3 or click).

## Upgrades
Wide Roller, Quick Fuse, Light Feet, Archival Ink, Caustic Ink, Bleed Edge (3 levels each), Heavy Violet, Hair Trigger (2 each), Spare Drop (3), Wet Splat (1: dead blobs overprint, so blasts chain). Defined in `src/upgrades.ts`; they change a per-run copy of the tuning (`freshStats()` in `src/config.ts`).

Base tuning is in `src/config.ts` (`T` and `KINDS`). Art is generated from shapes in `src/textures.ts`; no asset files yet.
