import Phaser from 'phaser';
import { COLORS, FONT, H, W } from './config';
import { makeTextures } from './textures';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create(): void {
    makeTextures(this);
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.add.image(0, 0, 'paper').setOrigin(0);
    const title = { fontFamily: FONT, fontSize: '96px', fontStyle: 'bold' };
    this.add.text(W / 2 + 4, 170 + 3, 'MISPRINT', { ...title, color: '#2fa6c0' }).setOrigin(0.5).setAlpha(0.85);
    this.add.text(W / 2, 170, 'MISPRINT', { ...title, color: '#ff5fa2' }).setOrigin(0.5).setAlpha(0.85);

    const body = { fontFamily: FONT, fontSize: '20px', color: '#2a2335', align: 'center' };
    this.add
      .text(
        W / 2,
        320,
        [
          ...(coarse
            ? ['drag anywhere   roll', 'tap or SWAP     swap ink']
            : ['WASD / arrows   roll', 'SPACE / SHIFT   swap ink', 'M               mute sound']),
          '',
          'Blobs of your ink colour cannot hurt you.',
          'Your trail hurts blobs of the other colour.',
          'Roll over the other ink to overprint violet. It explodes.',
        ].join('\n'),
        body,
      )
      .setOrigin(0.5);

    const go = this.add
      .text(W / 2, H - 60, coarse ? 'tap to print' : 'press SPACE to print', { ...body, fontSize: '24px', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tweens.add({ targets: go, alpha: 0.25, yoyo: true, repeat: -1, duration: 600 });
    this.cameras.main.setBackgroundColor(COLORS.paper);

    const start = () => this.scene.start('arena');
    this.input.keyboard!.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);
  }
}
