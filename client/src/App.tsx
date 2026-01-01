import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import Accounts from './pages/Accounts';
import Portfolio from './pages/Portfolio';
import Targets from './pages/Targets';
import Rebalancing from './pages/Rebalancing';
import History from './pages/History';
import DebugPDF from './pages/DebugPDF';
import Login from './pages/Login';
import { useAccount } from './contexts/AccountContext';
import { useAuth } from './contexts/AuthContext';
import './App.css';

function App() {
  const location = useLocation();
  const { accounts, selectedAccountId, setSelectedAccountId, loading } = useAccount();
  const { authenticated, loading: authLoading, user, logout } = useAuth();
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const isSettingsPage = location.pathname === '/accounts' || location.pathname === '/debug';
  
  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="loading">Loading...</div>
      </div>
    );
  }
  
  // If not authenticated and not on login page, redirect to login
  if (!authenticated && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }
  
  // If authenticated and on login page, redirect to home
  if (authenticated && location.pathname === '/login') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-container">
          <h1 className="nav-title">Asset Manager</h1>
          <div className="nav-links">
            <Link 
              to="/" 
              className={location.pathname === '/' ? 'active' : ''}
            >
              Portfolio
            </Link>
            <Link 
              to="/targets" 
              className={location.pathname === '/targets' ? 'active' : ''}
            >
              Targets
            </Link>
            <Link 
              to="/rebalancing" 
              className={location.pathname === '/rebalancing' ? 'active' : ''}
            >
              Rebalancing
            </Link>
            <Link 
              to="/history" 
              className={location.pathname === '/history' ? 'active' : ''}
            >
              History
            </Link>
          </div>
          {!loading && authenticated && (
            <div className="nav-right-section">
              {user && (
                <div className="nav-user-info" title={user.email}>
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="nav-user-avatar" />
                  ) : (
                    <div className="nav-user-avatar-placeholder">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="nav-user-name">{user.name}</span>
                </div>
              )}
              <div className="nav-account-selector">
                <select
                  value={selectedAccountId || ''}
                  onChange={(e) => setSelectedAccountId(e.target.value ? parseInt(e.target.value) : null)}
                  style={{ 
                    padding: '0.5rem', 
                    fontSize: '0.9rem', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="">All Accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.ib_account_id})
                    </option>
                  ))}
                </select>
              </div>
              <div 
                className="nav-settings-dropdown"
              >
                <button 
                  className={`nav-settings-button ${isSettingsPage ? 'active' : ''}`}
                  onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                  onBlur={() => setTimeout(() => setShowSettingsMenu(false), 200)}
                  title="Settings"
                >
                  ⚙️
                </button>
                {showSettingsMenu && (
                  <div className="nav-settings-menu" onMouseDown={(e) => e.preventDefault()}>
                    <Link 
                      to="/accounts" 
                      className={location.pathname === '/accounts' ? 'active' : ''}
                      onClick={() => setShowSettingsMenu(false)}
                    >
                      Accounts
                    </Link>
                    <Link 
                      to="/debug" 
                      className={location.pathname === '/debug' ? 'active' : ''}
                      onClick={() => setShowSettingsMenu(false)}
                    >
                      Debug PDF
                    </Link>
                    <div className="nav-settings-divider"></div>
                    <button
                      className="nav-settings-logout"
                      onClick={async () => {
                        await logout();
                        setShowSettingsMenu(false);
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Portfolio />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/rebalancing" element={<Rebalancing />} />
          <Route path="/history" element={<History />} />
          <Route path="/debug" element={<DebugPDF />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

