import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import '../css/style.css';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrandingProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrandingProvider>
  </React.StrictMode>
);
