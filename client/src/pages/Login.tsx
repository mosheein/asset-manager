import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

function Login() {
  const { authenticated, loading, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && authenticated) {
      // Already authenticated, redirect to home
      navigate('/');
    }
  }, [authenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="loading">Checking authentication...</div>
        </div>
      </div>
    );
  }

  if (authenticated) {
    return null; // Will redirect
  }

  // Check for error in URL
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Asset Manager</h1>
        <p className="login-subtitle">Sign in to access your portfolio</p>
        
        {error === 'not_configured' && (
          <div style={{ 
            padding: '1rem', 
            marginBottom: '1rem', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffc107',
            borderRadius: '4px',
            color: '#856404'
          }}>
            <strong>⚠️ Google OAuth not configured</strong><br/>
            Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.
          </div>
        )}
        
        {error === 'auth_failed' && (
          <div style={{ 
            padding: '1rem', 
            marginBottom: '1rem', 
            backgroundColor: '#f8d7da', 
            border: '1px solid #dc3545',
            borderRadius: '4px',
            color: '#721c24'
          }}>
            <strong>❌ Authentication failed</strong><br/>
            Please try again or check your Google OAuth configuration.
          </div>
        )}
        
        <button className="login-button" onClick={login}>
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '0.75rem' }}>
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>
        
        <p className="login-note">
          Your financial data is private and secure. Only you can access your portfolio.
        </p>
      </div>
    </div>
  );
}

export default Login;
