import { defineConfig } from 'vite';

// GitHub Pages serves this project at https://<user>.github.io/afrobot/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/afrobot/' : '/',
}));
