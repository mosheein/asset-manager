/**
 * Service to lookup ticker symbols from ISIN or other identifiers
 */
import axios from 'axios';

export interface TickerLookupResult {
  ticker: string;
  exchange?: string;
  name?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ISINLookupResult {
  tickers: TickerLookupResult[];
  isin: string;
  name?: string;
  primaryTicker?: string; // The main/primary ticker (usually the most liquid or main exchange)
}

const tickerCache = new Map<string, ISINLookupResult>();
const nameCache = new Map<string, string>(); // Cache for ticker/ISIN -> name lookups
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Lookup ticker(s) from ISIN
 */
export async function lookupTickerFromISIN(isin: string): Promise<ISINLookupResult | null> {
  // Check cache first
  const cached = tickerCache.get(isin);
  if (cached) {
    return cached;
  }

  try {
    // Try multiple sources
    const results = await Promise.allSettled([
      lookupFromYahooFinance(isin),
      lookupFromOpenFIGI(isin),
      lookupFromISINOrg(isin),
    ]);

    // Find first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        tickerCache.set(isin, result.value);
        return result.value;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error looking up ticker for ISIN ${isin}:`, error);
    return null;
  }
}

/**
 * Lookup from Yahoo Finance (via yahoo-finance2 or similar)
 */
async function lookupFromYahooFinance(isin: string): Promise<ISINLookupResult | null> {
  try {
    // Yahoo Finance doesn't have a direct ISIN lookup, but we can try searching
    // For now, we'll use a different approach - try to find by ISIN in quote search
    const response = await axios.get(`https://query1.finance.yahoo.com/v1/finance/search`, {
      params: {
        q: isin,
        quotesCount: 5,
        newsCount: 0,
      },
      timeout: 5000,
    });

    if (response.data && response.data.quotes) {
      const quotes = response.data.quotes;
      const tickers: TickerLookupResult[] = quotes
        .filter((q: any) => q.symbol && q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
        .map((q: any) => ({
          ticker: q.symbol,
          exchange: q.exchange,
          name: q.longname || q.shortname,
          confidence: 'medium' as const,
        }));

      if (tickers.length > 0) {
        // Determine primary ticker (prefer US exchanges, then first one)
        const primaryTicker = tickers.find(t => 
          t.exchange === 'NYQ' || t.exchange === 'NMS' || t.exchange === 'NAS'
        )?.ticker || tickers[0].ticker;
        
        return {
          tickers,
          isin,
          name: quotes[0]?.longname || quotes[0]?.shortname,
          primaryTicker,
        };
      }
    }
  } catch (error) {
    // Yahoo Finance might be rate-limited or blocked
    console.warn(`Yahoo Finance lookup failed for ISIN ${isin}:`, (error as any).message);
  }
  return null;
}

/**
 * Lookup from OpenFIGI (Bloomberg's free API)
 */
