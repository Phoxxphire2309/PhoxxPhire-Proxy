import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@renderer/App'
import '@renderer/styles.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root was not found in the document.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
