import Phaser from 'phaser';
import { COLORS, H, W } from './config';

/** All art is generated from shapes so the prototype needs no asset files. */
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('blob')) return;
  const g = scene.add.graphics();

  // Blob: white body (tinted per ink at runtime), dark eyes survive the tint.
  g.fillStyle(0xffffff);
  g.fillCircle(16, 13, 11);
  g.fillRect(5, 13, 22, 12);
  g.fillCircle(8.5, 25, 3.6);
  g.fillCircle(16, 25, 3.6);
  g.fillCircle(23.5, 25, 3.6);
  g.fillStyle(COLORS.ink);
  g.fillCircle(12, 12, 2.2);
  g.fillCircle(20, 12, 2.2);
  g.generateTexture('blob', 32, 32);
  g.clear();

  // Shifter: blob body with two dark chevrons on the brow, so it reads as "the one that changes".
  g.fillStyle(0xffffff);
  g.fillCircle(16, 13, 11);
  g.fillRect(5, 13, 22, 12);
  g.fillCircle(8.5, 25, 3.6);
  g.fillCircle(16, 25, 3.6);
  g.fillCircle(23.5, 25, 3.6);
  g.fillStyle(COLORS.ink);
  g.fillTriangle(9, 7, 16, 3, 23, 7);
  g.fillStyle(0xffffff);
  g.fillTriangle(11, 7, 16, 4.5, 21, 7);
  g.fillStyle(COLORS.ink);
  g.fillCircle(12, 13, 2.2);
  g.fillCircle(20, 13, 2.2);
  g.fillRect(9, 19, 14, 2);
  g.generateTexture('shifter', 32, 32);
  g.clear();

  // Splitter: wide blob with a dark crack down the middle and an eye on each half.
  g.fillStyle(0xffffff);
  g.fillCircle(10, 13, 9);
  g.fillCircle(22, 13, 9);
  g.fillRect(3, 13, 26, 12);
  g.fillCircle(7, 25, 3.6);
  g.fillCircle(16, 25, 3.6);
  g.fillCircle(25, 25, 3.6);
  g.lineStyle(2, COLORS.ink);
  g.beginPath();
  g.moveTo(16, 4);
  g.lineTo(14, 10);
  g.lineTo(18, 15);
  g.lineTo(14, 21);
  g.lineTo(16, 27);
  g.strokePath();
  g.fillStyle(COLORS.ink);
  g.fillCircle(9, 13, 2.2);
  g.fillCircle(23, 13, 2.2);
  g.generateTexture('splitter', 32, 32);
  g.clear();

  // Player: round printer's devil with an outline.
  g.fillStyle(0xffffff);
  g.fillCircle(16, 16, 12);
  g.lineStyle(3, COLORS.ink);
  g.strokeCircle(16, 16, 12);
  g.fillStyle(COLORS.ink);
  g.fillCircle(12, 14, 2);
  g.fillCircle(20, 14, 2);
  g.generateTexture('player', 32, 32);
  g.clear();

  // Roller drum, drawn horizontally; rotated to face the move direction.
  g.fillStyle(COLORS.ink);
  g.fillRoundedRect(0, 0, 30, 10, 4);
  g.fillStyle(0xffffff);
  g.fillRect(4, 3, 22, 4);
  g.generateTexture('roller', 30, 10);
  g.clear();

  // Paper with faint specks.
  g.fillStyle(COLORS.paper);
  g.fillRect(0, 0, W, H);
  const rnd = new Phaser.Math.RandomDataGenerator(['misprint']);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle(COLORS.ink, rnd.realInRange(0.03, 0.09));
    g.fillRect(rnd.between(0, W), rnd.between(0, H), rnd.between(1, 2), 1);
  }
  g.generateTexture('paper', W, H);
  g.destroy();
}
