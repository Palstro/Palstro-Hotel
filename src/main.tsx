import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Routing lives in App via createBrowserRouter/RouterProvider (a DATA router,
// required by useDirtyForm's useBlocker — see App.tsx). So there is no
// <BrowserRouter> here; the data router IS the router.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
