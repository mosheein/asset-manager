/**
 * Currency lookup service
 * Tries to determine the trading currency for a given symbol
 */

interface CurrencyLookupResult {
  currency: string;
  source: 'cache' | 'api' | 'default';
}

// Cache for currency lookups (in-memory, could be moved to DB)
const currencyCache = new Map<string, string>();

// Common currency mappings based on exchange/symbol patterns
const CURRENCY_PATTERNS: Array<{ pattern: RegExp; currency: string }> = [
  // European exchanges
  { pattern: /^[A-Z]{2,4}\.PA$/, currency: 'EUR' }, // Paris
  { pattern: /^[A-Z]{2,4}\.DE$/, currency: 'EUR' }, // Frankfurt
  { pattern: /^[A-Z]{2,4}\.AS$/, currency: 'EUR' }, // Amsterdam
  { pattern: /^[A-Z]{2,4}\.BR$/, currency: 'EUR' }, // Brussels
  { pattern: /^[A-Z]{2,4}\.MI$/, currency: 'EUR' }, // Milan
  { pattern: /^[A-Z]{2,4}\.LS$/, currency: 'GBP' }, // London
  { pattern: /^[A-Z]{2,4}\.SW$/, currency: 'CHF' }, // Swiss
  { pattern: /^[A-Z]{2,4}\.VI$/, currency: 'EUR' }, // Vienna
  
  // Common European ETFs/stocks (without exchange suffix)
  { pattern: /^(B26A|B28A|CSH2|EGLN|ERNX|EUHD|IB27|IEGY|WBTC|XEON|YCSH)$/, currency: 'EUR' },
  
  // US exchanges (default to USD)
  { pattern: /^[A-Z]{1,5}$/, currency: 'USD' }, // Most US stocks are 1-5 chars, no suffix
];

/**
 * Lookup currency for a symbol using online API
 */
async function lookupCurrencyOnline(symbol: string): Promise<string | null> {
  try {
    // Try Yahoo Finance API (free, no key required)
    // Format: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as any;
    
    // Extract currency from Yahoo Finance response
    if (data.chart?.result?.[0]?.meta?.currency) {
      return data.chart.result[0].meta.currency;
    }

    // Try alternative endpoint
    const quoteResponse = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json() as any;
      if (quoteData.quoteResponse?.result?.[0]?.currency) {
        return quoteData.quoteResponse.result[0].currency;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error looking up currency for ${symbol}:`, error);
    return null;
  }
}

/**
 * Determine currency for a symbol
 * Priority: 1. Cache, 2. Pattern matching, 3. Online lookup, 4. Default (USD)
 */
export async function getCurrencyForSymbol(
  symbol: string,
  fromStatement?: string
): Promise<string> {
  // If currency is provided from statement, use it and cache it
  if (fromStatement) {
    currencyCache.set(symbol, fromStatement);
    return fromStatement;
  }

  // Check cache first
  if (currencyCache.has(symbol)) {
    return currencyCache.get(symbol)!;
  }

  // Try pattern matching
  for (const { pattern, currency } of CURRENCY_PATTERNS) {
    if (pattern.test(symbol)) {
      currencyCache.set(symbol, currency);
      return currency;
    }
  }

  // Try online lookup
  const onlineCurrency = await lookupCurrencyOnline(symbol);
  if (onlineCurrency) {
    currencyCache.set(symbol, onlineCurrency);
    return onlineCurrency;
  }

  // Default to USD
  const defaultCurrency = 'USD';
  currencyCache.set(symbol, defaultCurrency);
  return defaultCurrency;
}

/**
 * Get exchange rate from one currency to another
 */
export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) {
    return 1.0;
  }

  try {
    // Use a free exchange rate API (e.g., exchangerate-api.com or fixer.io)
    // For now, using a simple approach with exchangerate-api.com (free tier)
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`
    );

    if (!response.ok) {
      console.warn(`Failed to fetch exchange rate for ${fromCurrency} to ${toCurrency}, using 1.0`);
      return 1.0;
    }

    const data = await response.json() as any;
    const rate = data.rates?.[toCurrency];
    
    if (rate) {
      return rate;
    }

    console.warn(`Exchange rate not found for ${fromCurrency} to ${toCurrency}, using 1.0`);
    return 1.0;
  } catch (error) {
    console.error(`Error fetching exchange rate:`, error);
    return 1.0;
  }
}

/**
 * Batch lookup currencies for multiple symbols
 */
export async function getCurrenciesForSymbols(
  symbols: Array<{ symbol: string; currency?: string }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  
  // Process in parallel with rate limiting
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(async ({ symbol, currency }) => {
      const detectedCurrency = await getCurrencyForSymbol(symbol, currency);
      return { symbol, currency: detectedCurrency };
    });
    
    const results = await Promise.all(promises);
    results.forEach(({ symbol, currency }) => {
      result.set(symbol, currency);
    });
    
    // Small delay to avoid rate limiting
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return result;
}

