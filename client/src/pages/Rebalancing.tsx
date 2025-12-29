import { useState, useEffect } from 'react';
import { rebalancingApi, targetsApi, RebalancingPlan, RebalancingAction, AssetStatus, TargetAllocation } from '../api';
import { useAccount } from '../contexts/AccountContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import './Rebalancing.css';

function Rebalancing() {
  const [plan, setPlan] = useState<RebalancingPlan | null>(null);
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(1.0);
  const [showAllAssets, setShowAllAssets] = useState(true);
  const { selectedAccountId } = useAccount();

  useEffect(() => {
    loadPlan();
  }, [tolerance, selectedAccountId]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      const [planRes, targetsRes] = await Promise.all([
        rebalancingApi.getPlan(tolerance, selectedAccountId || undefined),
        targetsApi.getAll(selectedAccountId || undefined),
      ]);
      setPlan(planRes.data);
      setTargets(targetsRes.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load rebalancing plan');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return <div className="loading">Calculating rebalancing plan...</div>;
  }

  if (!plan) {
    return <div className="error">No rebalancing plan available. Make sure you have holdings and target allocations configured.</div>;
  }

  const buyActions = plan.actions.filter(a => a.action === 'BUY');
  const sellActions = plan.actions.filter(a => a.action === 'SELL');
  
  // Ensure allAssets exists (for backward compatibility)
  if (!plan.allAssets) {
    plan.allAssets = [];
  }

  const getStatusBadge = (status: AssetStatus['status']) => {
    switch (status) {
      case 'needs_buy':
        return <span className="status-badge status-buy">Needs Buy</span>;
      case 'needs_sell':
        return <span className="status-badge status-sell">Needs Sell</span>;
      case 'balanced':
        return <span className="status-badge status-ok">Balanced</span>;
    }
  };

  // Calculate target allocations by asset type
  const targetAllocationsByType = new Map<string, number>();
  targets.forEach(target => {
    const current = targetAllocationsByType.get(target.asset_type) || 0;
    targetAllocationsByType.set(target.asset_type, current + target.target_percentage);
  });
  const targetPieData = Array.from(targetAllocationsByType.entries())
    .map(([assetType, percentage]) => ({
      name: assetType,
      value: percentage,
      percentage: percentage.toFixed(2),
    }))
    .sort((a, b) => b.value - a.value);

  // Calculate current portfolio allocations by asset type
  const currentPieDataMap = new Map<string, number>();
  if (plan && plan.allAssets) {
    plan.allAssets.forEach(asset => {
      // Use assetType from AssetStatus if available, otherwise try to find from targets
      let assetType = (asset as any).assetType;
      if (!assetType) {
        // Fallback: find target by symbol
        const target = targets.find(t => 
          t.symbol && t.symbol.toUpperCase() === asset.symbol.toUpperCase()
        );
        assetType = target?.asset_type;
      }
      if (assetType) {
        const current = currentPieDataMap.get(assetType) || 0;
        currentPieDataMap.set(assetType, current + asset.currentAllocation);
      }
    });
  }
  
  const currentPieData = Array.from(currentPieDataMap.entries())
    .map(([assetType, percentage]) => ({
      name: assetType,
      value: percentage,
      percentage: percentage.toFixed(2),
    }))
    .sort((a, b) => b.value - a.value);

  const COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#34495e'];

  return (
    <div>
      <div className="page-header">
        <h1>Rebalancing Suggestions</h1>
        <div className="header-controls">
          <label>
            Tolerance: {tolerance}%
            <input
              type="range"
              min="0.1"
              max="5"
              step="0.1"
              value={tolerance}
              onChange={(e) => setTolerance(parseFloat(e.target.value))}
              style={{ marginLeft: '1rem' }}
            />
          </label>
          <label style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={showAllAssets}
              onChange={(e) => setShowAllAssets(e.target.checked)}
            />
            Show all assets
          </label>
          <button className="button" onClick={loadPlan}>Refresh</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {/* Pie Charts Comparison */}
      {(targetPieData.length > 0 || currentPieData.length > 0) && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2>Target vs Current Allocation by Asset Type</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1rem' }}>
            {/* Target Allocations Pie Chart */}
            <div>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Target Allocations</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={targetPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {targetPieData.map((_, index) => (
                      <Cell key={`target-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Current Portfolio Pie Chart */}
            <div>
              <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>Current Portfolio</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={currentPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {currentPieData.map((_, index) => (
                      <Cell key={`current-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="rebalancing-summary">
        <div className="summary-card">
          <div className="summary-label">Total Portfolio Value</div>
          <div className="summary-value">{formatCurrency(plan.totalValue)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total to Buy</div>
          <div className="summary-value buy">{formatCurrency(plan.totalBuy)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total to Sell</div>
          <div className="summary-value sell">{formatCurrency(plan.totalSell)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Net Cash Needed</div>
          <div className={`summary-value ${plan.netCashNeeded >= 0 ? 'buy' : 'sell'}`}>
            {formatCurrency(plan.netCashNeeded)}
          </div>
        </div>
      </div>

      {showAllAssets ? (
        <div className="card">
          <h2>All Assets Status</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Status</th>
                <th>Current %</th>
                <th>Target %</th>
                <th>Deviation</th>
                <th>Current Value</th>
                <th>Target Value</th>
                <th>Adjustment</th>
              </tr>
            </thead>
            <tbody>
              {plan.allAssets.map((asset, idx) => (
                <tr 
                  key={idx}
                  className={asset.status === 'balanced' ? 'asset-balanced' : asset.status === 'needs_buy' ? 'asset-needs-buy' : 'asset-needs-sell'}
                >
                  <td>
                    <strong>{asset.symbol}</strong>
                    {asset.mappedTargetSymbol && (
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        fontSize: '0.85em', 
                        color: '#666',
                        fontStyle: 'italic'
                      }}>
                        → {asset.mappedTargetSymbol}
                        <span style={{ 
                          marginLeft: '0.25rem',
                          color: '#ff9800',
                          fontWeight: 'bold'
                        }} title="This holding is mapped to a target symbol. Consider replacing it with the target symbol.">
                          ⚠
                        </span>
                      </span>
                    )}
                  </td>
                  <td>{getStatusBadge(asset.status)}</td>
                  <td>{formatPercentage(asset.currentAllocation)}</td>
                  <td>{formatPercentage(asset.targetAllocation)}</td>
                  <td className={asset.deviation > 0 ? 'deviation positive' : asset.deviation < 0 ? 'deviation negative' : ''}>
                    {formatPercentage(Math.abs(asset.deviation))}
                  </td>
                  <td>{formatCurrency(asset.currentValue)}</td>
                  <td>{formatCurrency(asset.targetValue)}</td>
                  <td className={asset.adjustmentNeeded > 0 ? 'buy' : asset.adjustmentNeeded < 0 ? 'sell' : ''}>
                    {asset.adjustmentNeeded > 0 ? '+' : ''}{formatCurrency(asset.adjustmentNeeded)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {plan.actions.length === 0 ? (
            <div className="card">
              <p className="success-message">
                Your portfolio is well-balanced! No rebalancing actions needed within the {tolerance}% tolerance.
              </p>
            </div>
          ) : (
            <>
              {buyActions.length > 0 && (
                <div className="card">
                  <h2>Buy Orders</h2>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Status</th>
                        <th>Quantity</th>
                        <th>Amount</th>
                        <th>Current %</th>
                        <th>Target %</th>
                        <th>Deviation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyActions.map((action, idx) => (
                        <tr key={idx}>
                          <td><strong>{action.symbol}</strong></td>
                          <td>{getStatusBadge(action.status)}</td>
                          <td>{action.quantity.toFixed(4)}</td>
                          <td>{formatCurrency(action.amount)}</td>
                          <td>{formatPercentage(action.currentAllocation)}</td>
                          <td>{formatPercentage(action.targetAllocation)}</td>
                          <td className="deviation negative">{formatPercentage(action.deviation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {sellActions.length > 0 && (
                <div className="card">
                  <h2>Sell Orders</h2>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Status</th>
                        <th>Quantity</th>
                        <th>Amount</th>
                        <th>Current %</th>
                        <th>Target %</th>
                        <th>Deviation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellActions.map((action, idx) => (
                        <tr key={idx}>
                          <td><strong>{action.symbol}</strong></td>
                          <td>{getStatusBadge(action.status)}</td>
                          <td>{action.quantity.toFixed(4)}</td>
                          <td>{formatCurrency(action.amount)}</td>
                          <td>{formatPercentage(action.currentAllocation)}</td>
                          <td>{formatPercentage(action.targetAllocation)}</td>
                          <td className="deviation positive">{formatPercentage(action.deviation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Rebalancing;

