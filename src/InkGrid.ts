import Phaser from 'phaser';
import { CELL, COLORS, INK, T, type InkColor } from './config';

export interface Blast {
  x: number;
  y: number;
  r: number;
  cells: number;
}

/** Floor ink stored as a coarse grid. Each cell holds one ink and the time it was laid. */
export class InkGrid {
  readonly cols: number;
  readonly rows: number;
  private cells: Uint8Array;
  private stamp: Float32Array;
  private seen: Uint8Array;
  private stack: Int32Array;

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    const n = this.cols * this.rows;
    this.cells = new Uint8Array(n);
    this.stamp = new Float32Array(n);
    this.seen = new Uint8Array(n);
    this.stack = new Int32Array(n);
  }

  at(x: number, y: number): number {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return INK.NONE;
    return this.cells[cy * this.cols + cx];
  }

  /**
   * Paint a disc. Opposite ink turns violet and starts a fuse, unless it was laid
   * moments ago (then it is just repainted). With overprint=false, existing ink is left alone.
   */
  paintCircle(x: number, y: number, r: number, color: InkColor, now: number, overprint = true): void {
    const x0 = Math.max(0, Math.floor((x - r) / CELL));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL));
    const y0 = Math.max(0, Math.floor((y - r) / CELL));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * CELL - x;
        const dy = (cy + 0.5) * CELL - y;
        if (dx * dx + dy * dy > r2) continue;
        const i = cy * this.cols + cx;
        const cur = this.cells[i];
        if (cur === INK.VIOLET) continue;
        if (cur === INK.NONE || cur === color) {
          this.cells[i] = color;
        } else if (!overprint) {
          continue;
        } else if (now - this.stamp[i] < T.overprintMinAgeMs) {
          this.cells[i] = color;
        } else {
          this.cells[i] = INK.VIOLET;
        }
        this.stamp[i] = now;
      }
    }
  }

  /** Fade old ink and detonate violet clusters whose fuse has run out. */
  update(now: number): Blast[] {
    const blasts: Blast[] = [];
    const n = this.cells.length;
    for (let i = 0; i < n; i++) {
      const c = this.cells[i];
      if (c === INK.NONE) continue;
      const age = now - this.stamp[i];
      if (c === INK.VIOLET) {
        if (age >= T.fuseMs) {
          const b = this.detonate(i);
          if (b) blasts.push(b);
        }
      } else if (age >= T.inkLifeMs) {
        this.cells[i] = INK.NONE;
      }
    }
    return blasts;
  }

  /** Flood-fill the connected violet cluster from i and clear it. Returns null if it fizzles. */
  private detonate(start: number): Blast | null {
    const { cols, rows, cells, stack, seen } = this;
    seen.fill(0);
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const members: number[] = [];
    while (top > 0) {
      const i = stack[--top];
      members.push(i);
      const cx = i % cols;
      const cy = (i / cols) | 0;
      const push = (j: number) => {
        if (!seen[j] && cells[j] === INK.VIOLET) {
          seen[j] = 1;
          stack[top++] = j;
        }
      };
      if (cx > 0) push(i - 1);
      if (cx < cols - 1) push(i + 1);
      if (cy > 0) push(i - cols);
      if (cy < rows - 1) push(i + cols);
    }
    if (members.length < T.minBlastCells) {
      for (const i of members) cells[i] = INK.NONE;
      return null;
    }
    let sx = 0;
    let sy = 0;
    for (const i of members) {
      sx += ((i % cols) + 0.5) * CELL;
      sy += (((i / cols) | 0) + 0.5) * CELL;
    }
    const x = sx / members.length;
    const y = sy / members.length;
    let far = 0;
    for (const i of members) {
      const dx = ((i % cols) + 0.5) * CELL - x;
      const dy = (((i / cols) | 0) + 0.5) * CELL - y;
      far = Math.max(far, Math.hypot(dx, dy));
      cells[i] = INK.NONE;
    }
    return { x, y, r: Math.min(T.blastMax, far + T.blastPad), cells: members.length };
  }

  /** Halftone look: each cell is a dot that shrinks as the ink fades. */
  draw(g: Phaser.GameObjects.Graphics, now: number): void {
    g.clear();
    const { cols, cells, stamp } = this;
    const passes: [number, number, number][] = [
      [INK.PINK, COLORS.pink, 0],
      [INK.TEAL, COLORS.teal, 1.5], // slight offset sells the misregistered print
      [INK.VIOLET, COLORS.violet, 0],
    ];
    for (const [ink, hex, off] of passes) {
      g.fillStyle(hex, 0.9);
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] !== ink) continue;
        const x = ((i % cols) + 0.5) * CELL + off;
        const y = (((i / cols) | 0) + 0.5) * CELL + off * 0.6;
        const age = now - stamp[i];
        let r: number;
        if (ink === INK.VIOLET) {
          r = CELL * 0.78 * (1 + 0.18 * Math.sin(now / 35 + i));
        } else {
          const t = Math.min(1, age / T.inkLifeMs);
          r = CELL * (0.74 - 0.56 * t * t);
        }
        g.fillCircle(x, y, r);
      }
    }
  }

  clear(): void {
    this.cells.fill(INK.NONE);
  }
}
