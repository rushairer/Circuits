import { defineConfig } from 'vite';

const revision = /^[a-f0-9]{40}$/.test(process.env.VITE_BUILD_REVISION ?? '')
  ? process.env.VITE_BUILD_REVISION!
  : 'local';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: { target: 'es2022' },
  plugins: [{
    name: 'circuits-build-revision',
    // Static HTML provenance allows Pages smoke tests to distinguish this
    // deployment from an older site served by a stale CDN edge.
    transformIndexHtml(html: string) {
      return html.replace('<head>', '<head><meta name="circuits-revision" content="'+revision+'">');
    }
  }]
});
