/**
 * Parser for CSV format target files
 * Expected format: Asset Type, Asset Category, Instrument, ISIN, Main Ticker, %, Other Tickers
 */

export interface CsvTargetRow {
  assetType: string;
  assetCategory?: string;
  instrument?: string;
  isin?: string;
  mainTicker?: string;
  otherTickers?: string[]; // Array of alternative tickers
  targetPercentage: number;
}

export interface ParsedCsvTargetsResult {
  targets: CsvTargetRow[];
  warnings: string[];
  errors: string[];
}

export function parseTargetCsv(csvText: string): ParsedCsvTargetsResult {
  const targets: CsvTargetRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length < 2) {
    return {
      targets: [],
      warnings: [],
      errors: ['CSV file must have at least a header row and one data row'],
    };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);
  
  // Find column indices (case-insensitive)
  const headerMap: Record<string, number> = {};
  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().trim();
    if (normalized.includes('asset type') || normalized === 'asset type') {
      headerMap['assetType'] = index;
    } else if (normalized.includes('asset category') || normalized === 'asset category') {
      headerMap['assetCategory'] = index;
    } else if (normalized.includes('instrument')) {
      headerMap['instrument'] = index;
    } else if (normalized.includes('isin')) {
      headerMap['isin'] = index;
    } else if (normalized.includes('main ticker') || normalized === 'main ticker') {
      headerMap['mainTicker'] = index;
    } else if (normalized.includes('ticker') && !normalized.includes('other') && !normalized.includes('main')) {
      // Fallback: if no "Main Ticker" but there's a "Ticker" column, use it
      if (headerMap['mainTicker'] === undefined) {
        headerMap['mainTicker'] = index;
      }
    } else if (normalized.includes('%') || normalized.includes('percent') || normalized === '%') {
      headerMap['percentage'] = index;
    } else if (normalized.includes('other ticker') || normalized === 'other tickers') {
      headerMap['otherTickers'] = index;
    }
  });

  // Validate required columns
  if (headerMap['assetType'] === undefined || headerMap['percentage'] === undefined) {
    return {
      targets: [],
      warnings: [],
      errors: ['CSV file must contain "Asset Type" and "%" columns'],
    };
  }

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = parseCsvLine(line);
    
    const assetType = row[headerMap['assetType']]?.trim() || '';
    const assetCategory = headerMap['assetCategory'] !== undefined 
      ? row[headerMap['assetCategory']]?.trim() || undefined 
      : undefined;
    const instrument = headerMap['instrument'] !== undefined
      ? row[headerMap['instrument']]?.trim() || undefined
      : undefined;
    const isin = headerMap['isin'] !== undefined
      ? row[headerMap['isin']]?.trim() || undefined
      : undefined;
    const mainTicker = headerMap['mainTicker'] !== undefined
      ? row[headerMap['mainTicker']]?.trim() || undefined
      : undefined;
    
    // Parse percentage
    const rawPercentage = row[headerMap['percentage']]?.replace(/%/g, '').trim() || '0';
    let percentage = parseFloat(rawPercentage);
    
    // Handle decimal format (0.02 = 2%)
    if (!isNaN(percentage) && percentage > 0 && percentage < 1) {
      percentage = percentage * 100;
    }

    // Parse other tickers (pipe-separated or comma-separated)
    let otherTickers: string[] = [];
    if (headerMap['otherTickers'] !== undefined) {
      const otherTickersStr = row[headerMap['otherTickers']]?.trim() || '';
      if (otherTickersStr) {
        // Support both pipe (|) and comma (,) separators
        otherTickers = otherTickersStr
          .split(/[|,]/)
          .map(t => t.trim())
          .filter(t => t.length > 0);
      }
    }

    // Validate required fields
    if (!assetType) {
      errors.push(`Row ${i + 1}: Missing Asset Type`);
      continue;
    }

    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      errors.push(`Row ${i + 1}: Invalid percentage (${row[headerMap['percentage']]})`);
      continue;
    }

    // Skip rows with 0% allocation
    if (percentage === 0) {
      continue;
    }

    targets.push({
      assetType: normalizeAssetType(assetType),
      assetCategory: assetCategory || undefined,
      instrument: instrument || undefined,
      isin: isin || undefined,
      mainTicker: mainTicker || undefined,
      otherTickers: otherTickers.length > 0 ? otherTickers : undefined,
      targetPercentage: percentage,
    });
  }

  // Validate total percentage
  const totalPercentage = targets.reduce((sum, t) => sum + t.targetPercentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    warnings.push(
      `Total target allocation is ${totalPercentage.toFixed(2)}%, not 100%. ` +
      `This may be intentional if some categories are excluded.`
    );
  }

  return {
    targets,
    warnings,
    errors,
  };
}

/**
 * Parse a CSV line, handling quoted fields
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  
  return result;
}

function normalizeAssetType(assetType: string): string {
  const normalized = assetType.trim();
  
  // Normalize common variations
  if (normalized.toLowerCase().includes('share') || normalized.toLowerCase().includes('stock')) {
    return 'Stock';
  }
  if (normalized.toLowerCase().includes('bond')) {
    return 'Bond';
  }
  if (normalized.toLowerCase().includes('money market') || normalized.toLowerCase().includes('cash')) {
    return 'Cash';
  }
  if (normalized.toLowerCase().includes('commodit')) {
    return 'Commodity';
  }
  if (normalized.toLowerCase().includes('reit') || normalized.toLowerCase().includes('real estate')) {
    return 'REIT';
  }
  if (normalized.toLowerCase().includes('crypto')) {
    return 'Crypto';
  }

  return normalized;
}
