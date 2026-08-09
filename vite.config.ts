import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tengu/',
  build: {
    target: ['es2018', 'chrome74'],
    cssTarget: 'chrome74',
  },
});
