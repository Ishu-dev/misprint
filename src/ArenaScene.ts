import Phaser from 'phaser';
import { COLORS, FONT, H, INK, KINDS, T, W, hexOf, other, type InkColor, type Kind } from './config';
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

  private hudRing!: Phaser.GameObjects.Arc;
  private hudDrops: Phaser.GameObjects.Arc[] = [];
  private hudTime!: Phaser.GameObjects.Text;
  private hudKills!: Phaser.GameObjects.Text;

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

    this.add.image(0, 0, 'paper').setOrigin(0).setDepth(0);
    this.grid = new InkGrid(W, H);
    this.inkGfx = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.p = { x: W / 2, y: H / 2, color: INK.PINK, hp: T.playerHp, angle: 0, invulnUntil: 0, swapReadyAt: 0 };
    this.bodyShadow = this.add.image(0, 0, 'player').setTint(COLORS.ink).setAlpha(0.25).setDepth(2);
    this.roller = this.add.image(0, 0, 'roller').setDepth(4);
    this.body = this.add.image(0, 0, 'player').setDepth(4);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT') as Keys;
    // Key events, not JustDown: a tap shorter than one frame would be lost.
    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.swap());
    kb.on('keydown-SHIFT', () => this.swap());
    kb.on('keydown-M', () => sfx.toggleMute());
    kb.on('keydown-R', () => {
      if (this.over) this.scene.restart();
    });
    this.input.on('pointerdown', () => this.swap());

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
    if (this.over) return;
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

    if (this.elapsed >= T.runSeconds) this.endRun(true);
  }

  // ---------- player ----------

  private swap(): void {
    if (this.over) return;
    const now = this.elapsed * 1000;
    if (now < this.p.swapReadyAt) return;
    this.p.swapReadyAt = now + T.swapCooldownMs;
    this.p.color = other(this.p.color);
    sfx.swap(this.p.color);
    this.tweens.add({ targets: this.body, scale: { from: 1.35, to: 1 }, duration: 160 });
  }

  private movePlayer(dt: number, now: number): void {
    const k = this.keys;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const m = T.playerRadius;
    const ox = this.p.x;
    const oy = this.p.y;
    this.p.x = Phaser.Math.Clamp(ox + dx * T.playerSpeed * dt, m, W - m);
    this.p.y = Phaser.Math.Clamp(oy + dy * T.playerSpeed * dt, m, H - m);
    this.p.angle = Math.atan2(dy, dx);

    // Roll the drum along the path in small steps so fast frames leave no gaps.
    const dist = Math.hypot(this.p.x - ox, this.p.y - oy);
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rx = ox + (this.p.x - ox) * t + Math.cos(this.p.angle) * 12;
      const ry = oy + (this.p.y - oy) * t + Math.sin(this.p.angle) * 12;
      this.grid.paintCircle(rx, ry, T.rollerRadius, this.p.color, now);
    }
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
    this.p.invulnUntil = now + T.invulnMs;
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
    for (let i = 0; i < group && this.enemies.length < T.maxEnemies; i++) this.spawnOne();
  }

  private spawnOne(): void {
    const s = this.elapsed;
    const roll = Math.random();
    const kind: Kind = s > 90 && roll < 0.12 ? 'brute' : s > 40 && roll < 0.35 ? 'runt' : 'blob';
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
    const shadow = this.add.image(x + 3, y + 3, 'blob').setScale(def.scale).setTint(COLORS.ink).setAlpha(0.22).setDepth(2);
    const sprite = this.add.image(x, y, 'blob').setScale(def.scale).setTint(hexOf(color)).setDepth(3);
    sprite.setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 1, duration: 250 });
    this.enemies.push({ kind, color, x, y, r: def.r, speed: def.speed * Phaser.Math.FloatBetween(0.9, 1.1), hp: def.hp, dead: false, flashUntil: 0, sprite, shadow });
  }

  private updateEnemies(dt: number, now: number): void {
    const p = this.p;
    const list = this.enemies;
    for (const e of list) {
      if (e.dead) continue;
      // Ink underfoot: the opposite colour (or violet) burns and slows.
      const under = this.grid.at(e.x, e.y);
      const burning = under === INK.VIOLET || under === other(e.color);
      if (burning) {
        e.hp -= T.inkDps * dt;
        if (e.hp <= 0) {
          this.kill(e, now);
          continue;
        }
      }
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      const v = e.speed * (burning ? T.inkSlow : 1) * dt;
      e.x += Math.cos(a) * v;
      e.y += Math.sin(a) * v;

      const d = Math.hypot(p.x - e.x, p.y - e.y);
      const touch = e.r + T.playerRadius;
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
      else e.sprite.setTint(hexOf(e.color));
    }
  }

  private kill(e: Enemy, now: number): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    sfx.splat(e.kind);
    // The blob bursts into its own ink. Landing on the other colour starts a chain.
    this.grid.paintCircle(e.x, e.y, KINDS[e.kind].splat, e.color, now);
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
  }

  // ---------- overprint ----------

  private blast(b: Blast): void {
    const now = this.elapsed * 1000;
    const fill = this.add.circle(b.x, b.y, b.r, COLORS.violet, 0.4).setDepth(5).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.tweens.add({ targets: fill, scale: { from: 0.3, to: 1 }, alpha: 0, duration: 380, onComplete: () => fill.destroy() });
    const ring = this.add.circle(b.x, b.y, b.r).setStrokeStyle(5, COLORS.violet).setDepth(5);
    this.tweens.add({ targets: ring, scale: { from: 0.5, to: 1.08 }, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
    this.cameras.main.shake(110, 0.003 + b.r / 50000);
    sfx.blast(b.r);

    let hit = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) > b.r + e.r) continue;
      e.hp -= T.blastDamage;
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
    this.hudDrops = [];
    for (let i = 0; i < T.playerHp; i++) {
      this.hudDrops.push(this.add.circle(72 + i * 20, 34, 7, COLORS.ink).setStrokeStyle(2, COLORS.ink).setDepth(10));
    }
    this.hudTime = this.add.text(W / 2, 14, '0:00', text(26)).setOrigin(0.5, 0).setDepth(10);
    this.hudKills = this.add.text(W - 16, 14, '0', text(26)).setOrigin(1, 0).setDepth(10);
  }

  private updateHud(): void {
    this.hudRing.setFillStyle(hexOf(this.p.color));
    this.hudDrops.forEach((d, i) => d.setFillStyle(COLORS.ink, i < this.p.hp ? 1 : 0));
    this.hudTime.setText(fmt(this.elapsed));
    this.hudKills.setText(`${this.kills} blobs`);
  }

  private endRun(won: boolean): void {
    if (this.over) return;
    this.over = true;
    sfx.stopMusic();
    this.add.rectangle(0, 0, W, H, COLORS.paper, 0.86).setOrigin(0).setDepth(20);
    this.add.text(W / 2, 180, won ? 'PRINT RUN COMPLETE' : 'SMUDGED', text(56, { color: won ? '#2fa6c0' : '#ff5fa2' })).setOrigin(0.5).setDepth(21);
    this.add
      .text(W / 2, 290, `survived ${fmt(this.elapsed)}\n${this.kills} blobs\nbiggest overprint: ${this.bestBlast}`, text(24, { align: 'center' }))
      .setOrigin(0.5)
      .setDepth(21);
    this.add.text(W / 2, 410, 'R to reprint', text(22)).setOrigin(0.5).setDepth(21);
  }
}

/** Seconds between spawn waves: 1.1 s at the start, 0.22 s from about 2:27 on. */
function spawnInterval(s: number): number {
  return Math.max(0.22, 1.1 - s * 0.006);
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
