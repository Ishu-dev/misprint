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
- Overprint: rolling over the other colour turns it violet. A violet cluster explodes 0.7 s after it forms. Dead blobs splat their own ink, so blasts can chain.

All tuning numbers are in `src/config.ts` (`T` and `KINDS`). Art is generated from shapes in `src/textures.ts`; no asset files yet.
