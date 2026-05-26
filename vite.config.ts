import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const shouldUploadSentrySourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_WEB_PROJECT,
)

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: shouldUploadSentrySourceMaps ? 'hidden' : false,
  },
  plugins: [
    react(),
    // Docs: Sentry's Vite plugin uploads source maps during CI builds and can
    // delete local .map files after upload.
    // https://www.npmjs.com/package/@sentry/vite-plugin
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_WEB_PROJECT,
      release: {
        name: process.env.SENTRY_RELEASE || process.env.VITE_SENTRY_RELEASE,
      },
      sourcemaps: {
        assets: './dist/assets/**',
        filesToDeleteAfterUpload: './dist/assets/**/*.map',
      },
      telemetry: false,
      disable: !shouldUploadSentrySourceMaps,
    }),
  ],
})
