import Phaser from 'phaser';
import { ArenaScene } from './ArenaScene';
import { TitleScene } from './TitleScene';
import { H, W } from './config';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#f4ecd9',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [TitleScene, ArenaScene],
});
