import pdfParse from 'pdf-parse';
import { Holding } from '../db/schema';

export interface ParsedStatement {
  accountId: string;
  statementDate: string;
  baseCurrency: string;
  holdings: ParsedHolding[];
  cash: number;
  totalValue: number;
}

export interface ParsedHolding {
  symbol: string;
  quantity: number;
  price: number;
  value: number;
  currency?: string; // Trading currency from statement
  assetType?: string;
  assetCategory?: string;
  isin?: string;
  instrumentName?: string;
}

/**
 * Parse Interactive Brokers CSV statement
 */
export function parseIBStatementCSV(csvText: string): ParsedStatement {
  const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
  
  let accountId = 'UNKNOWN';
  let baseCurrency = 'USD';
  let statementDate = new Date().toISOString().split('T')[0];
  const holdings: ParsedHolding[] = [];
  let cash = 0;
  let totalValue = 0;

  // Parse CSV - it's a structured format with sections
  let currentSection = '';
  let headerRow: string[] = [];
  let inOpenPositions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',').map(p => p.trim());

    // Detect section headers
    if (parts[0] === 'Statement' && parts[1] === 'Header') {
      currentSection = 'Statement';
    } else if (parts[0] === 'Account Information' && parts[1] === 'Header') {
      currentSection = 'Account Information';
    } else if (parts[0] === 'Open Positions' && parts[1] === 'Header') {
      currentSection = 'Open Positions';
      inOpenPositions = true;
      // Header row: DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code
      headerRow = parts.slice(2); // Skip section name and "Header"
    } else if (parts[0] === 'Open Positions' && parts[1] === 'Data') {
      // Parse holding row
      if (parts.length >= 12) {
        const dataDiscriminator = parts[2];
        const assetCategory = parts[3];
        const currency = parts[4];
        const symbol = parts[5];
        const quantity = parseFloat(parts[6] || '0');
        const mult = parseFloat(parts[7] || '1');
        const costPrice = parseFloat(parts[8] || '0');
        const costBasis = parseFloat(parts[9] || '0');
        const closePrice = parseFloat(parts[10] || '0');
        const value = parseFloat(parts[11] || '0');
        const unrealizedPL = parseFloat(parts[12] || '0');
        const code = parts[13] || '';

        // Skip totals and summaries
        if (dataDiscriminator === 'Summary' && symbol && symbol !== 'Total' && quantity > 0 && closePrice > 0) {
          // Don't set assetType here - it will be determined from targets
          holdings.push({
            symbol,
            quantity: quantity * mult, // Apply multiplier
            price: closePrice,
            value: value || (quantity * mult * closePrice),
            currency: currency || undefined, // Currency from CSV
            assetType: undefined, // Will be determined from targets
            assetCategory: assetCategory || undefined,
          });
        }
      }
    } else if (parts[0] === 'Account Information' && parts[1] === 'Data') {
      // Extract account info
      if (parts[2] === 'Account' && parts[3]) {
        accountId = parts[3];
      } else if (parts[2] === 'Base Currency' && parts[3]) {
        baseCurrency = parts[3];
      }
    } else if (parts[0] === 'Statement' && parts[1] === 'Data') {
      // Extract statement date from period
      if (parts[2] === 'Period' && parts[3]) {
        // Format: "October 1, 2025 - October 31, 2025"
        const periodMatch = parts[3].match(/(\w+\s+\d+,\s+\d{4})\s*-\s*(\w+\s+\d+,\s+\d{4})/);
        if (periodMatch) {
          const endDateStr = periodMatch[2];
          const dateObj = new Date(endDateStr);
          if (!isNaN(dateObj.getTime())) {
            statementDate = dateObj.toISOString().split('T')[0];
          }
        }
      } else if (parts[2] === 'WhenGenerated' && parts[3]) {
        // Format: "2025-11-29, 14:16:04 EST"
        const dateMatch = parts[3].match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          statementDate = dateMatch[1];
        }
      }
    } else if (parts[0] === 'Net Asset Value' && parts[1] === 'Data') {
      // Extract cash and total value
      if (parts[2] === 'Cash') {
        cash = parseFloat(parts[6] || '0'); // Current Total column
      } else if (parts[2] === 'Total') {
        totalValue = parseFloat(parts[6] || '0'); // Current Total column
      }
    }
  }

  // If totalValue not found, calculate from holdings
  if (totalValue === 0) {
    totalValue = holdings.reduce((sum, h) => sum + h.value, 0) + cash;
  }

  return {
    accountId,
    statementDate,
    baseCurrency,
    holdings,
    cash,
    totalValue,
  };
}

