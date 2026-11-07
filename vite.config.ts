import { defineConfig } from 'vite';

// GitHub Pages serves the build at https://ishu-dev.github.io/misprint/.
// The dev server stays at / so localhost URLs do not change.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/misprint/' : '/',
}));
