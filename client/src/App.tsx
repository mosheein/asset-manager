import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Accounts from './pages/Accounts';
import Portfolio from './pages/Portfolio';
import Targets from './pages/Targets';
import Rebalancing from './pages/Rebalancing';
import History from './pages/History';
import DebugPDF from './pages/DebugPDF';
import { useAccount } from './contexts/AccountContext';
import './App.css';

function App() {
  const location = useLocation();
  const { accounts, selectedAccountId, setSelectedAccountId, loading } = useAccount();

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
              to="/accounts" 
              className={location.pathname === '/accounts' ? 'active' : ''}
            >
              Accounts
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
            <Link 
              to="/debug" 
              className={location.pathname === '/debug' ? 'active' : ''}
            >
              Debug PDF
            </Link>
          </div>
          {!loading && (
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
          )}
        </div>
      </nav>

      <main className="main-content">
        <Routes>
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