function inferAssetTypeFromCategory(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('stock') || cat.includes('equity')) return 'Stock';
  if (cat.includes('bond')) return 'Bond';
  if (cat.includes('forex') || cat.includes('currency')) return 'Forex';
  if (cat.includes('commodity')) return 'Commodity';
  if (cat.includes('crypto')) return 'Crypto';
  if (cat.includes('reit') || cat.includes('real estate')) return 'REIT';
  return 'Stock'; // Default
}

/**
 * Parse Interactive Brokers PDF statement
 */
export async function parseIBStatement(pdfBuffer: Buffer): Promise<ParsedStatement> {
  const data = await pdfParse(pdfBuffer);
  const text = data.text;

  // Extract account ID (format: U***3705 or similar)
  const accountIdMatch = text.match(/Account:\s*([U\d\*]+)/i) || 
                         text.match(/Account\s+([U\d\*]+)/i);
  const accountId = accountIdMatch ? accountIdMatch[1].trim() : 'UNKNOWN';

  // Extract statement date (look for date range or "Generated" date)
  const dateRangeMatch = text.match(/(\w+\s+\d+,\s+\d{4})\s*-\s*(\w+\s+\d+,\s+\d{4})/);
  const generatedMatch = text.match(/Generated:\s*(\d{4}-\d{2}-\d{2})/);
  let statementDate = '';
  if (dateRangeMatch) {
    // Convert "February 28, 2025" to ISO format
    const endDateStr = dateRangeMatch[2];
    const dateObj = new Date(endDateStr);
    if (!isNaN(dateObj.getTime())) {
      statementDate = dateObj.toISOString().split('T')[0];
    } else {
      statementDate = new Date().toISOString().split('T')[0];
    }
  } else if (generatedMatch) {
    statementDate = generatedMatch[1];
  } else {
    statementDate = new Date().toISOString().split('T')[0];
  }

  // Extract base currency
  const baseCurrencyMatch = text.match(/Base Currency:\s*([A-Z]{3})/i) ||
                           text.match(/Currency:\s*([A-Z]{3})/i);
  const baseCurrency = baseCurrencyMatch ? baseCurrencyMatch[1].toUpperCase() : 'USD';

  // Extract cash (look for cash balance)
  const cashMatch = text.match(/Cash[:\s]+([\d,]+\.?\d*)/i) ||
                   text.match(/Ending Cash[:\s]+([\d,]+\.?\d*)/i);
  let cash = 0;
  if (cashMatch) {
    cash = parseFloat(cashMatch[1].replace(/,/g, ''));
  }

  // Try to parse holdings from "Open Positions" section first (vertical format)
  let holdings = parseOpenPositions(text, baseCurrency);
  
  // If no holdings found, try "Mark-to-Market Performance Summary" (horizontal format)
  if (holdings.length === 0) {
    console.log('parseIBStatement: No holdings found in Open Positions, trying Mark-to-Market Performance Summary');
    holdings = parseHoldingsFromText(text, baseCurrency);
  }

  // Calculate total value
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0) + cash;

  return {
    accountId,
    statementDate,
    baseCurrency,
    holdings,
    cash,
    totalValue,
  };
}

