import { useState, useEffect } from 'react';
import { holdingsApi, statementsApi, targetsApi, symbolMappingsApi, Holding, TargetAllocation, SymbolMapping } from '../api';
import { useAccount } from '../contexts/AccountContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import './Portfolio.css';

function Portfolio() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [targets, setTargets] = useState<TargetAllocation[]>([]);
  const [symbolMappings, setSymbolMappings] = useState<Map<string, number>>(new Map()); // holding_symbol -> target_id
  const [symbolMappingDetails, setSymbolMappingDetails] = useState<Map<string, SymbolMapping>>(new Map()); // holding_symbol -> full mapping details
  const [expandedAssetTypes, setExpandedAssetTypes] = useState<Set<string>>(new Set()); // Asset type keys
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [showEditMatchModal, setShowEditMatchModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadAccountId, setUploadAccountId] = useState<number | null>(null); // For upload modal only
  const [uploading, setUploading] = useState(false);
  const { selectedAccountId: globalAccountId, accounts } = useAccount();

  useEffect(() => {
    if (accounts.length > 0 && !uploadAccountId) {
      setUploadAccountId(accounts[0].id);
    }
  }, [accounts, uploadAccountId]);

  useEffect(() => {
    loadData();
  }, [globalAccountId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [holdingsRes, summaryRes, targetsRes] = await Promise.all([
        holdingsApi.getLatest(globalAccountId || undefined),
        holdingsApi.getSummary(globalAccountId || undefined),
        targetsApi.getAll(globalAccountId || undefined),
      ]);
      setHoldings(holdingsRes.data);
      setSummary(summaryRes.data);
      setTargets(targetsRes.data);
      
      // Load symbol mappings if account is selected
      if (globalAccountId) {
        try {
          const mappingsRes = await symbolMappingsApi.getAll(globalAccountId);
          const mappingsMap = new Map<string, number>();
          const mappingsDetailsMap = new Map<string, SymbolMapping>();
          mappingsRes.data.forEach((m: SymbolMapping) => {
            mappingsMap.set(m.holding_symbol.toUpperCase(), m.target_id);
            mappingsDetailsMap.set(m.holding_symbol.toUpperCase(), m);
          });
          setSymbolMappings(mappingsMap);
          setSymbolMappingDetails(mappingsDetailsMap);
        } catch (err) {
          console.error('Failed to load symbol mappings:', err);
          setSymbolMappings(new Map());
          setSymbolMappingDetails(new Map());
        }
      } else {
        setSymbolMappings(new Map());
        setSymbolMappingDetails(new Map());
      }
      
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  const [unmatchedHoldings, setUnmatchedHoldings] = useState<any[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Map<number, number>>(new Map()); // Map of unmatched index -> target_id
  const [allTargetsForSelection, setAllTargetsForSelection] = useState<TargetAllocation[]>([]);
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!uploadAccountId) {
      setError('Please select an account first');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const response = await statementsApi.upload(uploadAccountId, file);
      
      if (response.data.holdingsCount === 0) {
        const fileType = file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'PDF';
        setError(`No holdings were found in the ${fileType} file. Please check that the file is an Interactive Brokers Activity Statement with an Open Positions or Mark-to-Market Performance Summary section.`);
        return;
      }
      
      // Check for unmatched holdings
      if (response.data.unmatchedHoldings && response.data.unmatchedHoldings.length > 0) {
        setUnmatchedHoldings(response.data.unmatchedHoldings);
        
        // Load all targets for selection dropdown
        const targetsRes = await targetsApi.getAll();
        setAllTargetsForSelection(targetsRes.data);
        
        // Pre-select best suggested matches
        const initialSelections = new Map<number, number>();
        response.data.unmatchedHoldings.forEach((unmatched: any, idx: number) => {
          if (unmatched.suggestedMatches && unmatched.suggestedMatches.length > 0) {
            // Select the first (best) suggested match
            const bestMatch = unmatched.suggestedMatches[0];
            if (bestMatch.targetId) {
              initialSelections.set(idx, bestMatch.targetId);
            }
          }
        });
        setSelectedMatches(initialSelections);
        
        setShowUnmatchedModal(true);
      } else {
        setShowUploadModal(false);
      }
      
      // Reload portfolio data after successful upload
      await loadData();
      
      if (!response.data.unmatchedHoldings || response.data.unmatchedHoldings.length === 0) {
        alert(`Statement uploaded successfully! Found ${response.data.holdingsCount} holdings.`);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to upload statement';
      setError(errorMsg);
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  // Calculate total value in USD (sum of all holdings converted to USD)
  const totalValue = holdings.reduce((sum, h) => sum + h.value_usd, 0);
  
  // Calculate total value in original currencies (for display/debugging)
  const totalByCurrency = new Map<string, number>();
  holdings.forEach(h => {
    const valueInCurrency = h.quantity * h.price;
    const current = totalByCurrency.get(h.currency) || 0;
    totalByCurrency.set(h.currency, current + valueInCurrency);
  });

  const pieData = summary.map((item) => ({
    name: item.asset_category || item.asset_type,
    value: item.total_value_usd,
    percentage: ((item.total_value_usd / totalValue) * 100).toFixed(1),
  }));

  const COLORS = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', '#1abc9c', '#34495e'];

  if (loading) {
    return <div className="loading">Loading portfolio...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Portfolio Overview</h1>
        <div className="header-actions">
          <button className="button button-success" onClick={() => setShowUploadModal(true)}>
            Upload Statement
          </button>
          <button className="button" onClick={loadData}>Refresh</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="portfolio-stats">
        <div className="stat-card">
          <div className="stat-label">Total Value (USD)</div>
          <div className="stat-value">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        {Array.from(totalByCurrency.entries()).map(([currency, value]) => (
          <div key={currency} className="stat-card">
            <div className="stat-label">Total in {currency}</div>
            <div className="stat-value">{currency} {value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        ))}
        <div className="stat-card">
          <div className="stat-label">Holdings</div>
          <div className="stat-value">{holdings.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Asset Types</div>
          <div className="stat-value">{new Set(holdings.map(h => h.asset_type)).size}</div>
        </div>
      </div>

      {summary.length > 0 && (
        <div className="card">
          <h2>Allocation by Asset Type</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="holdings-container">
        <h2 style={{ marginBottom: '1.5rem' }}>Holdings</h2>
        <div className="holdings-cards-grid">
          {(() => {
            // Group by Asset Type, then by Category
            const assetTypeGroups = new Map<string, {
              assetType: string;
              holdings: Holding[];
              totalValue: number;
              categories: Map<string, {
                category: string;
                holdings: Holding[];
                totalValue: number;
              }>;
            }>();
            
            holdings.forEach((holding) => {
              const assetType = holding.asset_type || 'Unknown';
              const category = holding.asset_category || 'Uncategorized';
              
              if (!assetTypeGroups.has(assetType)) {
                assetTypeGroups.set(assetType, {
                  assetType,
                  holdings: [],
                  totalValue: 0,
                  categories: new Map(),
                });
              }
              
              const typeGroup = assetTypeGroups.get(assetType)!;
              typeGroup.holdings.push(holding);
              typeGroup.totalValue += holding.value_usd;
              
              if (!typeGroup.categories.has(category)) {
                typeGroup.categories.set(category, {
                  category,
                  holdings: [],
                  totalValue: 0,
                });
              }
              
              const categoryGroup = typeGroup.categories.get(category)!;
              categoryGroup.holdings.push(holding);
              categoryGroup.totalValue += holding.value_usd;
            });
            
            const assetTypesArray = Array.from(assetTypeGroups.values()).sort((a, b) => b.totalValue - a.totalValue);
            
            return assetTypesArray.map((typeGroup) => {
              const isTypeExpanded = expandedAssetTypes.has(typeGroup.assetType);
              const typePct = totalValue > 0 ? (typeGroup.totalValue / totalValue) * 100 : 0;
              const categoriesArray = Array.from(typeGroup.categories.values()).sort((a, b) => b.totalValue - a.totalValue);
              
              return (
                <div key={typeGroup.assetType} className="asset-type-card">
                  {/* Asset Type Card Header */}
                  <div 
                    className="asset-type-card-header"
                    onClick={() => {
                      const newExpanded = new Set(expandedAssetTypes);
                      if (isTypeExpanded) {
                        newExpanded.delete(typeGroup.assetType);
                      } else {
                        newExpanded.add(typeGroup.assetType);
                      }
                      setExpandedAssetTypes(newExpanded);
                    }}
                  >
                    <div className="asset-type-card-title">
                      <span className="expander-icon">{isTypeExpanded ? '▼' : '▶'}</span>
                      <h3>{typeGroup.assetType}</h3>
                    </div>
                    <div className="asset-type-card-stats">
                      <span className="stat-value">${typeGroup.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="stat-percentage">{typePct.toFixed(2)}%</span>
                      <span className="stat-count">{typeGroup.holdings.length} holdings</span>
                    </div>
                  </div>
                  
                  {/* Category Summaries (when collapsed) */}
                  {!isTypeExpanded && (
                    <div className="asset-type-card-summary">
                      {categoriesArray.map((categoryGroup) => {
                        const categoryPct = totalValue > 0 ? (categoryGroup.totalValue / totalValue) * 100 : 0;
                        return (
                          <div key={categoryGroup.category} className="category-summary-item">
                            <span className="category-summary-name">{categoryGroup.category}</span>
                            <span className="category-summary-stats">
                              ${categoryGroup.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | {categoryPct.toFixed(2)}% | {categoryGroup.holdings.length} holdings
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Categories and Holdings (when expanded) */}
                  {isTypeExpanded && (
                    <div className="asset-type-card-content">
                      {categoriesArray.map((categoryGroup) => {
                        const categoryPct = totalValue > 0 ? (categoryGroup.totalValue / totalValue) * 100 : 0;
                        
                        return (
                          <div key={categoryGroup.category} className="category-section">
                            {/* Category Header */}
                            <div className="category-header">
                              <span className="category-name">{categoryGroup.category}</span>
                              <span className="category-stats">
                                ${categoryGroup.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | {categoryPct.toFixed(2)}% | {categoryGroup.holdings.length} holdings
                              </span>
                            </div>
                            
                            {/* Holdings List */}
                            <div className="holdings-list">
                              <div className="holdings-list-header">
                                <div className="holding-col symbol-col">Symbol</div>
                                <div className="holding-col quantity-col">Quantity</div>
                                <div className="holding-col price-col">Price</div>
                                <div className="holding-col value-col">Value (USD)</div>
                                <div className="holding-col target-col">Target %</div>
                                <div className="holding-col current-col">Current %</div>
                                <div className="holding-col status-col">Status</div>
                                <div className="holding-col edit-col">Edit</div>
                              </div>
                              {categoryGroup.holdings.map((holding) => {
                                const currentPct = totalValue > 0 ? (holding.value_usd / totalValue) * 100 : 0;
                                
                                const tickerTarget = targets.find(t => t.symbol && t.symbol.toUpperCase() === holding.symbol.toUpperCase());
                                const categoryTarget = !tickerTarget 
                                  ? targets.find(t => 
                                      !t.symbol && 
                                      t.asset_type === holding.asset_type && 
                                      (t.asset_category === holding.asset_category || (!t.asset_category && !holding.asset_category))
                                    )
                                  : null;
                                
                                const target = tickerTarget || categoryTarget;
                                const targetPct = target ? target.target_percentage : null;
                                const hasTarget = target !== null;
                                const deviation = targetPct !== null ? currentPct - targetPct : null;
                                
                                const isMapped = symbolMappings.has(holding.symbol.toUpperCase());
                                const mappedTargetId = symbolMappings.get(holding.symbol.toUpperCase());
                                const mappedTarget = mappedTargetId ? targets.find(t => t.id === mappedTargetId) : null;
                                
                                return (
                                  <div 
                                    key={holding.id} 
                                    className={`holding-row ${!hasTarget ? 'no-target' : ''}`}
                                  >
                                    <div className="holding-col symbol-col">
                                      <strong>{holding.symbol}</strong>
                                      {isMapped && mappedTarget && (
                                        <span className="mapped-indicator" title={`Mapped to ${mappedTarget.symbol || mappedTarget.asset_type}`}>
                                          ⚠
                                        </span>
                                      )}
                                    </div>
                                    <div className="holding-col quantity-col">{holding.quantity.toFixed(4)}</div>
                                    <div className="holding-col price-col">{holding.currency} {holding.price.toFixed(2)}</div>
                                    <div className="holding-col value-col">${holding.value_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    <div className="holding-col target-col">
                                      {targetPct !== null ? `${targetPct.toFixed(2)}%` : <span className="no-target-text">No Target</span>}
                                    </div>
                                    <div className="holding-col current-col">{currentPct.toFixed(2)}%</div>
                                    <div className="holding-col status-col">
                                      {hasTarget && deviation !== null && (
                                        <span className={`deviation ${Math.abs(deviation) < 1 ? 'good' : deviation > 0 ? 'warning' : 'info'}`}>
                                          {deviation > 0 ? '+' : ''}{deviation.toFixed(2)}%
                                        </span>
                                      )}
                                      {!hasTarget && <span className="no-target-badge">⚠ No Target</span>}
                                    </div>
                                    <div className="holding-col edit-col">
                                      <button
                                        className="edit-match-button"
                                        onClick={() => {
                                          setEditingHolding(holding);
                                          setShowEditMatchModal(true);
                                        }}
                                        title="Edit target match"
                                      >
                                        ✏️
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {showUploadModal && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Upload Statement</h2>
            <p>Upload an Interactive Brokers PDF statement to update your portfolio holdings.</p>
            
            {accounts.length === 0 ? (
              <div className="error">
                No accounts found. Please add an account first in the Accounts page.
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Select Account *</label>
                  <select
                    value={uploadAccountId || ''}
                    onChange={(e) => setUploadAccountId(e.target.value ? parseInt(e.target.value) : null)}
                    disabled={uploading}
                  >
                    <option value="">Select an account...</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.ib_account_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Statement File (PDF or CSV) *</label>
                  <label className="upload-area">
                    <input
                      type="file"
                      accept=".pdf,.csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      disabled={uploading || !uploadAccountId}
                    />
                    <div>
                      {uploading ? (
                        <span>Uploading and processing...</span>
                      ) : (
                        <span>Click to select PDF or CSV file or drag and drop</span>
                      )}
                    </div>
                  </label>
                </div>
                <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#7f8c8d' }}>
                  <a href="/api/debug/parse-pdf" target="_blank" style={{ color: '#3498db' }}>
                    Debug: Test PDF parsing (opens in new tab)
                  </a>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button
                className="button"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnmatchedModal && unmatchedHoldings.length > 0 && (
        <div className="modal-overlay" onClick={() => setShowUnmatchedModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '80vh', overflow: 'auto' }}>
            <h2>Unmatched Holdings</h2>
            <p>The following holdings were not found in your targets. Please select the closest matching target for each:</p>
            <div style={{ marginBottom: '1rem' }}>
              {unmatchedHoldings.map((unmatched, idx) => {
                const holding = unmatched.holding || unmatched;
                const suggestedMatches = unmatched.suggestedMatches || [];
                const selectedTargetId = selectedMatches.get(idx);
                
                return (
                  <div key={idx} style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <h3 style={{ marginTop: 0 }}>{holding.symbol}</h3>
                    <p><strong>Suggested Asset Type:</strong> {unmatched.suggestedAssetType || 'Unknown'}</p>
                    {suggestedMatches.length > 0 && (
                      <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f0f8ff', borderRadius: '4px' }}>
                        <strong>Suggested Matches:</strong>
                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                          {suggestedMatches.map((match: any, midx: number) => {
                            const assetType = match.assetType || match.target?.asset_type;
                            const assetCategory = match.assetCategory || match.target?.asset_category;
                            const symbol = match.symbol || match.target?.symbol;
                            const isSelected = selectedTargetId === match.targetId;
                            return (
                              <li key={midx} style={{ color: isSelected ? '#28a745' : '#666', fontWeight: isSelected ? 'bold' : 'normal' }}>
                                {assetType} - {assetCategory || 'No category'} 
                                {symbol && ` (${symbol})`}
                                {match.matchReason && ` - ${match.matchReason}`}
                                {isSelected && ' ✓ (Selected)'}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong>Select Target:</strong>
                      <select
                        value={selectedTargetId || ''}
                        onChange={(e) => {
                          const newSelections = new Map(selectedMatches);
                          if (e.target.value) {
                            newSelections.set(idx, parseInt(e.target.value));
                          } else {
                            newSelections.delete(idx);
                          }
                          setSelectedMatches(newSelections);
                        }}
                        style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem', fontSize: '1em' }}
                      >
                        <option value="">-- Select a target (or leave blank) --</option>
                        {allTargetsForSelection.map((target) => {
                          const isSuggested = suggestedMatches.some((m: any) => m.targetId === target.id);
                          return (
                            <option key={target.id} value={target.id} style={{ fontWeight: isSuggested ? 'bold' : 'normal' }}>
                              {target.asset_type} - {target.asset_category || 'No category'} 
                              {target.symbol && ` (${target.symbol})`}
                              {isSuggested && ' ⭐ Suggested'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => { setShowUnmatchedModal(false); setShowUploadModal(false); }}>
                I'll fix this later
              </button>
              <button 
                className="button button-primary" 
                onClick={async () => {
                  if (!uploadAccountId) {
                    alert('Please select an account');
                    return;
                  }
                  
                  // Save all selected mappings
                  try {
                    for (const [idx, targetId] of selectedMatches.entries()) {
                      const unmatched = unmatchedHoldings[idx];
                      const holding = unmatched.holding || unmatched;
                      await symbolMappingsApi.create({
                        account_id: uploadAccountId,
                        holding_symbol: holding.symbol,
                        target_id: targetId,
                      });
                    }
                    
                    setShowUnmatchedModal(false);
                    setShowUploadModal(false);
                    setSelectedMatches(new Map());
                    await loadData();
                    alert('Symbol mappings saved successfully!');
                  } catch (err: any) {
                    alert(`Failed to save mappings: ${err.response?.data?.error || err.message}`);
                  }
                }}
                disabled={selectedMatches.size === 0}
              >
                Save Mappings ({selectedMatches.size} selected)
              </button>
              <button className="button" onClick={() => { setShowUnmatchedModal(false); setShowUploadModal(false); window.location.href = '/targets'; }}>
                Go to Targets
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Target Match Modal */}
      {showEditMatchModal && editingHolding && (
        <EditTargetMatchModal
          holding={editingHolding}
          targets={targets}
          currentMapping={symbolMappingDetails.get(editingHolding.symbol.toUpperCase())}
          onClose={() => {
            setShowEditMatchModal(false);
            setEditingHolding(null);
          }}
          onSave={async (targetId, matchType) => {
            if (!globalAccountId) return;
            
            try {
              await symbolMappingsApi.create({
                account_id: globalAccountId,
                holding_symbol: editingHolding.symbol,
                target_id: targetId,
                match_type: matchType,
              });
              await loadData(); // Reload to refresh mappings
            } catch (err: any) {
              setError(err.response?.data?.error || 'Failed to save target match');
            }
          }}
        />
      )}
    </div>
  );
}

// Edit Target Match Modal Component
interface EditTargetMatchModalProps {
  holding: Holding;
  targets: TargetAllocation[];
  currentMapping?: SymbolMapping;
  onClose: () => void;
  onSave: (targetId: number | null, matchType: 'exact' | 'same_basket' | null) => Promise<void>;
}

function EditTargetMatchModal({ holding, targets, currentMapping, onClose, onSave }: EditTargetMatchModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(currentMapping?.target_id || null);
  const [matchType, setMatchType] = useState<'exact' | 'same_basket' | null>(currentMapping?.match_type || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  // Determine auto-detected match
  const autoDetectedTarget = targets.find(t => 
    (t.symbol && t.symbol.toUpperCase() === holding.symbol.toUpperCase()) ||
    (t.isin && holding.isin && t.isin.toUpperCase() === holding.isin.toUpperCase())
  );
  const autoDetectedMatchType = autoDetectedTarget ? 'exact' : null;

  // Filter targets by search term
  const filteredTargets = targets.filter(target => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      target.symbol?.toLowerCase().includes(search) ||
      target.asset_type?.toLowerCase().includes(search) ||
      target.asset_category?.toLowerCase().includes(search) ||
      target.isin?.toLowerCase().includes(search) ||
      target.name?.toLowerCase().includes(search)
    );
  });

  // Group targets by asset type
  const groupedTargets = filteredTargets.reduce((acc, target) => {
    const type = target.asset_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(target);
    return acc;
  }, {} as Record<string, TargetAllocation[]>);

  const handleSave = async () => {
    if (selectedTargetId && !matchType) {
      alert('Please select a match type (Exact or Same Basket)');
      return;
    }
    
    setSaving(true);
    try {
      await onSave(selectedTargetId, matchType);
      onClose();
    } catch (err) {
      console.error('Error saving match:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await onSave(null, null);
      onClose();
    } catch (err) {
      console.error('Error clearing match:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content edit-match-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Target Match</h2>
        
        <div className="holding-info">
          <div><strong>Symbol:</strong> {holding.symbol}</div>
          {holding.isin && <div><strong>ISIN:</strong> {holding.isin}</div>}
          {holding.instrument_name && <div><strong>Name:</strong> {holding.instrument_name}</div>}
          <div><strong>Asset Type:</strong> {holding.asset_type}</div>
          {holding.asset_category && <div><strong>Category:</strong> {holding.asset_category}</div>}
        </div>

        {autoDetectedTarget && !currentMapping && (
          <div className="info-box">
            <strong>Auto-detected match:</strong> {autoDetectedTarget.symbol || autoDetectedTarget.asset_type} 
            ({autoDetectedMatchType === 'exact' ? 'Exact match' : 'Category match'})
          </div>
        )}

        {currentMapping && (
          <div className="current-match">
            <strong>Current Match:</strong>
            <div>
              Target: {targets.find(t => t.id === currentMapping.target_id)?.symbol || 
                       targets.find(t => t.id === currentMapping.target_id)?.asset_type || 'Unknown'}
            </div>
            <div>
              Type: {currentMapping.match_type === 'exact' ? 'Exact' : 
                     currentMapping.match_type === 'same_basket' ? 'Same Basket' : 'None'}
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Search Targets</label>
          <input
            type="text"
            placeholder="Search by symbol, name, ISIN, asset type, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </div>

        <div className="form-group">
          <label>Select Target</label>
          <select
            value={selectedTargetId || ''}
            onChange={(e) => {
              const targetId = e.target.value ? parseInt(e.target.value) : null;
              setSelectedTargetId(targetId);
              // Auto-set match type if exact match
              if (targetId) {
                const target = targets.find(t => t.id === targetId);
                if (target && (
                  (target.symbol && target.symbol.toUpperCase() === holding.symbol.toUpperCase()) ||
                  (target.isin && holding.isin && target.isin.toUpperCase() === holding.isin.toUpperCase())
                )) {
                  setMatchType('exact');
                } else if (!matchType) {
                  setMatchType('same_basket');
                }
              }
            }}
            style={{ width: '100%', padding: '0.5rem' }}
          >
            <option value="">-- No Target (Unknown bucket) --</option>
            {Object.entries(groupedTargets).map(([assetType, typeTargets]) => (
              <optgroup key={assetType} label={assetType}>
                {typeTargets.map(target => (
                  <option key={target.id} value={target.id}>
                    {target.symbol || target.asset_category || target.asset_type}
                    {target.name && ` - ${target.name}`}
                    {target.asset_category && ` (${target.asset_category})`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {selectedTargetId && (
          <div className="form-group">
            <label>Match Type</label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="matchType"
                  value="exact"
                  checked={matchType === 'exact'}
                  onChange={() => setMatchType('exact')}
                />
                <span>
                  <strong>Exact</strong> - Same ISIN/Ticker as target
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="radio"
                  name="matchType"
                  value="same_basket"
                  checked={matchType === 'same_basket'}
                  onChange={() => setMatchType('same_basket')}
                />
                <span>
                  <strong>Same Basket</strong> - Different asset, same category/bucket
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {currentMapping && (
            <button className="button button-danger" onClick={handleClear} disabled={saving}>
              Clear Match
            </button>
          )}
          <button 
            className="button button-success" 
            onClick={handleSave} 
            disabled={saving || (selectedTargetId !== null && matchType === null)}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Portfolio;

