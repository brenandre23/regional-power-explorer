import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installDataGuard } from './utils/dataGuard'
import { appPath } from './utils/paths'

installDataGuard()

// Unzips the data files the Design Studio server sends raw; see gzipData in
// vite.config.js. Vercel (base '/') compresses on its own.
if (import.meta.env.PROD && import.meta.env.BASE_URL !== '/' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(appPath('sw.js'), { scope: import.meta.env.BASE_URL })
    .catch(() => { /* the raw files still load */ })
}

// A tab opened before a deploy still asks for the old build's code files (the
// export, the chat, the inner pages), which the deploy has replaced. Reload once
// to pick up the new build; the flag stops a loop if the file is truly missing.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('rpe-reloaded')) return
    sessionStorage.setItem('rpe-reloaded', '1')
  } catch { return }
  e.preventDefault()
  location.reload()
})
window.addEventListener('load', () => {
  setTimeout(() => { try { sessionStorage.removeItem('rpe-reloaded') } catch { /* private mode */ } }, 10000)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