function parseOpenPositions(text: string, baseCurrency: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  // Match Open Positions section - it might appear multiple times (multiple pages)
  // Find the first occurrence and continue until we hit "Forex" or another major section
  const firstOpenPos = text.indexOf('Open Positions');
  if (firstOpenPos === -1) {
    console.log('parseOpenPositions: No Open Positions section found');
    return holdings;
  }
  
  // Find where to stop - look for "Forex" or end of relevant section
  const forexIndex = text.indexOf('Forex', firstOpenPos);
  const notesIndex = text.indexOf('Notes', firstOpenPos);
  const endIndex = Math.min(
    forexIndex > 0 ? forexIndex : text.length,
    notesIndex > 0 ? notesIndex : text.length
  );
  
  const openPositionsSection = text.substring(firstOpenPos, endIndex);
  console.log('parseOpenPositions: Found Open Positions section, length:', openPositionsSection.length);

  const lines = openPositionsSection.split('\n');

  let headerIndex = -1;
  // Look for header - it might be on separate lines or same line
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i].toLowerCase();
    // Check if this line contains "symbol"
    if (line === 'symbol' || line.includes('symbol')) {
      // Check if quantity is on this line or next few lines
      if (line.includes('quantity') || line.includes('qty')) {
        headerIndex = i;
        console.log('parseOpenPositions: Found header at line', i, ':', lines[i].substring(0, 100));
        break;
      } else if (i + 1 < lines.length && (lines[i + 1].toLowerCase() === 'quantity' || lines[i + 1].toLowerCase().includes('quantity'))) {
        headerIndex = i;
        console.log('parseOpenPositions: Found header at line', i, '(Symbol) and', i + 1, '(Quantity)');
        break;
      }
    }
  }

  if (headerIndex === -1) {
    console.log('parseOpenPositions: No header row found with Symbol and Quantity');
    console.log('First 15 lines:', lines.slice(0, 15));
    return holdings;
  }
  
  // If header is split across lines, find where data starts
  // Header should be: Symbol, Quantity, Mult, Cost Price, Cost Basis, Close Price, Value, Unrealized P/L, Code
  let dataStartIndex = headerIndex;
  let headerLines = 0;
  const headerKeywords = ['symbol', 'quantity', 'mult', 'cost price', 'cost basis', 'close price', 'value', 'unrealized', 'code'];
  
  while (dataStartIndex < lines.length && headerLines < headerKeywords.length) {
    const line = lines[dataStartIndex].toLowerCase();
    if (headerKeywords.some(keyword => line.includes(keyword))) {
      headerLines++;
      dataStartIndex++;
    } else {
      break;
    }
  }
  
  console.log(`parseOpenPositions: Header ends at line ${dataStartIndex - 1}, data starts at ${dataStartIndex}`);

  // Check if it's vertical format (each field on a separate line)
  // In vertical format, each row is: Symbol line, then 8 data lines (Quantity, Mult, Cost Price, Cost Basis, Close Price, Value, Unrealized P/L, Code)
  const isVerticalFormat = lines[headerIndex + 1] && 
                          !lines[headerIndex + 1].includes(',') && 
                          !lines[headerIndex + 1].match(/^\s*\w+\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+/);

  if (isVerticalFormat) {
    // Each row is 9 lines: 1 symbol line + 8 data lines
    console.log('parseOpenPositions: Parsing in vertical format');
    
    const numDataFields = 8; // Quantity, Mult, Cost Price, Cost Basis, Close Price, Value, Unrealized P/L, Code
    const rowSize = numDataFields + 1; // +1 for symbol line
    
    // Parse row by row, but be flexible about row boundaries
    let i = dataStartIndex;
    while (i < lines.length) {
      // Skip empty lines, "Total" lines, and section headers
      // But be careful - "Total" might be a number, not a header
      while (i < lines.length && (
        lines[i].trim() === '' ||
        (lines[i].match(/^(Total|Stocks|USD|EUR|GBP|JPY)$/i) && !lines[i].match(/[\d,]/)) || // Only skip if it's not a number
        lines[i].match(/^Total\s+(in|Stocks)/i) || // Skip "Total in USD" or "Total Stocks"
        (lines[i].match(/^Total$/i) && i + 1 < lines.length && lines[i + 1].trim() === '') // Skip standalone "Total" followed by empty line
      )) {
        i++;
      }
      
      if (i >= lines.length) break;
      
      // Extract symbol (first line of the row)
      // May be prefixed with section name like "StocksEURIWDA" or "USDACWD"
      const symbolLine = lines[i].trim();
      
      // Skip if it's clearly not a symbol line
      if (symbolLine.match(/^[\d-]/) || 
          (symbolLine.includes('.') && !symbolLine.match(/[A-Z]{2,6}$/)) || 
          (symbolLine.includes(',') && !symbolLine.match(/[A-Z]{2,6}$/)) ||
          symbolLine.length > 20) {
        i++;
        continue;
      }
      
      // Skip pure section headers and common codes
      if (symbolLine.match(/^(Stocks|Total|USD|EUR|GBP|JPY|Code)$/i) ||
          symbolLine.match(/^Total\s+/i) ||
          symbolLine === 'SY') {
        i++;
        continue;
      }
      
      // Check if we have enough lines for a complete row
      if (i + rowSize > lines.length) break;
      
      // Try to extract symbol - may be at end of line if prefixed
      // Examples: "StocksEURIWDA" -> "IWDA", "IWDA" -> "IWDA", "USDACWD" -> "ACWD"
      // Common patterns: "StocksEURIWDA", "StocksEURXDWD", "USDACWD", etc.
      let symbol = '';
      
      // Known section prefixes that should be stripped
      // Also extract currency from prefixes
      const sectionPrefixes = [
        { prefix: 'StocksEUR', currency: 'EUR' },
        { prefix: 'Stocks', currency: null }, // Generic, no currency
        { prefix: 'USD', currency: 'USD' },
        { prefix: 'EUR', currency: 'EUR' },
        { prefix: 'GBP', currency: 'GBP' },
        { prefix: 'JPY', currency: 'JPY' },
      ];
      
      // Try to strip known prefixes first and extract currency
      let cleanedLine = symbolLine;
      let extractedCurrency: string | undefined = undefined;
      for (const { prefix, currency } of sectionPrefixes) {
        if (cleanedLine.startsWith(prefix)) {
          cleanedLine = cleanedLine.substring(prefix.length);
          if (currency) {
            extractedCurrency = currency;
          }
          break;
        }
      }
      
      // Now try to extract symbol from cleaned line
      // Prefer shorter tickers (1-5 chars) as they're more common
      // Try 1-5 chars first, then 6 chars (allow single char symbols like "O")
      for (let len = 5; len >= 1; len--) {
        const pattern = new RegExp(`([A-Z0-9]{${len}})$`);
        const match = cleanedLine.match(pattern);
        if (match && /[A-Z]/.test(match[1])) {
          symbol = match[1];
          break;
        }
      }
      
      if (!symbol) {
        // If no symbol extracted, try the whole cleaned line if it's short enough
        // Allow single character symbols
        if (cleanedLine.length >= 1 && cleanedLine.length <= 6 && /^[A-Z0-9]+$/.test(cleanedLine)) {
          symbol = cleanedLine;
        } else {
          i++;
          continue;
        }
      }
      
      // Extract values from subsequent lines (skip symbol line)
      // Expected order: Quantity (i+1), Mult (i+2), Cost Price (i+3), Cost Basis (i+4), 
      //                 Close Price (i+5), Value (i+6), Unrealized P/L (i+7), Code (i+8, may be missing)
      // Some rows may not have Code, so check if next line looks like a symbol instead
      let dataEndIndex = i + 1 + numDataFields;
      
      // Check if the Code field (last data field) looks like a symbol instead
      // Code should be at index i + 1 + numDataFields - 1 = i + 8
      const codeIndex = i + 1 + numDataFields - 1;
      if (codeIndex < lines.length) {
        const potentialCode = lines[codeIndex].trim();
        // If it looks like a symbol (1-6 uppercase letters/numbers, not "SY"), Code is missing
        // Allow single character symbols like "O" and short symbols like "B28A", "IB27"
        if (potentialCode && /^[A-Z0-9]{1,6}$/.test(potentialCode) && 
            potentialCode !== 'SY' &&
            potentialCode !== 'Code' &&
            !potentialCode.match(/^[\d,]+\.?\d*$/)) { // Not a pure number
          // Code field is missing, next symbol started early
          dataEndIndex = codeIndex; // Don't include the next symbol
          console.log(`parseOpenPositions: Code missing for ${symbol}, next symbol is ${potentialCode}`);
        }
      }
      
      const rowLines = lines.slice(i + 1, dataEndIndex);
      
      // Parse numbers from data lines
      // We expect: Quantity, Mult, Cost Price, Cost Basis, Close Price, Value, Unrealized P/L, (Code - optional)
      const values: number[] = [];
      for (let j = 0; j < rowLines.length; j++) {
        const line = rowLines[j];
        // Skip if it looks like a symbol (next row started early)
        if (/^[A-Z]{2,6}$/.test(line) && !line.match(/\d/)) {
          break; // Code field is missing, next symbol started
        }
        let cleaned = line.replace(/,/g, '');
        if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
          cleaned = '-' + cleaned.slice(1, -1);
        }
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          values.push(num);
        }
      }
      
      if (values.length < 6) {
        console.log(`parseOpenPositions: Skipping ${symbol} - not enough values (${values.length}), expected at least 6, rowLines: [${rowLines.join(', ')}]`);
        // Adjust row size for next iteration
        const codeWasMissing = dataEndIndex < i + 1 + numDataFields;
        i += codeWasMissing ? rowSize - 1 : rowSize;
        continue;
      }
      
      // In vertical format: 
      // values[0] = Quantity
      // values[1] = Mult (skip)
      // values[2] = Cost Price (skip)
      // values[3] = Cost Basis (skip)
      // values[4] = Close Price (this is what we want)
      // values[5] = Value (current market value)
      // values[6] = Unrealized P/L (skip)
      const quantity = values[0] || 0;
      const price = values[4] || 0; // Close Price at index 4
      const value = values[5] || (quantity * price); // Value at index 5
      
      // Calculate actual row size (8 if Code missing, 9 if present)
      const codeWasMissing = dataEndIndex < i + 1 + numDataFields;
      const actualRowSize = codeWasMissing ? rowSize - 1 : rowSize;
      
      if (quantity <= 0 || price <= 0) {
        console.log(`parseOpenPositions: Skipping ${symbol} - invalid qty (${quantity}) or price (${price}), values: [${values.join(', ')}]`);
        continue;
      }

      // Don't set assetType here - it will be determined from targets
      console.log(`parseOpenPositions: Parsed ${symbol} - Qty: ${quantity}, Price: ${price}, Value: ${value}`);

      holdings.push({
        symbol,
        quantity,
        price,
        value: value || (quantity * price),
        currency: extractedCurrency,
        assetType: undefined, // Will be determined from targets
      });
      
      // Move to next row (adjust if Code was missing)
      i += actualRowSize;
    }
  } else {
    // Horizontal format: all fields on one line
    console.log('parseOpenPositions: Parsing in horizontal format');
    
    // Parse data rows
    // Based on the format: Symbol, Quantity, Mult, Cost Price, Cost Basis, Close Price, Value, Unrealized P/L, Code
    for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.toLowerCase().includes('total') || line.includes('---') || line.length < 5) {
      continue;
    }

    // Try to extract symbol and values
    // Format might be: "IWDA  100  1  76.61  7661.03  105.5250  10552.50  2891.47  SY"
    const parts = line.split(/\s+/).filter(p => p && p.trim() !== '');
    
    if (parts.length < 6) continue;

    // First part should be symbol (may have prefix like "StocksEUR")
    let symbol = parts[0];
    let extractedCurrency: string | undefined = undefined;
    const sectionPrefixes = [
      { prefix: 'StocksEUR', currency: 'EUR' },
      { prefix: 'Stocks', currency: null },
      { prefix: 'USD', currency: 'USD' },
      { prefix: 'EUR', currency: 'EUR' },
    ];
    for (const { prefix, currency } of sectionPrefixes) {
      if (symbol.startsWith(prefix)) {
        symbol = symbol.substring(prefix.length);
        if (currency) {
          extractedCurrency = currency;
        }
        break;
      }
    }

    // Extract numeric values
    const numbers: number[] = [];
    for (let j = 1; j < parts.length; j++) {
      const cleaned = parts[j].replace(/,/g, '').replace(/--/g, '0');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }

    if (numbers.length < 5) continue;

    // Expected order: Quantity, Mult, Cost Price, Cost Basis, Close Price, Value, Unrealized P/L
    const quantity = numbers[0] || 0;
    const price = numbers[4] || 0; // Close Price
    const value = numbers[5] || (quantity * price); // Value

    if (quantity <= 0 || price <= 0) continue;

    // Don't set assetType here - it will be determined from targets
    holdings.push({
      symbol,
      quantity,
      price,
      value,
      currency: extractedCurrency,
      assetType: undefined, // Will be determined from targets
    });
  }
  }

  console.log(`parseOpenPositions: Total holdings parsed: ${holdings.length}`);
  return holdings;
}

