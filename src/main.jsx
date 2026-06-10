import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { storage } from './lib/storage.js';
import './index.css';

// Expose the Supabase-backed storage as window.storage
// so the existing App component works unchanged.
if (typeof window !== 'undefined') {
  window.storage = storage;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
