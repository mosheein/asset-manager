import * as XLSX from 'xlsx';

export interface ExcelTargetRow {
  assetType: string;
  assetCategory?: string;
  instrument: string;
  isin?: string;
  ticker?: string;
  targetPercentage: number;
}

export interface ParsedTargetsResult {
  targets: ExcelTargetRow[];
  warnings: string[];
  errors: string[];
}

// Common asset categories by asset type
const VALID_CATEGORIES: Record<string, string[]> = {
  'Shares': [
    'US Stock market',
    'World stock market (no US)',
    'EU',
    'Global World Market',
    'Emerging Markets',
  ],
  'Money Markets Funds': [
    'Money Markets Funds',
    'Money Markets Funds / Short terms bond',
    'Short Term Bonds',
  ],
  'Bonds': [
    'Medium Term Government Bonds (ETF)',
    'Corporate Bonds',
    'Long Term Government Bonds',
    'Inflation Linked Bonds',
  ],
  'Commodities': [
    'Gold',
    'Silver',
    'Crypto',
    'Other Commodities',
  ],
  'REIT': [
    'REIT (US)',
    'REIT (Global)',
    'REIT (EU)',
  ],
  'Stock': [
    'US Stock market',
    'World stock market (no US)',
    'EU',
    'Global World Market',
    'Emerging Markets',
  ],
  'Cash': [
    'Money Markets Funds',
    'Short Term Bonds',
  ],
  'Crypto': [
    'Crypto',
  ],
};

export function parseTargetExcel(fileBuffer: Buffer): ParsedTargetsResult {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        targets: [],
        warnings: [],
        errors: ['Excel file does not contain any worksheets'],
      };
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      return {
        targets: [],
        warnings: [],
        errors: [`Worksheet "${sheetName}" is empty or invalid`],
      };
    }
  
  // Convert to JSON with header row
  const data = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: '',
  }) as any[][];

  if (data.length < 2) {
    return {
      targets: [],
      warnings: [],
      errors: ['Excel file must have at least a header row and one data row'],
    };
  }

  // Find header row (look for common column names)
  let headerRowIndex = -1;
  const headerMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i].map((cell: any) => String(cell || '').toLowerCase().trim());
    
    // Look for key columns - match exact format: Asset Type, Asset Category, Instrument, ISIN, Ticker, % target holding
    const assetTypeIdx = row.findIndex(cell => 
      cell.includes('asset type') || cell.includes('assettype') || cell === 'asset type'
    );
    const assetCategoryIdx = row.findIndex(cell => 
      cell.includes('asset category') || cell.includes('assetcategory') || cell === 'asset category'
    );
    const percentageIdx = row.findIndex(cell => 
      cell.includes('%') || cell.includes('percent') || cell.includes('target') || 
      cell.includes('target holding') || cell === '% target holding'
    );

    if (assetTypeIdx >= 0 && percentageIdx >= 0) {
      headerRowIndex = i;
      headerMap['assetType'] = assetTypeIdx;
      headerMap['assetCategory'] = assetCategoryIdx >= 0 ? assetCategoryIdx : -1;
      headerMap['instrument'] = row.findIndex(cell => 
        cell.includes('instrument') || cell.includes('fund') || cell === 'instrument'
      );
      headerMap['isin'] = row.findIndex(cell => 
        cell.includes('isin') || cell === 'isin'
      );
      headerMap['ticker'] = row.findIndex(cell => 
        cell.includes('ticker') || cell.includes('symbol') || cell === 'ticker'
      );
      headerMap['percentage'] = percentageIdx;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      targets: [],
      warnings: [],
      errors: ['Could not find header row with required columns (Asset Type, %)'],
    };
  }

  const targets: ExcelTargetRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Process data rows
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    
    // Skip empty rows
    if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
      continue;
    }

    const assetType = String(row[headerMap['assetType']] || '').trim();
    const assetCategory = headerMap['assetCategory'] >= 0 
      ? String(row[headerMap['assetCategory']] || '').trim() 
      : '';
    
    // Parse percentage - handle both decimal (0.02) and percentage (2 or 2%) formats
    const rawPercentage = String(row[headerMap['percentage']] || '0').replace(/%/g, '').trim();
    let percentage = parseFloat(rawPercentage);

    // If percentage is between 0 and 1 (exclusive), it's likely stored as a decimal (Excel percentage format)
    // Multiply by 100 to convert to percentage
    // This handles cases where Excel stores 2% as 0.02
    if (!isNaN(percentage) && percentage > 0 && percentage < 1) {
      percentage = percentage * 100;
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

    // Validate asset category
    const normalizedAssetType = normalizeAssetType(assetType);
    if (assetCategory) {
      const validCategories = VALID_CATEGORIES[normalizedAssetType] || [];
      const normalizedCategory = assetCategory.toLowerCase().trim();
      const isValid = validCategories.some(cat => 
        cat.toLowerCase().trim() === normalizedCategory
      );

      if (!isValid && validCategories.length > 0) {
        warnings.push(
          `Row ${i + 1}: Asset category "${assetCategory}" for "${assetType}" may not match common categories. ` +
          `Expected: ${validCategories.join(', ')}`
        );
      }
    }

    const instrument = headerMap['instrument'] >= 0 
      ? String(row[headerMap['instrument']] || '').trim() 
      : '';
    const isin = headerMap['isin'] >= 0 
      ? String(row[headerMap['isin']] || '').trim() || undefined
      : undefined;
    const ticker = headerMap['ticker'] >= 0 
      ? String(row[headerMap['ticker']] || '').trim() || undefined
      : undefined;

    targets.push({
      assetType: normalizedAssetType,
      assetCategory: assetCategory || undefined,
      instrument: instrument || '',
      isin: isin || undefined,
      ticker: ticker || undefined,
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
  } catch (error: any) {
    // Handle XLSX parsing errors
    if (error.message) {
      return {
        targets: [],
        warnings: [],
        errors: [`Failed to read Excel file: ${error.message}`],
      };
    }
    return {
      targets: [],
      warnings: [],
      errors: ['Failed to parse Excel file. Please ensure it is a valid Excel file (.xlsx or .xls)'],
    };
  }
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

  // Return as-is if no match
  return normalized;
}

