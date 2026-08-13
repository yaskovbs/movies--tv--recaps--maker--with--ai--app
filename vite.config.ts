import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Use relative asset paths so the built app also works inside Electron (file://)
  base: './',

  // Vite only inlines env vars matching one of these prefixes into the client
  // bundle. VITE_* is the app's own convention; NEXT_PUBLIC_* is accepted too
  // so the exact variable names Supabase's own "Connect" instructions suggest
  // (written for Next.js) also work here without renaming anything in
  // Cloudflare Pages - see src/lib/supabase.ts.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],

  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  optimizeDeps: {
    exclude: ['lucide-react', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
