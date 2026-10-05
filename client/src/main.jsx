import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './styles/darkTheme.css'

// Mobile view lives at /m — lazy so its code and CSS load only on that path.
const MobileApp = React.lazy(() => import('./mobile/MobileApp.jsx'))
const isMobile = window.location.pathname === '/m' || window.location.pathname.startsWith('/m/')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isMobile ? (
      <React.Suspense fallback={null}>
        <MobileApp />
      </React.Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
