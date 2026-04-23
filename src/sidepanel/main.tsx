import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import SidePanelApp from './SidePanelApp'

// Remove static skeleton before React takes over (prevents flash of empty root)
const skeleton = document.getElementById('iris-skeleton')
if (skeleton) skeleton.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
)
