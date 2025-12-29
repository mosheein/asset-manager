import { useState, useEffect } from 'react';
import { historyApi, PortfolioSnapshot } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './History.css';

function History() {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSnapshots();
  }, []);

  const loadSnapshots = async () => {
    try {
      setLoading(true);
      const response = await historyApi.getSnapshots();
      setSnapshots(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const chartData = snapshots
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime())
    .map((snapshot) => ({
      date: new Date(snapshot.snapshot_date).toLocaleDateString(),
      value: snapshot.total_value_usd,
      valueBase: snapshot.total_value_base,
    }));

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <div className="loading">Loading history...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Portfolio History</h1>
        <button className="button" onClick={loadSnapshots}>Refresh</button>
      </div>

      {error && <div className="error">{error}</div>}

      {snapshots.length === 0 ? (
        <div className="card">
          <p>No historical data available. Upload statements to start tracking your portfolio over time.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Portfolio Value Over Time</h2>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3498db" 
                    strokeWidth={2}
                    name="Value (USD)"
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h2>Historical Snapshots</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total Value (USD)</th>
                  <th>Total Value (Base)</th>
                  <th>Base Currency</th>
                </tr>
              </thead>
              <tbody>
                {snapshots
                  .sort((a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime())
                  .map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td>{new Date(snapshot.snapshot_date).toLocaleDateString()}</td>
                      <td><strong>{formatCurrency(snapshot.total_value_usd)}</strong></td>
                      <td>{formatCurrency(snapshot.total_value_base)}</td>
                      <td>{snapshot.base_currency}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default History;