function parseHoldingsFromText(text: string, baseCurrency: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];
  
  // Look for "Mark-to-Market Performance Summary" section
  const m2mMatch = text.match(/Mark-to-Market Performance Summary[\s\S]*?(?=Realized|Change in NAV|Notes|$)/i);
  if (!m2mMatch) {
    console.log('parseHoldingsFromText: No Mark-to-Market Performance Summary section found');
    return holdings;
  }

  const m2mSection = m2mMatch[0];
  const lines = m2mSection.split('\n');

  // Find header row
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('symbol') && (line.includes('current quantity') || line.includes('quantity'))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return holdings;
  }

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.toLowerCase().includes('total') || line.includes('---')) {
      continue;
    }

    // Try to parse: Asset Category, Symbol, Prior Qty, Current Qty, Prior Price, Current Price, ...
    const parts = line.split(/\s+/).filter(p => p && p.trim() !== '');
    if (parts.length < 6) continue;

    // Find symbol (usually 2-6 uppercase letters)
    let symbol = '';
    let symbolIndex = -1;
    for (let j = 0; j < parts.length; j++) {
      if (/^[A-Z]{2,6}$/.test(parts[j])) {
        symbol = parts[j];
        symbolIndex = j;
        break;
      }
    }

    if (!symbol) continue;

    // Extract quantities and prices (should be after symbol)
    const numbers: number[] = [];
    for (let j = symbolIndex + 1; j < parts.length; j++) {
      const cleaned = parts[j].replace(/,/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }

    if (numbers.length < 4) continue;

    // Expected: Prior Qty, Current Qty, Prior Price, Current Price
    const quantity = numbers[1] || 0; // Current Quantity
    const price = numbers[3] || 0; // Current Price
    const value = quantity * price;

    if (quantity <= 0 || price <= 0) continue;

    // Don't set assetType here - it will be determined from targets
    holdings.push({
      symbol,
      quantity,
      price,
      value,
      currency: undefined, // Mark-to-Market section doesn't have currency info
      assetType: undefined, // Will be determined from targets
    });
  }

  return holdings;
}

function inferAssetType(symbol: string, context: string): string {
  const sym = symbol.toUpperCase();
  const ctx = context.toLowerCase();

  // Check for crypto
  if (sym.includes('BTC') || sym.includes('ETH') || sym === 'COIN' || sym === 'GBTC') {
    return 'Crypto';
  }

  // Check for bonds
  if (sym.includes('BND') || sym.includes('TIP') || sym.includes('AGG') || 
      ctx.includes('bond') || sym.match(/^[A-Z]{1,2}\d{2}[A-Z]$/)) {
    return 'Bond';
  }

  // Check for REITs
  if (sym.includes('REIT') || sym.includes('VNQ') || sym.includes('REET') || 
      ctx.includes('reit') || ctx.includes('real estate')) {
    return 'REIT';
  }

  // Check for commodities
  if (sym.includes('GLD') || sym.includes('SLV') || sym.includes('USAG') || 
      ctx.includes('commodity') || ctx.includes('gold') || ctx.includes('silver')) {
    return 'Commodity';
  }

  // Default to stock
  return 'Stock';
}
