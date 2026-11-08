import Phaser from 'phaser';
import { CELL, COLORS, FONT, H, INK, KINDS, W, freshStats, hexOf, other, type InkColor, type Kind, type Stats } from './config';
import { UPGRADES, type Upgrade } from './upgrades';
import { InkGrid, type Blast } from './InkGrid';
import { makeTextures } from './textures';
import { sfx } from './sfx';

interface Enemy {
  kind: Kind;
  color: InkColor;
  x: number;
  y: number;
  r: number;
  speed: number;
  hp: number;
  dead: boolean;
  flashUntil: number;
  nextShift: number; // shifter only: when it next swaps colour
  immuneUntil: number; // ignores ink until then (fresh splitter runts)
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

interface Player {
  x: number;
  y: number;
  color: InkColor;
  hp: number;
  angle: number;
  invulnUntil: number;
  swapReadyAt: number;
}

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE' | 'SHIFT', Phaser.Input.Keyboard.Key>;

const text = (size: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  fontStyle: 'bold',
  color: '#2a2335',
  ...extra,
});

export class ArenaScene extends Phaser.Scene {
  private grid!: InkGrid;
  private inkGfx!: Phaser.GameObjects.Graphics;
  private keys!: Keys;
  private p!: Player;
  private body!: Phaser.GameObjects.Image;
  private bodyShadow!: Phaser.GameObjects.Image;
  private roller!: Phaser.GameObjects.Image;
  private enemies: Enemy[] = [];
  private elapsed = 0; // seconds of run time
  private spawnTimer = 0;
  private kills = 0;
  private bestBlast = 0;
  private over = false;

  private s!: Stats;
  private levels: Record<string, number> = {};
  private wave = 1;
  private waveEnd = 0;
  private picking = false;
  private picker: Phaser.GameObjects.Container | null = null;
  private choices: Upgrade[] = [];

