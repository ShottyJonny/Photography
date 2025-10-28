import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { initializeEmailJS } from './services/emailService'

// Initialize EmailJS
initializeEmailJS()

// Dev helper: Press Ctrl+Alt+Shift+X to clear site localStorage pricing cache & reload
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === 'x') {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {}
    location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
