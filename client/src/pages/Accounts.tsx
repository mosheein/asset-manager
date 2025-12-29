import { useState, useEffect } from 'react';
import { accountsApi, statementsApi, Account } from '../api';
import './Accounts.css';

function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    ib_account_id: '',
    base_currency: 'USD',
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await accountsApi.getAll();
      setAccounts(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await accountsApi.create(formData);
      setFormData({ name: '', ib_account_id: '', base_currency: 'USD' });
      setShowForm(false);
      loadAccounts();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create account');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await accountsApi.delete(id);
      loadAccounts();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete account');
    }
  };

  const handleFileUpload = async (accountId: number, file: File) => {
    try {
      setUploading(accountId);
      await statementsApi.upload(accountId, file);
      alert('Statement uploaded and parsed successfully!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to upload statement');
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return <div className="loading">Loading accounts...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Accounts</h1>
        <button className="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Account'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {showForm && (
        <div className="card">
          <h2>Add New Account</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Account Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>IB Account ID</label>
              <input
                type="text"
                value={formData.ib_account_id}
                onChange={(e) => setFormData({ ...formData, ib_account_id: e.target.value })}
                required
                placeholder="U***3705"
              />
            </div>
            <div className="form-group">
              <label>Base Currency</label>
              <select
                value={formData.base_currency}
                onChange={(e) => setFormData({ ...formData, base_currency: e.target.value })}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <button type="submit" className="button">Create Account</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Your Accounts</h2>
        {accounts.length === 0 ? (
          <p>No accounts yet. Add your first account above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>IB Account ID</th>
                <th>Base Currency</th>
                <th>Upload Statement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.ib_account_id}</td>
                  <td>{account.base_currency}</td>
                  <td>
                    <label className="upload-button">
                      {uploading === account.id ? 'Uploading...' : 'Upload PDF'}
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(account.id, file);
                        }}
                        disabled={uploading === account.id}
                      />
                    </label>
                  </td>
                  <td>
                    <button
                      className="button button-danger"
                      onClick={() => handleDelete(account.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Accounts;