async function lookupFromOpenFIGI(isin: string): Promise<ISINLookupResult | null> {
  try {
    const response = await axios.post(
      'https://api.openfigi.com/v3/mapping',
      [{
        idType: 'ID_ISIN',
        idValue: isin,
      }],
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    if (response.data && response.data[0] && response.data[0].data) {
      const data = response.data[0].data;
      const tickers: TickerLookupResult[] = data
        .filter((item: any) => item.ticker)
        .map((item: any) => ({
          ticker: item.ticker,
          exchange: item.exchangeCode,
          name: item.name,
          confidence: 'high' as const,
        }));

      if (tickers.length > 0) {
        // Determine primary ticker (prefer main exchange, usually first one from OpenFIGI)
        const primaryTicker = tickers[0].ticker;
        
        return {
          tickers,
          isin,
          name: data[0]?.name,
          primaryTicker,
        };
      }
    }
  } catch (error) {
    console.warn(`OpenFIGI lookup failed for ISIN ${isin}:`, (error as any).message);
  }
  return null;
}

/**
 * Lookup from ISIN.org or other free sources
 */
async function lookupFromISINOrg(isin: string): Promise<ISINLookupResult | null> {
  // ISIN.org doesn't have a free API, but we can try other sources
  // For now, return null - can be extended later
  return null;
}

/**
 * Lookup ticker from instrument name (fallback)
 */
export async function lookupTickerFromName(instrumentName: string): Promise<TickerLookupResult[] | null> {
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v1/finance/search`, {
      params: {
        q: instrumentName,
        quotesCount: 10,
        newsCount: 0,
      },
      timeout: 5000,
    });

    if (response.data && response.data.quotes) {
      const quotes = response.data.quotes;
      return quotes
        .filter((q: any) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
        .map((q: any) => ({
          ticker: q.symbol,
          exchange: q.exchange,
          name: q.longname || q.shortname,
          confidence: 'low' as const,
        }));
    }
  } catch (error) {
    console.warn(`Name lookup failed for ${instrumentName}:`, (error as any).message);
  }
  return null;
}

/**
 * Get best ticker from lookup results (prefer highest confidence, US exchanges)
 */
export function getBestTicker(lookupResult: ISINLookupResult): string | null {
  if (!lookupResult.tickers || lookupResult.tickers.length === 0) {
    return null;
  }

  // Use primary ticker if specified
  if (lookupResult.primaryTicker) {
    return lookupResult.primaryTicker;
  }

  // Prefer high confidence
  const highConfidence = lookupResult.tickers.filter(t => t.confidence === 'high');
  if (highConfidence.length > 0) {
    // Prefer US exchanges (NYSE, NASDAQ)
    const usTicker = highConfidence.find(t => 
      t.exchange === 'NYQ' || t.exchange === 'NMS' || t.exchange === 'NAS'
    );
    if (usTicker) return usTicker.ticker;
    return highConfidence[0].ticker;
  }

  // Fallback to medium confidence
  const mediumConfidence = lookupResult.tickers.filter(t => t.confidence === 'medium');
  if (mediumConfidence.length > 0) {
    return mediumConfidence[0].ticker;
  }

  // Last resort: low confidence
  return lookupResult.tickers[0].ticker;
}

/**
 * Get all tickers (primary + alternatives) from lookup results
 */
export function getAllTickers(lookupResult: ISINLookupResult): string[] {
  if (!lookupResult.tickers || lookupResult.tickers.length === 0) {
    return [];
  }
  
  const allTickers = lookupResult.tickers.map(t => t.ticker);
  // Remove duplicates
  return Array.from(new Set(allTickers));
}

/**
 * Lookup asset name from ticker symbol
 */
export async function lookupNameFromTicker(ticker: string): Promise<string | null> {
  // Check cache first
  const cacheKey = `TICKER:${ticker.toUpperCase()}`;
  if (nameCache.has(cacheKey)) {
    return nameCache.get(cacheKey) || null;
  }

  try {
    // Try Yahoo Finance search
    const response = await axios.get(`https://query1.finance.yahoo.com/v1/finance/search`, {
      params: {
        q: ticker,
        quotesCount: 5,
        newsCount: 0,
      },
      timeout: 5000,
    });

    if (response.data && response.data.quotes) {
      const quotes = response.data.quotes;
      // Find exact ticker match (case-insensitive)
      const exactMatch = quotes.find((q: any) => 
        q.symbol && q.symbol.toUpperCase() === ticker.toUpperCase() &&
        (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND')
      );
      
      if (exactMatch) {
        const name = exactMatch.longname || exactMatch.shortname;
        if (name) {
          nameCache.set(cacheKey, name);
          return name;
        }
      }
      
      // Fallback to first match
      const firstMatch = quotes.find((q: any) => 
        q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND')
      );
      if (firstMatch) {
        const name = firstMatch.longname || firstMatch.shortname;
        if (name) {
          nameCache.set(cacheKey, name);
          return name;
        }
      }
    }
  } catch (error) {
    console.warn(`Name lookup failed for ticker ${ticker}:`, (error as any).message);
  }
  
  return null;
}

/**
 * Lookup asset name from ISIN (returns name directly)
 */
export async function lookupNameFromISIN(isin: string): Promise<string | null> {
  // Check cache first
  const cacheKey = `ISIN:${isin.toUpperCase()}`;
  if (nameCache.has(cacheKey)) {
    return nameCache.get(cacheKey) || null;
  }

  try {
    const lookupResult = await lookupTickerFromISIN(isin);
    if (lookupResult && lookupResult.name) {
      nameCache.set(cacheKey, lookupResult.name);
      return lookupResult.name;
    }
    
    // Try to get name from first ticker result
    if (lookupResult && lookupResult.tickers && lookupResult.tickers.length > 0) {
      const firstTicker = lookupResult.tickers[0];
      if (firstTicker.name) {
        nameCache.set(cacheKey, firstTicker.name);
        return firstTicker.name;
      }
    }
  } catch (error) {
    console.warn(`Name lookup from ISIN failed for ${isin}:`, (error as any).message);
  }
  
  return null;
}

