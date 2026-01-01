import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AccountProvider } from './contexts/AccountContext';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

// Configure axios to send credentials (cookies) with all requests
import axios from 'axios';
axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <App />
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

