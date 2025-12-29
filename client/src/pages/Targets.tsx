import { useState, useEffect } from 'react';
import { targetsApi, TargetAllocation } from '../api';
import { useAccount } from '../contexts/AccountContext';
import './Targets.css';

function Targets() {
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedAccountId } = useAccount();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    targets: Array<{
      asset_type: string;
      asset_category: string | null;
      target_percentage: number;
      instrument?: string | null;
      isin?: string | null;
      ticker?: string | null;
      _needsTickerConfirmation?: boolean;
      _tickerOptions?: Array<{
        ticker: string;
        exchange?: string;
        name?: string;
        confidence: 'high' | 'medium' | 'low';
      }> | null;
    }>;
    warnings: string[];
    errors: string[];
    totalPercentage: number;
    tickerLookups?: Array<{
      index: number;
      isin?: string;
      instrument?: string;
      tickers: Array<{
        ticker: string;
        exchange?: string;
        name?: string;
        confidence: 'high' | 'medium' | 'low';
      }>;
    }>;
  } | null>(null);
  const [tickerSelections, setTickerSelections] = useState<Map<number, string>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [expandedAssetTypes, setExpandedAssetTypes] = useState<Set<string>>(new Set());
  const [expandedPreviewTypes, setExpandedPreviewTypes] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    asset_type: '',
    asset_category: '',
    symbol: '',
    isin: '',
    target_percentage: 0,
    bucket: '',
  });

  useEffect(() => {
    loadTargets();
  }, [selectedAccountId]);

  const loadTargets = async () => {
    try {
      setLoading(true);
      const targetsRes = await targetsApi.getAll(selectedAccountId || undefined);
      setTargets(targetsRes.data);
      // Names are now included in the target response from the backend
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load targets');
    } finally {
      setLoading(false);
    }
  };
  
  const getAssetName = (target: TargetAllocation): string | null => {
    // Name is now included directly in the target object from the backend
    return target.name || null;
  };

  const renderISIN = (target: TargetAllocation) => {
    if (!target.isin) {
      return '-';
    }
    
    // Only make ISIN a link if it's NOT a stock (ETFs, bonds, etc. should be linked)
    if (target.asset_type !== 'Stock') {
      return (
        <a
          href={`https://www.justetf.com/en/etf-profile.html?isin=${target.isin}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#3498db', textDecoration: 'underline' }}
        >
          {target.isin}
        </a>
      );
    }
    
    // For stocks, just display the ISIN as text
    return target.isin;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await targetsApi.create({
        asset_type: formData.asset_type,
        asset_category: formData.asset_category || undefined,
        symbol: formData.symbol || undefined,
        isin: formData.isin || undefined,
        target_percentage: formData.target_percentage,
        bucket: formData.bucket || undefined,
      });
      setFormData({ asset_type: '', asset_category: '', symbol: '', isin: '', target_percentage: 0, bucket: '' });
      setShowForm(false);
      loadTargets();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create target');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this target?')) return;
    try {
      await targetsApi.delete(id);
      loadTargets();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete target');
    }
  };

  const handleExcelUpload = async (file: File) => {
    try {
      setUploading(true);
      setError(null);
      setWarnings([]);
      setPreviewData(null);
      
      const response = await targetsApi.uploadExcelPreview(file);
      
      // Show errors if any (from parsing)
      if (response.data.errors && response.data.errors.length > 0) {
        setError('Excel parsing errors:\n' + response.data.errors.join('\n'));
        return;
      }
      
      // Show preview
      setPreviewData({
        targets: response.data.targets,
        warnings: response.data.warnings || [],
        errors: response.data.errors || [],
        totalPercentage: response.data.totalPercentage,
        tickerLookups: response.data.tickerLookups || [],
      });
      
      // Initialize ticker selections for targets with detected tickers
      const selections = new Map<number, string>();
      response.data.targets.forEach((target: any, index: number) => {
        if (target.ticker) {
          selections.set(index, target.ticker);
        }
      });
      setTickerSelections(selections);
      
      if (response.data.warnings && response.data.warnings.length > 0) {
        setWarnings(response.data.warnings);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to upload Excel file';
      const errors = err.response?.data?.errors || [];
      const warnings = err.response?.data?.warnings || [];
      
      if (errors.length > 0) {
        setError(errorMsg + '\n' + errors.join('\n'));
      } else {
        setError(errorMsg);
      }
      
      if (warnings.length > 0) {
        setWarnings(warnings);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleApprovePreview = async () => {
    if (!previewData) return;
    
    try {
      setCommitting(true);
      setError(null);
      
      // Update targets with selected tickers
      const targetsToCommit = previewData.targets.map((target, index) => {
        const selectedTicker = tickerSelections.get(index) || target.ticker;
        const allTickers = target._tickerOptions 
          ? target._tickerOptions.map(o => o.ticker)
          : (target.ticker ? [target.ticker] : []);
        const alternativeTickers = allTickers.filter(t => t !== selectedTicker);
        
        return {
          asset_type: target.asset_type,
          asset_category: target.asset_category || null,
          target_percentage: target.target_percentage,
          ticker: selectedTicker || target.ticker || null,
          symbol: selectedTicker || target.ticker || target.symbol || null,
          isin: target.isin || null,
          alternative_tickers: alternativeTickers.length > 0 ? alternativeTickers : null,
        };
      });
      
      await targetsApi.commitExcel(targetsToCommit);
      
      setPreviewData(null);
      setTickerSelections(new Map());
      setWarnings([]);
      loadTargets();
      
      alert('Targets committed successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to commit targets');
    } finally {
      setCommitting(false);
    }
  };
  
  const handleTickerSelection = (targetIndex: number, ticker: string) => {
    const newSelections = new Map(tickerSelections);
    newSelections.set(targetIndex, ticker);
    setTickerSelections(newSelections);
    
    // Update preview data with selected ticker
    if (previewData) {
      const updatedTargets = [...previewData.targets];
      updatedTargets[targetIndex] = {
        ...updatedTargets[targetIndex],
        ticker: ticker,
      };
      setPreviewData({
        ...previewData,
        targets: updatedTargets,
      });
    }
  };

  const handleCancelPreview = () => {
    setPreviewData(null);
    setTickerSelections(new Map());
    setWarnings([]);
    setError(null);
  };
  
  const getBestTickerFromOptions = (options: Array<{ ticker: string; exchange?: string; confidence: 'high' | 'medium' | 'low' }>): string => {
    if (!options || options.length === 0) return '';
    const highConfidence = options.filter(o => o.confidence === 'high');
    if (highConfidence.length > 0) {
      const usTicker = highConfidence.find(o => 
        o.exchange === 'NYQ' || o.exchange === 'NMS' || o.exchange === 'NAS'
      );
      if (usTicker) return usTicker.ticker;
      return highConfidence[0].ticker;
    }
    return options[0].ticker;
  };

  const totalPercentage = targets.reduce((sum, t) => sum + t.target_percentage, 0);

  // Group targets by asset type
  const groupedTargets = targets.reduce((acc, target) => {
    const type = target.asset_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(target);
    return acc;
  }, {} as Record<string, TargetAllocation[]>);

  // Calculate percentage per asset type
  const assetTypeTotals = Object.entries(groupedTargets).map(([type, items]) => ({
    type,
    percentage: items.reduce((sum, t) => sum + t.target_percentage, 0),
    count: items.length,
  }));

  const toggleAssetType = (assetType: string) => {
    const newExpanded = new Set(expandedAssetTypes);
    if (newExpanded.has(assetType)) {
      newExpanded.delete(assetType);
    } else {
      newExpanded.add(assetType);
    }
    setExpandedAssetTypes(newExpanded);
  };

  const togglePreviewType = (assetType: string) => {
    const newExpanded = new Set(expandedPreviewTypes);
    if (newExpanded.has(assetType)) {
      newExpanded.delete(assetType);
    } else {
      newExpanded.add(assetType);
    }
    setExpandedPreviewTypes(newExpanded);
  };

  if (loading) {
    return <div className="loading">Loading targets...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Target Allocations</h1>
        <div className="header-actions">
          <label className="upload-button">
            {uploading ? 'Uploading...' : 'Upload Excel'}
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExcelUpload(file);
              }}
              disabled={uploading}
            />
          </label>
          <button className="button" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide History' : 'View History'}
          </button>
          <button className="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Target'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      
      {warnings.length > 0 && (
        <div className="warning">
          <strong>Warnings:</strong>
          <ul>
            {warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {previewData && (
        <div className="card preview-card">
          <h2>Preview - Review Before Committing</h2>
          <div className="preview-summary">
            <div><strong>Total: {previewData.totalPercentage.toFixed(2)}%</strong></div>
            <div>{previewData.targets.length} targets</div>
          </div>
          {previewData.totalPercentage !== 100 && (
            <div className="warning">
              Total target allocation is {previewData.totalPercentage.toFixed(2)}%. It should equal 100%.
            </div>
          )}
          <div className="asset-type-groups">
            {(() => {
              // Group preview targets by asset type
              const previewGrouped = previewData.targets.reduce((acc, target) => {
                const type = target.asset_type;
                if (!acc[type]) {
                  acc[type] = [];
                }
                acc[type].push(target);
                return acc;
              }, {} as Record<string, typeof previewData.targets>);

              const previewTotals = Object.entries(previewGrouped).map(([type, items]) => ({
                type,
                percentage: items.reduce((sum, t) => sum + t.target_percentage, 0),
                count: items.length,
              }));

              return previewTotals.map(({ type, percentage, count }) => (
                <div key={type} className="asset-type-group">
                  <div 
                    className="asset-type-header"
                    onClick={() => togglePreviewType(type)}
                  >
                    <span className="expander">
                      {expandedPreviewTypes.has(type) ? '−' : '+'}
                    </span>
                    <span className="asset-type-name">{type}</span>
                    <span className="asset-type-percentage">
                      <strong>{percentage.toFixed(2)}%</strong>
                      <span className="asset-type-count">({count} {count === 1 ? 'target' : 'targets'})</span>
                    </span>
                  </div>
                  {expandedPreviewTypes.has(type) && (
                    <div className="asset-type-content">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Name</th>
                            <th>Target %</th>
                            <th>ISIN</th>
                            <th>Ticker</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewGrouped[type].map((target, idx) => {
                            const globalIndex = previewData.targets.findIndex(t => 
                              t.asset_type === type && 
                              t.asset_category === target.asset_category &&
                              t.target_percentage === target.target_percentage
                            );
                            const hasMultipleTickers = target._tickerOptions && target._tickerOptions.length > 1;
                            const selectedTicker = tickerSelections.get(globalIndex) || target.ticker;
                            
                            return (
                              <tr key={idx}>
                                <td>{target.asset_category || '-'}</td>
                                <td>{target.instrument || '-'}</td>
                                <td><strong>{target.target_percentage.toFixed(2)}%</strong></td>
                                <td>
                                  {target.isin && target.asset_type !== 'Stock' ? (
                                    <a
                                      href={`https://www.justetf.com/en/etf-profile.html?isin=${target.isin}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: '#3498db', textDecoration: 'underline' }}
                                    >
                                      {target.isin}
                                    </a>
                                  ) : (
                                    target.isin || '-'
                                  )}
                                </td>
                                <td>
                                  {hasMultipleTickers ? (
                                    <div>
                                      <select
                                        value={selectedTicker || ''}
                                        onChange={(e) => handleTickerSelection(globalIndex, e.target.value)}
                                        style={{ 
                                          padding: '0.25rem', 
                                          fontSize: '0.9rem',
                                          border: '1px solid #4CAF50',
                                          borderRadius: '4px',
                                          backgroundColor: '#f0f8f0',
                                          width: '100%',
                                          marginBottom: '0.25rem'
                                        }}
                                      >
                                        <option value="">Select primary ticker...</option>
                                        {target._tickerOptions!.map((option, optIdx) => (
                                          <option key={optIdx} value={option.ticker}>
                                            {option.ticker} 
                                            {option.exchange && ` (${option.exchange})`}
                                            {option.name && ` - ${option.name}`}
                                            {option.confidence === 'high' && ' ✓'}
                                            {option.ticker === getBestTickerFromOptions(target._tickerOptions!) && ' [Primary]'}
                                          </option>
                                        ))}
                                      </select>
                                      {target.alternative_tickers && target.alternative_tickers.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                                          Also matches: {target.alternative_tickers.join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span>
                                        {target.ticker || '-'}
                                        {target.ticker && !target._needsTickerConfirmation && (
                                          <span style={{ color: '#4CAF50', marginLeft: '0.5rem' }}>✓</span>
                                        )}
                                      </span>
                                      {target.alternative_tickers && target.alternative_tickers.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                                          Also matches: {target.alternative_tickers.join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
          <div className="preview-actions">
            <button 
              className="button button-success" 
              onClick={handleApprovePreview}
              disabled={committing}
            >
              {committing ? 'Committing...' : 'Approve & Commit'}
            </button>
            <button 
              className="button" 
              onClick={handleCancelPreview}
              disabled={committing}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!previewData && totalPercentage !== 100 && totalPercentage > 0 && (
        <div className="warning">
          Total target allocation is {totalPercentage.toFixed(1)}%. It should equal 100%.
        </div>
      )}

      {showForm && (
        <div className="card">
          <h2>Add Target Allocation</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Asset Type *</label>
              <select
                value={formData.asset_type}
                onChange={(e) => setFormData({ ...formData, asset_type: e.target.value })}
                required
              >
                <option value="">Select...</option>
                <option value="Stock">Stock</option>
                <option value="Bond">Bond</option>
                <option value="Cash">Cash</option>
                <option value="Commodity">Commodity</option>
                <option value="Crypto">Crypto</option>
                <option value="REIT">REIT</option>
              </select>
            </div>
            <div className="form-group">
              <label>Asset Category (optional)</label>
              <input
                type="text"
                value={formData.asset_category}
                onChange={(e) => setFormData({ ...formData, asset_category: e.target.value })}
                placeholder="e.g., US Stock market, World stock market"
              />
            </div>
            <div className="form-group">
              <label>Symbol/Ticker (optional - for ticker-level targets)</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                placeholder="e.g., VTI, SPY"
              />
            </div>
            <div className="form-group">
              <label>ISIN (optional - for matching)</label>
              <input
                type="text"
                value={formData.isin}
                onChange={(e) => setFormData({ ...formData, isin: e.target.value.toUpperCase() })}
                placeholder="e.g., US9229087699"
              />
            </div>
            <div className="form-group">
              <label>Target Percentage *</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formData.target_percentage}
                onChange={(e) => setFormData({ ...formData, target_percentage: parseFloat(e.target.value) })}
                required
              />
            </div>
            <div className="form-group">
              <label>Bucket (optional)</label>
              <select
                value={formData.bucket}
                onChange={(e) => setFormData({ ...formData, bucket: e.target.value })}
              >
                <option value="">None</option>
                <option value="short">Short Term</option>
                <option value="medium">Medium Term</option>
                <option value="long">Long Term</option>
              </select>
            </div>
            <button type="submit" className="button">Create Target</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Current Targets</h2>
        {targets.length === 0 ? (
          <p>No target allocations set. Add your first target above.</p>
        ) : (
          <>
            <div className="target-summary">
              <strong>Total: {totalPercentage.toFixed(1)}%</strong>
            </div>
            <div className="asset-type-groups">
              {assetTypeTotals.map(({ type, percentage, count }) => (
                <div key={type} className="asset-type-group">
                  <div 
                    className="asset-type-header"
                    onClick={() => toggleAssetType(type)}
                  >
                    <span className="expander">
                      {expandedAssetTypes.has(type) ? '−' : '+'}
                    </span>
                    <span className="asset-type-name">{type}</span>
                    <span className="asset-type-percentage">
                      <strong>{percentage.toFixed(2)}%</strong>
                      <span className="asset-type-count">({count} {count === 1 ? 'target' : 'targets'})</span>
                    </span>
                  </div>
                  {expandedAssetTypes.has(type) && (
                    <div className="asset-type-content">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Name</th>
                            <th>Symbol/Ticker</th>
                            <th>ISIN</th>
                            <th>Target %</th>
                            <th>Bucket</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedTargets[type].map((target) => {
                            const assetName = getAssetName(target);
                            return (
                              <tr key={target.id}>
                                <td>{target.asset_category || '-'}</td>
                                <td>{assetName || '-'}</td>
                                <td>{target.symbol || '-'}</td>
                                <td>{renderISIN(target)}</td>
                                <td><strong>{target.target_percentage.toFixed(2)}%</strong></td>
                                <td>{target.bucket || '-'}</td>
                                <td>
                                  <button
                                    className="button button-danger"
                                    onClick={() => handleDelete(target.id)}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showHistory && (
        <TargetHistory />
      )}
    </div>
  );
}

function TargetHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const response = await targetsApi.getHistory();
      setHistory(response.data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="card"><div className="loading">Loading history...</div></div>;
  }

  // Group by date
  const groupedByDate = history.reduce((acc, item) => {
    const date = new Date(item.created_at).toLocaleDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="card">
      <h2>Target History</h2>
      {Object.keys(groupedByDate).length === 0 ? (
        <p>No history available yet.</p>
      ) : (
        Object.entries(groupedByDate)
          .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
          .map(([date, items]) => (
            <div key={date} className="history-group">
              <h3>{date}</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Asset Type</th>
                    <th>Category</th>
                    <th>Target %</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.asset_type}</td>
                      <td>{item.asset_category || '-'}</td>
                      <td>{item.target_percentage}%</td>
                      <td>{new Date(item.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
      )}
    </div>
  );
}

export default Targets;

