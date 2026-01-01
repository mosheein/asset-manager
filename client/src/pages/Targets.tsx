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
      alternative_tickers?: string[] | null;
      _needsTickerConfirmation?: boolean;
      _needsAutoDetect?: boolean;
      _missingFields?: string[];
      _validationErrors?: string[];
      _validationWarnings?: string[];
      _autoDetectSuggestions?: Array<{
        ticker: string;
        exchange?: string;
        name?: string;
        confidence: 'high' | 'medium' | 'low';
      }> | null;
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
    validationSummary?: {
      total: number;
      valid: number;
      complete: number;
      needsAutoDetect: number;
    };
    allComplete?: boolean;
    needsAutoDetect?: boolean;
    availableSheets?: string[];
    selectedSheet?: string;
    hasMultipleSheets?: boolean;
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
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [tickerSelections, setTickerSelections] = useState<Map<number, string>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [expandedAssetTypes, setExpandedAssetTypes] = useState<Set<string>>(new Set());
  const [expandedPreviewTypes, setExpandedPreviewTypes] = useState<Set<string>>(new Set());
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
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

  const handleExcelUpload = async (file: File, sheetName?: string) => {
    try {
      setUploading(true);
      setError(null);
      setWarnings([]);
      // Don't clear previewData if just changing sheet
      if (!sheetName) {
        setPreviewData(null);
      }
      // Always store the file so we can re-upload with different sheet
      setUploadedFile(file);
      
      const response = await targetsApi.uploadExcelPreview(file, sheetName);
      
      // Store sheet info - check if we have multiple sheets
      const hasMultipleSheets = response.data.availableSheets && response.data.availableSheets.length > 1;
      if (hasMultipleSheets) {
        setSelectedSheet(response.data.selectedSheet || response.data.availableSheets[0]);
      }
      
      // Show errors if any (from parsing)
      if (response.data.errors && response.data.errors.length > 0) {
        setError('Parsing errors:\n' + response.data.errors.join('\n'));
        // ALWAYS show preview with sheet selector if multiple sheets available, even with errors
        if (hasMultipleSheets) {
          setPreviewData({
            targets: [],
            warnings: response.data.warnings || [],
            errors: response.data.errors || [],
            totalPercentage: 0,
            tickerLookups: [],
            validationSummary: undefined,
            allComplete: false,
            needsAutoDetect: false,
            availableSheets: response.data.availableSheets || [],
            selectedSheet: response.data.selectedSheet || response.data.availableSheets[0],
            hasMultipleSheets: true,
          });
        } else {
          // Even with single sheet, show preview if we have sheet info (for debugging)
          if (response.data.availableSheets && response.data.availableSheets.length > 0) {
            setPreviewData({
              targets: [],
              warnings: response.data.warnings || [],
              errors: response.data.errors || [],
              totalPercentage: 0,
              tickerLookups: [],
              validationSummary: undefined,
              allComplete: false,
              needsAutoDetect: false,
              availableSheets: response.data.availableSheets || [],
              selectedSheet: response.data.selectedSheet || response.data.availableSheets[0],
              hasMultipleSheets: false,
            });
          }
        }
        return;
      }
      
      // Show preview
      const previewDataUpdate = {
        targets: response.data.targets,
        warnings: response.data.warnings || [],
        errors: response.data.errors || [],
        totalPercentage: response.data.totalPercentage,
        tickerLookups: response.data.tickerLookups || [],
        validationSummary: response.data.validationSummary,
        allComplete: response.data.allComplete,
        needsAutoDetect: response.data.needsAutoDetect,
        availableSheets: response.data.availableSheets || [],
        selectedSheet: response.data.selectedSheet,
        hasMultipleSheets: response.data.hasMultipleSheets || false,
      };
      
      setPreviewData(previewDataUpdate);
      
      // Always set selectedSheet if available, even for single sheet files
      if (response.data.selectedSheet) {
        setSelectedSheet(response.data.selectedSheet);
      } else if (response.data.availableSheets && response.data.availableSheets.length > 0) {
        setSelectedSheet(response.data.availableSheets[0]);
      }
      
      // Initialize ticker selections for targets with detected tickers
      const selections = new Map<number, string>();
      response.data.targets.forEach((target: any, index: number) => {
        if (target.ticker) {
          selections.set(index, target.ticker);
        }
        // If auto-detect suggestions exist, pre-select the first one
        if (target._autoDetectSuggestions && target._autoDetectSuggestions.length > 0) {
          const firstSuggestion = target._autoDetectSuggestions[0];
          if (firstSuggestion.ticker) {
            selections.set(index, firstSuggestion.ticker);
          }
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
      
      // Even on error, show preview with sheet selector if multiple sheets are available
      const errorResponse = err.response?.data;
      if (errorResponse) {
        const hasMultipleSheets = errorResponse.availableSheets && errorResponse.availableSheets.length > 1;
        if (hasMultipleSheets || (errorResponse.availableSheets && errorResponse.availableSheets.length > 0)) {
          setPreviewData({
            targets: [],
            warnings: errorResponse.warnings || [],
            errors: errors,
            totalPercentage: 0,
            tickerLookups: [],
            validationSummary: undefined,
            allComplete: false,
            needsAutoDetect: false,
            availableSheets: errorResponse.availableSheets || [],
            selectedSheet: errorResponse.selectedSheet || errorResponse.availableSheets?.[0],
            hasMultipleSheets: errorResponse.hasMultipleSheets || (errorResponse.availableSheets && errorResponse.availableSheets.length > 1),
          });
          
          if (errorResponse.selectedSheet) {
            setSelectedSheet(errorResponse.selectedSheet);
          } else if (errorResponse.availableSheets && errorResponse.availableSheets.length > 0) {
            setSelectedSheet(errorResponse.availableSheets[0]);
          }
        }
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
        // Use selected ticker from auto-detect if available, otherwise use existing ticker
        const selectedTicker = tickerSelections.get(index) || target.ticker;
        
        // Handle alternative tickers:
        // 1. If target already has alternative_tickers (from CSV "Other Tickers" column), use those
        // 2. Otherwise, use ticker options from lookup
        let alternativeTickers: string[] = [];
        if (target.alternative_tickers && Array.isArray(target.alternative_tickers)) {
          // Use existing alternative tickers from CSV
          alternativeTickers = target.alternative_tickers;
        } else if (target._tickerOptions) {
          // Use ticker options from lookup
          const allTickers = target._tickerOptions.map(o => o.ticker);
          alternativeTickers = allTickers.filter(t => t !== selectedTicker);
        }
        
        return {
          asset_type: target.asset_type,
          asset_category: target.asset_category || null,
          target_percentage: target.target_percentage,
          ticker: selectedTicker || null,
          mainTicker: selectedTicker || null, // Support CSV format
          symbol: selectedTicker || target.ticker || null,
          isin: target.isin || null,
          alternative_tickers: alternativeTickers.length > 0 ? alternativeTickers : null,
          otherTickers: alternativeTickers.length > 0 ? alternativeTickers : null, // Support CSV format
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
            {uploading ? 'Uploading...' : 'Upload Targets (Excel/CSV)'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
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
          
          {/* Sheet selector for Excel files with multiple sheets */}
          {previewData.availableSheets && previewData.availableSheets.length > 1 && (
            <div className="form-group" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
              <label><strong>Select Sheet to Import:</strong></label>
              <select
                value={selectedSheet || previewData.selectedSheet || previewData.availableSheets[0] || ''}
                onChange={(e) => {
                  const newSheet = e.target.value;
                  setSelectedSheet(newSheet);
                  setTickerSelections(new Map()); // Clear previous selections
                  setError(null); // Clear previous errors
                  setWarnings([]); // Clear previous warnings
                  // Re-upload with selected sheet
                  if (uploadedFile) {
                    handleExcelUpload(uploadedFile, newSheet);
                  } else {
                    // Fallback: try to get from file input
                    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                    if (fileInput && fileInput.files && fileInput.files[0]) {
                      setUploadedFile(fileInput.files[0]);
                      handleExcelUpload(fileInput.files[0], newSheet);
                    }
                  }
                }}
                disabled={uploading}
                style={{ 
                  width: '100%', 
                  padding: '0.5rem', 
                  marginTop: '0.5rem',
                  fontSize: '1rem',
                  cursor: uploading ? 'not-allowed' : 'pointer'
                }}
              >
                {previewData.availableSheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet} {sheet === (selectedSheet || previewData.selectedSheet) ? '(Selected)' : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '0.875rem', color: '#6c757d', marginTop: '0.5rem' }}>
                {uploading ? (
                  <span>Loading sheet...</span>
                ) : (
                  <span>Currently viewing: <strong>{selectedSheet || previewData.selectedSheet}</strong></span>
                )}
              </div>
            </div>
          )}
          
          <div className="preview-summary">
            <div><strong>Total: {previewData.totalPercentage.toFixed(2)}%</strong></div>
            <div>{previewData.targets.length} targets</div>
            {previewData.validationSummary && (
              <div>
                <span style={{ color: previewData.allComplete ? '#27ae60' : '#f39c12' }}>
                  {previewData.validationSummary.complete}/{previewData.validationSummary.total} complete
                </span>
                {previewData.needsAutoDetect && (
                  <span style={{ marginLeft: '1rem', color: '#e74c3c' }}>
                    {previewData.validationSummary.needsAutoDetect} need auto-detect
                  </span>
                )}
              </div>
            )}
          </div>
          {previewData.totalPercentage !== 100 && (
            <div className="warning">
              Total target allocation is {previewData.totalPercentage.toFixed(2)}%. It should equal 100%.
            </div>
          )}
          {previewData.allComplete && previewData.validationSummary && (
            <div className="success" style={{ backgroundColor: '#d4edda', color: '#155724', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
              ✓ All targets are complete and validated. Ready to commit.
            </div>
          )}
          {previewData.needsAutoDetect && (
            <div className="warning">
              <strong>Some targets are missing data.</strong> The app can auto-detect missing tickers/ISINs. 
              Review the suggestions below and approve to fill in missing data automatically.
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
                            <th>Main Ticker</th>
                            <th>Other Tickers</th>
                            <th>Status</th>
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
                            const hasAutoDetectSuggestions = target._autoDetectSuggestions && target._autoDetectSuggestions.length > 0;
                            const selectedTicker = tickerSelections.get(globalIndex) || target.ticker;
                            const needsAutoDetect = target._needsAutoDetect || false;
                            
                            return (
                              <tr key={idx} style={needsAutoDetect ? { backgroundColor: '#fff3cd' } : {}}>
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
                                  {needsAutoDetect && hasAutoDetectSuggestions ? (
                                    <div>
                                      <select
                                        value={selectedTicker || ''}
                                        onChange={(e) => handleTickerSelection(globalIndex, e.target.value)}
                                        style={{ 
                                          padding: '0.25rem', 
                                          fontSize: '0.9rem',
                                          border: '1px solid #f39c12',
                                          borderRadius: '4px',
                                          backgroundColor: '#fff3cd',
                                          width: '100%',
                                          marginBottom: '0.25rem'
                                        }}
                                      >
                                        <option value="">Select ticker (auto-detect)...</option>
                                        {target._autoDetectSuggestions!.map((option, optIdx) => (
                                          <option key={optIdx} value={option.ticker}>
                                            {option.ticker} 
                                            {option.exchange && ` (${option.exchange})`}
                                            {option.name && ` - ${option.name}`}
                                            {option.confidence === 'high' && ' ✓'}
                                          </option>
                                        ))}
                                      </select>
                                      {target._missingFields && target._missingFields.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#e74c3c', marginTop: '0.25rem' }}>
                                          Missing: {target._missingFields.join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  ) : hasMultipleTickers ? (
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
                                    </div>
                                  ) : (
                                    <div>
                                      <span>
                                        {target.ticker || '-'}
                                        {target.ticker && !needsAutoDetect && (
                                          <span style={{ color: '#4CAF50', marginLeft: '0.5rem' }}>✓</span>
                                        )}
                                      </span>
                                      {target._validationWarnings && target._validationWarnings.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: '#f39c12', marginTop: '0.25rem' }}>
                                          {target._validationWarnings.join('; ')}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  {target.alternative_tickers && target.alternative_tickers.length > 0 ? (
                                    <div style={{ fontSize: '0.9rem' }}>
                                      {target.alternative_tickers.join(', ')}
                                    </div>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td>
                                  {needsAutoDetect ? (
                                    <span style={{ color: '#e74c3c', fontSize: '0.85rem' }}>⚠ Needs Auto-Detect</span>
                                  ) : target._validationErrors && target._validationErrors.length > 0 ? (
                                    <span style={{ color: '#e74c3c', fontSize: '0.85rem' }}>⚠ Validation Errors</span>
                                  ) : (
                                    <span style={{ color: '#27ae60', fontSize: '0.85rem' }}>✓ Valid</span>
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
                            <th>Other Tickers</th>
                            <th>ISIN</th>
                            <th>Target %</th>
                            <th>Bucket</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedTargets[type].map((target) => {
                            const assetName = getAssetName(target);
                            // Parse alternative_tickers if it's a string (JSON)
                            let alternativeTickers: string[] = [];
                            if (target.alternative_tickers) {
                              if (typeof target.alternative_tickers === 'string') {
                                try {
                                  alternativeTickers = JSON.parse(target.alternative_tickers);
                                } catch (e) {
                                  // If parsing fails, treat as single ticker
                                  alternativeTickers = [target.alternative_tickers];
                                }
                              } else if (Array.isArray(target.alternative_tickers)) {
                                alternativeTickers = target.alternative_tickers;
                              }
                            }
                            return (
                              <tr key={target.id}>
                                <td>{target.asset_category || '-'}</td>
                                <td>{assetName || '-'}</td>
                                <td>{target.symbol || '-'}</td>
                                <td>
                                  {alternativeTickers.length > 0 ? (
                                    <span style={{ fontSize: '0.9rem', color: '#666' }}>
                                      {alternativeTickers.join(', ')}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
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

