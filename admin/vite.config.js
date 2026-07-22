import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the built site works whether it's
// served from a domain root or a subpath (e.g. GitHub Pages project site).
export default defineConfig({
  base: './',
  plugins: [react()],
});
