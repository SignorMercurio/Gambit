import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal typing for the Node process global so we can read PORT without
// pulling in @types/node just for this file.
declare const process: { env: { PORT?: string } };

export default defineConfig({
  plugins: [react()],
  server: {
    // Some dev harnesses assign a fallback port via PORT when the configured
    // one is busy; honor it exactly so the preview attaches to the port Vite
    // actually binds.
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.PORT),
  },
});
