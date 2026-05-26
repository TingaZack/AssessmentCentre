import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initFrontendSentry, reactRootErrorHandler } from './lib/sentry'

initFrontendSentry()

createRoot(document.getElementById('root')!, {
  onCaughtError: reactRootErrorHandler,
  onRecoverableError: reactRootErrorHandler,
  onUncaughtError: reactRootErrorHandler,
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
