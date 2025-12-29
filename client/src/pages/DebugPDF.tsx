import { useState } from 'react';
import axios from 'axios';
import './DebugPDF.css';

function DebugPDF() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await axios.post('/api/debug/parse-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to parse PDF');
      console.error('Debug error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="debug-container">
      <h1>PDF Parser Debug Tool</h1>
      <p>Upload a PDF to see what the parser extracts and debug parsing issues.</p>

      <div className="upload-section">
        <label className="upload-button">
          {loading ? 'Processing...' : 'Select PDF File'}
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            disabled={loading}
          />
        </label>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="debug-results">
          <h2>Parsing Results</h2>
          
          <div className="result-section">
            <h3>Parsed Data</h3>
            <div className="info-grid">
              <div><strong>Account ID:</strong> {result.parsed.accountId}</div>
              <div><strong>Statement Date:</strong> {result.parsed.statementDate}</div>
              <div><strong>Base Currency:</strong> {result.parsed.baseCurrency}</div>
              <div><strong>Holdings Found:</strong> {result.parsed.holdingsCount}</div>
            </div>
          </div>

          {result.parsed.holdingsCount > 0 && (
            <div className="result-section">
              <h3>Sample Holdings (first 10)</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Value</th>
                    <th>Asset Type</th>
                  </tr>
                </thead>
                <tbody>
                  {result.parsed.holdings.map((h: any, idx: number) => (
                    <tr key={idx}>
                      <td>{h.symbol}</td>
                      <td>{h.quantity}</td>
                      <td>${h.price.toFixed(2)}</td>
                      <td>${h.value.toFixed(2)}</td>
                      <td>{h.assetType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="result-section">
            <h3>Debug Information</h3>
            <div className="info-grid">
              <div><strong>Text Length:</strong> {result.debug.textLength.toLocaleString()} characters</div>
              <div><strong>Has Open Positions:</strong> {result.debug.hasOpenPositions ? 'Yes' : 'No'}</div>
              <div><strong>Has Mark-to-Market:</strong> {result.debug.hasMarkToMarket ? 'Yes' : 'No'}</div>
            </div>

            {result.debug.symbolMatches && result.debug.symbolMatches.length > 0 && (
              <div className="info-section">
                <strong>Symbol Matches Found:</strong>
                <div className="symbol-list">
                  {result.debug.symbolMatches.slice(0, 20).map((s: string, idx: number) => (
                    <span key={idx} className="symbol-tag">{s.trim()}</span>
                  ))}
                </div>
              </div>
            )}

            {result.debug.sampleLines.openPositions.length > 0 && (
              <div className="info-section">
                <h4>Open Positions Section (first 30 lines)</h4>
                <pre className="code-block">
                  {result.debug.sampleLines.openPositions.join('\n')}
                </pre>
              </div>
            )}

            {result.debug.sampleLines.markToMarket.length > 0 && (
              <div className="info-section">
                <h4>Mark-to-Market Section (first 30 lines)</h4>
                <pre className="code-block">
                  {result.debug.sampleLines.markToMarket.join('\n')}
                </pre>
              </div>
            )}

            {result.debug.openPositionsSection && (
              <div className="info-section">
                <h4>Open Positions Section (raw, first 2000 chars)</h4>
                <pre className="code-block">
                  {result.debug.openPositionsSection}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DebugPDF;

