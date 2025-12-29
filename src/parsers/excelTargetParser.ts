import * as XLSX from 'xlsx';

export interface ExcelTargetRow {
  assetType: string;
  assetCategory?: string;
  instrument?: string;
  isin?: string;
  ticker?: string;
  targetPercentage: number;
}

export interface ParsedTargets {
  targets: ExcelTargetRow[];
  warnings: string[];
}

// Common asset categories for validation
const COMMON_ASSET_CATEGORIES: Record<string, string[]> = {
  'Stock': [
    'US Stock market',
    'World stock market (no US)',
    'Global World Market (60% US, 40% other)',
    'EU',
  ],
  'Bond': [
    'Medium Term Government Bonds (ETF)',
    'Medium Term Govenement Bonds (ETF)', // Common typo
    'Corporate Bonds',
    'Short Term Bonds',
    'Long Term Bonds',
    'Inflation Linked Bonds',
  ],
  'Cash': [
    'Money Markets Funds',
    'Money Markets Funds / Short terms bond',
    'Cash',
  ],
  'Commodity': [
    'Gold',
    'Silver',
    'Crypto',
    'Commodities',
  ],
  'REIT': [
    'REIT (US)',
    'REIT (Global)',
    'Real Estate',
  ],
};

export function parseExcelTargets(fileBuffer: Buffer): ParsedTargets {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with header row
  const data = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: '',
  }) as any[][];

  if (data.length < 2) {
    throw new Error('Excel file must have at least a header row and one data row');
  }

  // Find header row (look for common column names)
  let headerRowIndex = -1;
  const headerKeywords = ['Asset Type', 'Asset Category', 'Instrument', 'ISIN', 'Ticker', '%', 'target'];
  
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    const rowText = row.join(' ').toLowerCase();
    if (headerKeywords.some(keyword => rowText.includes(keyword.toLowerCase()))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find header row in Excel file');
  }

  const headerRow = data[headerRowIndex].map((h: any) => String(h).trim().toLowerCase());
  
  // Find column indices
  const assetTypeCol = findColumnIndex(headerRow, ['asset type', 'assettype']);
  const assetCategoryCol = findColumnIndex(headerRow, ['asset category', 'category', 'assetcategory']);
  const instrumentCol = findColumnIndex(headerRow, ['instrument']);
  const isinCol = findColumnIndex(headerRow, ['isin']);
  const tickerCol = findColumnIndex(headerRow, ['ticker', 'symbol']);
  const percentageCol = findColumnIndex(headerRow, ['%', 'percent', 'percentage', 'target', 'target holding', 'target %']);

  if (assetTypeCol === -1 || percentageCol === -1) {
    throw new Error('Required columns "Asset Type" and "% target holding" not found');
  }

  const targets: ExcelTargetRow[] = [];
  const warnings: string[] = [];

  // Parse data rows
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    
    // Skip empty rows
    if (!row || row.every(cell => !cell || String(cell).trim() === '')) {
      continue;
    }

    const assetType = String(row[assetTypeCol] || '').trim();
    const targetPercentage = parseFloat(String(row[percentageCol] || '0').replace(/[%,]/g, ''));

    // Skip rows without asset type or with invalid percentage
    if (!assetType || isNaN(targetPercentage) || targetPercentage <= 0) {
      continue;
    }

    const assetCategory = assetCategoryCol >= 0 ? String(row[assetCategoryCol] || '').trim() : undefined;
    const instrument = instrumentCol >= 0 ? String(row[instrumentCol] || '').trim() : undefined;
    const isin = isinCol >= 0 ? String(row[isinCol] || '').trim() : undefined;
    const ticker = tickerCol >= 0 ? String(row[tickerCol] || '').trim() : undefined;

    // Validate asset category
    if (assetCategory) {
      const normalizedCategory = assetCategory.trim();
      const commonCategories = COMMON_ASSET_CATEGORIES[assetType] || [];
      
      if (commonCategories.length > 0 && !commonCategories.some(cat => 
        cat.toLowerCase() === normalizedCategory.toLowerCase()
      )) {
        warnings.push(
          `Warning: Asset category "${normalizedCategory}" for "${assetType}" may not match common categories. ` +
          `Common categories: ${commonCategories.join(', ')}`
        );
      }
    }

    targets.push({
      assetType,
      assetCategory: assetCategory || undefined,
      instrument: instrument || undefined,
      isin: isin || undefined,
      ticker: ticker || undefined,
      targetPercentage,
    });
  }

  // Validate total percentage
  const totalPercentage = targets.reduce((sum, t) => sum + t.targetPercentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    warnings.push(
      `Warning: Total target percentage is ${totalPercentage.toFixed(2)}%, not 100%`
    );
  }

  return { targets, warnings };
}

function findColumnIndex(headerRow: string[], keywords: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    const header = headerRow[i];
    if (keywords.some(keyword => header.includes(keyword))) {
      return i;
    }
  }
  return -1;
}

