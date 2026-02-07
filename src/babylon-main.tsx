import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BabylonApp } from './components/babylon/BabylonApp'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BabylonApp />
    </ErrorBoundary>
  </StrictMode>,
)
