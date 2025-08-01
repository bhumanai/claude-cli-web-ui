import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
// import { SimpleApp } from './SimpleApp.tsx'
// import { StandaloneApp } from './StandaloneApp.tsx'
// import { MockApp } from './MockApp.tsx'
// import { WorkingApp } from './WorkingApp.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)