  // Touch: drag anywhere to roll (a floating stick), tap or press SWAP to change ink.
  private touchMode = false;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0, t: 0 };
  private stickVec = { x: 0, y: 0 };
  private stickGfx!: Phaser.GameObjects.Graphics;
  private swapBtn!: Phaser.GameObjects.Container;
  private swapBtnDisc!: Phaser.GameObjects.Arc;

  private hudRing!: Phaser.GameObjects.Arc;
  private hudDrops: Phaser.GameObjects.Arc[] = [];
  private hudTime!: Phaser.GameObjects.Text;
  private hudKills!: Phaser.GameObjects.Text;
  private hudWave!: Phaser.GameObjects.Text;
  private hudWaveBar!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('arena');
  }

  create(): void {
    makeTextures(this);
    this.enemies = [];
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.kills = 0;
    this.bestBlast = 0;
    this.over = false;
    this.s = freshStats();
    this.levels = {};
    this.wave = 1;
    this.waveEnd = this.s.waveSeconds;
    this.picking = false;
    this.picker = null;

    this.add.image(0, 0, 'paper').setOrigin(0).setDepth(0);
    this.grid = new InkGrid(W, H, this.s);
    this.inkGfx = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.p = { x: W / 2, y: H / 2, color: INK.PINK, hp: this.s.playerHp, angle: 0, invulnUntil: 0, swapReadyAt: 0 };
    this.bodyShadow = this.add.image(0, 0, 'player').setTint(COLORS.ink).setAlpha(0.25).setDepth(2);
    this.roller = this.add.image(0, 0, 'roller').setDepth(4);
    this.body = this.add.image(0, 0, 'player').setDepth(4);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') as Keys;
    // Key events, not JustDown: a tap shorter than one frame would be lost.
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.swap());
    kb.on('keydown-SHIFT', () => this.swap());
    kb.on('keydown-M', () => sfx.toggleMute());
    kb.on('keydown-ONE', () => this.pick(0));
    kb.on('keydown-TWO', () => this.pick(1));
    kb.on('keydown-THREE', () => this.pick(2));
    kb.on('keydown-R', () => {
      if (this.over) this.scene.restart();
    });
    this.input.addPointer(2);
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => this.pointerDown(ptr));
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => this.pointerMove(ptr));
    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => this.pointerUp(ptr));
    this.stickGfx = this.add.graphics().setDepth(15);
    this.swapBtnDisc = this.add.circle(0, 0, 46, COLORS.teal, 0.85).setStrokeStyle(4, COLORS.ink);
    this.swapBtn = this.add
      .container(W - 76, H - 76, [this.swapBtnDisc, this.add.text(0, 0, 'SWAP', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#2a2335' }).setOrigin(0.5)])
      .setDepth(16)
      .setVisible(false);
    if (window.matchMedia?.('(pointer: coarse)').matches) this.enableTouch();

    this.buildHud();
    this.syncPlayer();

    sfx.setIntensity(0);
    sfx.startMusic();
    this.events.once('shutdown', () => sfx.stopMusic());

    // Test hook for automated playtests.
    (window as unknown as { __misprint: ArenaScene }).__misprint = this;
  }

  // ---------- frame ----------

  update(_time: number, delta: number): void {
    if (this.over || this.picking) return;
    const dt = Math.min(delta, 50) / 1000;
    this.elapsed += dt;
    const now = this.elapsed * 1000;

    this.movePlayer(dt, now);

    for (const b of this.grid.update(now)) this.blast(b);
    this.updateEnemies(dt, now);
    this.spawn(dt);
    sfx.setIntensity((1.1 - spawnInterval(this.elapsed)) / (1.1 - 0.22));

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.grid.draw(this.inkGfx, now);
    this.syncPlayer();
    this.updateHud();
    this.drawStick();
    this.swapBtnDisc.setFillStyle(hexOf(other(this.p.color)), 0.85);

    if (this.elapsed >= this.s.runSeconds) this.endRun(true);
    else if (this.elapsed >= this.waveEnd) this.openPicker();
  }

  // ---------- player ----------

  private swap(): void {
    if (this.over || this.picking) return;
    const now = this.elapsed * 1000;
    if (now < this.p.swapReadyAt) return;
    this.p.swapReadyAt = now + this.s.swapCooldownMs;
    this.p.color = other(this.p.color);
    sfx.swap(this.p.color);
    this.tweens.add({ targets: this.body, scale: { from: 1.35, to: 1 }, duration: 160 });
  }

  // ---------- touch ----------

  private enableTouch(): void {
    if (this.touchMode) return;
    this.touchMode = true;
    this.swapBtn.setVisible(!this.over);
  }

  private onSwapBtn(ptr: Phaser.Input.Pointer): boolean {
    return this.swapBtn.visible && Phaser.Math.Distance.Between(ptr.x, ptr.y, this.swapBtn.x, this.swapBtn.y) < 56;
  }

  private pointerDown(ptr: Phaser.Input.Pointer): void {
    if (!ptr.wasTouch) {
      this.swap(); // mouse click swaps, as before
      return;
    }
    this.enableTouch();
    if (this.over) {
      this.scene.restart();
      return;
    }
    if (this.picking) return; // upgrade cards take the tap on pointerup
    if (this.onSwapBtn(ptr)) {
      this.swap();
      return;
    }
    if (this.stickId === null) {
      this.stickId = ptr.id;
      this.stickOrigin = { x: ptr.x, y: ptr.y, t: this.time.now };
      this.stickVec = { x: 0, y: 0 };
    } else {
      this.swap(); // second finger anywhere swaps
    }
  }

  private pointerMove(ptr: Phaser.Input.Pointer): void {
    if (ptr.id !== this.stickId) return;
    this.stickVec = { x: ptr.x - this.stickOrigin.x, y: ptr.y - this.stickOrigin.y };
  }

  private pointerUp(ptr: Phaser.Input.Pointer): void {
    if (ptr.id !== this.stickId) return;
    // A quick tap that barely moved counts as a swap.
    if (this.time.now - this.stickOrigin.t < 220 && Math.hypot(this.stickVec.x, this.stickVec.y) < 14) this.swap();
    this.stickId = null;
    this.stickVec = { x: 0, y: 0 };
  }

  private drawStick(): void {
    const g = this.stickGfx;
    g.clear();
    if (this.stickId === null) return;
    const { x, y } = this.stickOrigin;
    const len = Math.hypot(this.stickVec.x, this.stickVec.y);
    const k = len > 60 ? 60 / len : 1;
    g.lineStyle(3, COLORS.ink, 0.35).strokeCircle(x, y, 60);
    g.fillStyle(COLORS.ink, 0.3).fillCircle(x + this.stickVec.x * k, y + this.stickVec.y * k, 24);
  }

  private movePlayer(dt: number, now: number): void {
    const k = this.keys;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    let speed = 1;
    if (dx === 0 && dy === 0 && this.stickId !== null) {
      const sl = Math.hypot(this.stickVec.x, this.stickVec.y);
      if (sl > 10) {
        dx = this.stickVec.x;
        dy = this.stickVec.y;
        speed = Math.min(1, sl / 50);
      }
    }
    if (dx === 0 && dy === 0) return;
    const len = Math.hypot(dx, dy);
    dx = (dx / len) * speed;
    dy = (dy / len) * speed;
    const m = this.s.playerRadius;
    const ox = this.p.x;
    const oy = this.p.y;
    this.p.x = Phaser.Math.Clamp(ox + dx * this.s.playerSpeed * dt, m, W - m);
    this.p.y = Phaser.Math.Clamp(oy + dy * this.s.playerSpeed * dt, m, H - m);
    this.p.angle = Math.atan2(dy, dx);

    // Roll the drum along the path in small steps so fast frames leave no gaps.
    const dist = Math.hypot(this.p.x - ox, this.p.y - oy);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rx = ox + (this.p.x - ox) * t + Math.cos(this.p.angle) * 12;
      const ry = oy + (this.p.y - oy) * t + Math.sin(this.p.angle) * 12;
      this.paintRoller(rx, ry, now);
    }
  }

  /**
   * Stamp the roller on the ink grid. A free disc covers 1 or 2 cells depending on where it
   * sits inside a cell, so vertical and horizontal stripes came out different widths. Snap the
   * stamp to a cell corner (even widths) or cell centre (odd widths) so every stripe is exactly
   * rollerCells wide.
   */
  private paintRoller(x: number, y: number, now: number): void {
    const w = this.s.rollerCells;
    const half = w % 2 === 0 ? 0 : 0.5;
    const sx = (Math.round(x / CELL - half) + half) * CELL;
    const sy = (Math.round(y / CELL - half) + half) * CELL;
    this.grid.paintCircle(sx, sy, (w / 2) * CELL - 0.5, this.p.color, now);
  }

  private syncPlayer(): void {
    const { x, y, angle, color } = this.p;
    this.body.setPosition(x, y).setTint(hexOf(color));
    this.bodyShadow.setPosition(x + 3, y + 3);
    this.roller.setPosition(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14).setRotation(angle + Math.PI / 2);
    const now = this.elapsed * 1000;
    this.body.setAlpha(now < this.p.invulnUntil && Math.floor(now / 80) % 2 === 0 ? 0.35 : 1);
  }

  private hurtPlayer(e: Enemy, now: number): void {
    if (now < this.p.invulnUntil) return;
    this.p.hp -= 1;
    sfx.hit();
    this.p.invulnUntil = now + this.s.invulnMs;
    this.cameras.main.shake(140, 0.008);
    // Knock the attacker back so the player can escape.
    const a = Math.atan2(e.y - this.p.y, e.x - this.p.x);
    e.x += Math.cos(a) * 50;
    e.y += Math.sin(a) * 50;
    if (this.p.hp <= 0) this.endRun(false);
  }

  // ---------- enemies ----------

  private spawn(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const s = this.elapsed;
    this.spawnTimer = spawnInterval(s);
    const group = 1 + Math.floor(s / 60);
    for (let i = 0; i < group && this.enemies.length < this.s.maxEnemies; i++) this.spawnOne();
  }

  private spawnOne(): void {
    const s = this.elapsed;
    const roll = Math.random();
    // New kinds join as the run goes on; later rolls fall through to plain blobs.
    const kind: Kind =
      s > 90 && roll < 0.12 ? 'brute'
      : s > 75 && roll < 0.27 ? 'splitter'
      : s > 55 && roll < 0.42 ? 'shifter'
      : s > 40 && roll < 0.6 ? 'runt'
      : 'blob';
    const def = KINDS[kind];
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 6; tries++) {
      const side = Phaser.Math.Between(0, 3);
      x = side === 0 ? def.r : side === 1 ? W - def.r : Phaser.Math.Between(def.r, W - def.r);
      y = side === 2 ? def.r : side === 3 ? H - def.r : Phaser.Math.Between(def.r, H - def.r);
      if (side < 2) y = Phaser.Math.Between(def.r, H - def.r);
      if (Math.hypot(x - this.p.x, y - this.p.y) > 220) break;
    }
    const color: InkColor = Math.random() < 0.5 ? INK.PINK : INK.TEAL;
    this.addEnemy(kind, color, x, y);
  }

  private addEnemy(kind: Kind, color: InkColor, x: number, y: number): Enemy {
    const def = KINDS[kind];
    const now = this.elapsed * 1000;
    const shadow = this.add.image(x + 3, y + 3, def.tex).setScale(def.scale).setTint(COLORS.ink).setAlpha(0.22).setDepth(2);
    const sprite = this.add.image(x, y, def.tex).setScale(def.scale).setTint(hexOf(color)).setDepth(3);
    sprite.setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 1, duration: 250 });
    const e: Enemy = {
      kind,
      color,
      x,
      y,
      r: def.r,
      speed: def.speed * Phaser.Math.FloatBetween(0.9, 1.1),
      hp: def.hp,
      dead: false,
      flashUntil: 0,
      nextShift: now + this.shiftPeriod(),
      immuneUntil: 0,
      sprite,
      shadow,
    };
    this.enemies.push(e);
    return e;
  }

  private shiftPeriod(): number {
    return this.s.shiftEveryMs + Phaser.Math.Between(-400, 400);
  }

  private updateEnemies(dt: number, now: number): void {
    const p = this.p;
    const list = this.enemies;
    for (const e of list) {
      if (e.dead) continue;
      if (e.kind === 'shifter' && now >= e.nextShift) {
        e.color = other(e.color);
        e.nextShift = now + this.shiftPeriod();
        sfx.shift();
      }
      // Ink underfoot: the opposite colour (or violet) burns and slows.
      const under = this.grid.at(e.x, e.y);
      const burning = now >= e.immuneUntil && (under === INK.VIOLET || under === other(e.color));
      if (burning) {
        e.hp -= this.s.inkDps * dt;
        if (e.hp <= 0) {
          this.kill(e, now);
          continue;
        }
      }
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const v = e.speed * (burning ? this.s.inkSlow : 1) * dt;
      e.x += Math.cos(a) * v;
      e.y += Math.sin(a) * v;

      const d = Math.hypot(p.x - e.x, p.y - e.y);
      const touch = e.r + this.s.playerRadius;
      if (d < touch) {
        if (e.color !== p.color) this.hurtPlayer(e, now);
        else {
          // Same ink: harmless, it just nuzzles up against you.
          const push = touch - d;
          e.x -= Math.cos(a) * push;
          e.y -= Math.sin(a) * push;
        }
      }
    }
    // Cheap pairwise separation so crowds spread into a ring.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
    for (const e of list) {
      if (e.dead) continue;
      e.x = Phaser.Math.Clamp(e.x, e.r, W - e.r);
      e.y = Phaser.Math.Clamp(e.y, e.r, H - e.r);
      const bob = Math.sin(now / 120 + e.x * 0.05) * 1.5;
      e.sprite.setPosition(e.x, e.y + bob);
      e.shadow.setPosition(e.x + 3, e.y + 3);
      if (now < e.flashUntil) e.sprite.setTintFill(0xffffff);
      else if (e.kind === 'shifter' && e.nextShift - now < this.s.shiftWarnMs && Math.floor(now / 80) % 2 === 0) {
        // Warning flicker: shows the colour it is about to become.
        e.sprite.setTint(hexOf(other(e.color)));
      } else e.sprite.setTint(hexOf(e.color));
    }
  }

  private kill(e: Enemy, now: number): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    sfx.splat(e.kind);
    // The blob bursts into its own ink. By default it never overprints: otherwise every
    // ink kill lands on the opposite ink it died on and sets off a blast that empties the
    // arena. The Wet Splat upgrade turns that chain back on as a late-run power spike.
    this.grid.paintCircle(e.x, e.y, KINDS[e.kind].splat, e.color, now, this.s.chainSplat === 1);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const dot = this.add.circle(e.x, e.y, Phaser.Math.Between(2, 4), hexOf(e.color)).setDepth(5);
      this.tweens.add({
        targets: dot,
        x: e.x + Math.cos(a) * Phaser.Math.Between(18, 40),
        y: e.y + Math.sin(a) * Phaser.Math.Between(18, 40),
        alpha: 0,
        duration: 320,
        onComplete: () => dot.destroy(),
      });
    }
    e.sprite.destroy();
    e.shadow.destroy();
    if (e.kind === 'splitter') this.split(e, now);
  }

  /** Two runts of the opposite colour pop out sideways. They ignore ink briefly so they do not die on landing. */
  private split(e: Enemy, now: number): void {
    const toward = Math.atan2(this.p.y - e.y, this.p.x - e.x);
    for (const side of [-1, 1]) {
      const a = toward + side * (Math.PI / 2);
      const r = this.addEnemy('runt', other(e.color), e.x, e.y);
      r.immuneUntil = now + this.s.splitImmuneMs;
      r.sprite.setAlpha(1);
      this.tweens.killTweensOf(r.sprite);
      const hop = 28;
      r.x = Phaser.Math.Clamp(e.x + Math.cos(a) * hop, r.r, W - r.r);
      r.y = Phaser.Math.Clamp(e.y + Math.sin(a) * hop, r.r, H - r.r);
      this.tweens.add({ targets: r.sprite, scale: { from: 0.2, to: KINDS.runt.scale }, duration: 180, ease: 'Back.Out' });
    }
  }

  // ---------- overprint ----------

  private blast(b: Blast): void {
    const now = this.elapsed * 1000;
    const fill = this.add.circle(b.x, b.y, b.r, COLORS.violet, 0.55).setDepth(5);
    this.tweens.add({ targets: fill, scale: { from: 0.3, to: 1 }, alpha: 0, duration: 420, onComplete: () => fill.destroy() });
    const core = this.add.circle(b.x, b.y, Math.max(10, b.r * 0.35), 0xffffff, 0.9).setDepth(5);
    this.tweens.add({ targets: core, scale: { from: 1, to: 0.2 }, alpha: 0, duration: 160, onComplete: () => core.destroy() });
    const ring = this.add.circle(b.x, b.y, b.r).setStrokeStyle(5, COLORS.violet).setDepth(5);
    this.tweens.add({ targets: ring, scale: { from: 0.5, to: 1.08 }, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
    this.cameras.main.shake(110, 0.003 + b.r / 50000);
    sfx.blast(b.r);

    // Small patches still explode (nothing vanishes silently) but hit softer.
    const damage = this.s.blastDamage * Math.min(1, 0.4 + b.cells / this.s.fullBlastCells);
    let hit = 0;
    for (const e of this.enemies.slice()) {
      if (e.dead) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) > b.r + e.r) continue;
      e.hp -= damage;
      e.flashUntil = now + 90;
      if (e.hp <= 0) {
        this.kill(e, now);
        hit++;
      }
    }
    this.bestBlast = Math.max(this.bestBlast, hit);
    if (hit >= 2) {
      const pop = this.add.text(b.x, b.y - 10, `OVERPRINT x${hit}`, text(18 + Math.min(hit, 10) * 2, { color: '#5a2d82' })).setOrigin(0.5).setDepth(9);
      this.tweens.add({ targets: pop, y: b.y - 50, alpha: 0, duration: 900, onComplete: () => pop.destroy() });
    }
  }

  // ---------- HUD ----------

  private buildHud(): void {
    this.hudRing = this.add.circle(34, 34, 18, COLORS.pink).setStrokeStyle(4, COLORS.ink).setDepth(10);
    this.add.text(34, 62, 'SPACE', text(11)).setOrigin(0.5).setDepth(10);
    this.add.text(W - 16, 46, 'M mute', text(11)).setOrigin(1, 0).setDepth(10).setAlpha(0.5);
    this.buildDrops();
    this.hudTime = this.add.text(W / 2, 14, '0:00', text(26)).setOrigin(0.5, 0).setDepth(10);
    this.hudWave = this.add.text(W / 2, 46, 'wave 1', text(12)).setOrigin(0.5, 0).setDepth(10);
    this.add.rectangle(W / 2 - 60, 64, 120, 4, COLORS.ink, 0.15).setOrigin(0, 0.5).setDepth(10);
    this.hudWaveBar = this.add.rectangle(W / 2 - 60, 64, 120, 4, COLORS.ink).setOrigin(0, 0.5).setDepth(10);
    this.hudKills = this.add.text(W - 16, 14, '0', text(26)).setOrigin(1, 0).setDepth(10);
  }

  /** HP drops; rebuilt when Spare Drop raises max HP. */
  private buildDrops(): void {
    for (const d of this.hudDrops) d.destroy();
    this.hudDrops = [];
    for (let i = 0; i < this.s.playerHp; i++) {
      this.hudDrops.push(this.add.circle(72 + i * 20, 34, 7, COLORS.ink).setStrokeStyle(2, COLORS.ink).setDepth(10));
    }
  }

  private updateHud(): void {
    this.hudRing.setFillStyle(hexOf(this.p.color));
    this.hudDrops.forEach((d, i) => d.setFillStyle(COLORS.ink, i < this.p.hp ? 1 : 0));
    this.hudTime.setText(fmt(this.elapsed));
    this.hudKills.setText(blobs(this.kills));
    this.hudWave.setText(`wave ${this.wave}`);
    const start = this.waveEnd - this.s.waveSeconds;
    this.hudWaveBar.width = 120 * Phaser.Math.Clamp((this.elapsed - start) / this.s.waveSeconds, 0, 1);
  }

  // ---------- upgrades ----------

  /** End of a wave: freeze the arena and offer up to 3 upgrades that are not maxed. */
  private openPicker(): void {
    const open = UPGRADES.filter((u) => (this.levels[u.id] ?? 0) < u.max);
    if (open.length === 0) {
      this.nextWave();
      return;
    }
    this.choices = Phaser.Utils.Array.Shuffle(open.slice()).slice(0, 3);
    this.picking = true;
    sfx.swap(INK.TEAL);

    const c = this.add.container(0, 0).setDepth(30);
    c.add(this.add.rectangle(0, 0, W, H, COLORS.paper, 0.9).setOrigin(0));
    c.add(this.add.text(W / 2, 92, `WAVE ${this.wave} DONE`, text(40, { color: '#5a2d82' })).setOrigin(0.5));
    c.add(this.add.text(W / 2, 134, 'pick one: press 1, 2, 3 or click', text(16)).setOrigin(0.5));

    const cw = 250;
    const gap = 28;
    const x0 = (W - (cw * this.choices.length + gap * (this.choices.length - 1))) / 2;
    this.choices.forEach((u, i) => {
      const x = x0 + i * (cw + gap);
      const y = 180;
      const lvl = this.levels[u.id] ?? 0;
      const card = this.add.rectangle(x, y, cw, 230, 0xffffff, 0.75).setOrigin(0).setStrokeStyle(3, COLORS.ink);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(5, i % 2 ? COLORS.teal : COLORS.pink));
      card.on('pointerout', () => card.setStrokeStyle(3, COLORS.ink));
      // pointerup, not pointerdown: the scene-wide pointerdown swaps ink.
      card.on('pointerup', () => this.pick(i));
      c.add(card);
      c.add(this.add.text(x + 14, y + 12, `${i + 1}`, text(28, { color: i % 2 ? '#2fa6c0' : '#ff5fa2' })));
      c.add(this.add.text(x + 14, y + 56, u.name, text(22, { wordWrap: { width: cw - 28 } })));
      c.add(this.add.text(x + 14, y + 100, u.text, text(15, { fontStyle: 'normal', wordWrap: { width: cw - 28 } })));
      c.add(this.add.text(x + 14, y + 196, lvl === 0 ? `new  (max ${u.max})` : `level ${lvl + 1} of ${u.max}`, text(13)).setAlpha(0.7));
    });
    this.picker = c;
  }

  private pick(i: number): void {
    if (!this.picking) return;
    const u = this.choices[i];
    if (!u) return;
    this.levels[u.id] = (this.levels[u.id] ?? 0) + 1;
    u.apply(this.s);
    if (u.id === 'drop') {
      this.p.hp = Math.min(this.s.playerHp, this.p.hp + 1);
      this.buildDrops();
    }
    sfx.swap(INK.PINK);
    this.picker?.destroy();
    this.picker = null;
    this.picking = false;
    this.nextWave();
  }

  private nextWave(): void {
    this.wave++;
    this.waveEnd = this.elapsed + this.s.waveSeconds;
    // A moment of grace: blobs were frozen right next to you while you picked.
    this.p.invulnUntil = this.elapsed * 1000 + 1200;
    const banner = this.add.text(W / 2, H / 2 - 40, `WAVE ${this.wave}`, text(44, { color: '#5a2d82' })).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: banner, alpha: 0, y: H / 2 - 80, duration: 1100, onComplete: () => banner.destroy() });
  }

  private upgradeSummary(): string {
    const taken = UPGRADES.filter((u) => this.levels[u.id]).map((u) => (this.levels[u.id] > 1 ? `${u.name} ${this.levels[u.id]}` : u.name));
    return taken.length ? taken.join(', ') : 'none';
  }

  private endRun(won: boolean): void {
    if (this.over) return;
    this.over = true;
    sfx.stopMusic();
    this.add.rectangle(0, 0, W, H, COLORS.paper, 0.86).setOrigin(0).setDepth(20);
    this.add.text(W / 2, 180, won ? 'PRINT RUN COMPLETE' : 'SMUDGED', text(56, { color: won ? '#2fa6c0' : '#ff5fa2' })).setOrigin(0.5).setDepth(21);
    this.add
      .text(W / 2, 290, `survived ${fmt(this.elapsed)}, wave ${this.wave}\n${blobs(this.kills)}\nbiggest overprint: ${this.bestBlast}\nupgrades: ${this.upgradeSummary()}`, text(20, { align: 'center', wordWrap: { width: 820 } }))
      .setOrigin(0.5)
      .setDepth(21);
    this.add.text(W / 2, 430, this.touchMode ? 'tap to reprint' : 'R to reprint', text(22)).setOrigin(0.5).setDepth(21);
    this.swapBtn.setVisible(false);
    this.stickId = null;
    this.stickGfx.clear();
  }
}

/** Seconds between spawn waves: 1.1 s at the start, 0.22 s from about 2:27 on. */
function spawnInterval(s: number): number {
  return Math.max(0.22, 1.1 - s * 0.006);
}

const blobs = (n: number) => `${n} ${n === 1 ? 'blob' : 'blobs'}`;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
