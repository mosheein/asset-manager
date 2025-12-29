/**
 * Service to match holdings to targets and determine asset types
 */
import { Holding, TargetAllocation } from '../db/schema';
import { getDatabase } from '../db/database';

export interface MatchedHolding extends Holding {
  matchedTargetId?: number;
  matchType?: 'exact_symbol' | 'exact_isin' | 'category' | 'none';
  suggestedAssetType?: string;
}

export interface UnmatchedHolding {
  holding: Holding;
  suggestedMatches: Array<{
    target: TargetAllocation;
    matchScore: number;
    matchReason: string;
  }>;
  suggestedAssetType?: string;
}

/**
 * Match holdings to targets and determine asset types
 */
export function matchHoldingsToTargets(
  holdings: Holding[],
  targets: TargetAllocation[]
): {
  matched: MatchedHolding[];
  unmatched: UnmatchedHolding[];
} {
  const matched: MatchedHolding[] = [];
  const unmatched: UnmatchedHolding[] = [];

  // Build lookup maps for targets
  const targetsBySymbol = new Map<string, TargetAllocation>();
  const targetsByIsin = new Map<string, TargetAllocation>();
  const targetsByCategory = new Map<string, TargetAllocation[]>();

  for (const target of targets) {
    // Parse alternative_tickers if it's a JSON string
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
    
    // Map primary symbol
    if (target.symbol) {
      targetsBySymbol.set(target.symbol.toUpperCase(), target);
    }
    
    // Map alternative tickers
    for (const altTicker of alternativeTickers) {
      if (altTicker) {
        targetsBySymbol.set(String(altTicker).toUpperCase(), target);
      }
    }
    
    if (target.isin) {
      targetsByIsin.set(target.isin.toUpperCase(), target);
    }
    
    // Category-level targets (no symbol)
    if (!target.symbol && alternativeTickers.length === 0) {
      const key = `${target.asset_type}|${target.asset_category || ''}`;
      if (!targetsByCategory.has(key)) {
        targetsByCategory.set(key, []);
      }
      targetsByCategory.get(key)!.push(target);
    }
  }

  for (const holding of holdings) {
    let matchedTarget: TargetAllocation | undefined;
    let matchType: MatchedHolding['matchType'] = 'none';

    // Try exact symbol match first
    if (holding.symbol) {
      matchedTarget = targetsBySymbol.get(holding.symbol.toUpperCase());
      if (matchedTarget) {
        matchType = 'exact_symbol';
      }
    }

    // Try exact ISIN match
    if (!matchedTarget && holding.isin) {
      matchedTarget = targetsByIsin.get(holding.isin.toUpperCase());
      if (matchedTarget) {
        matchType = 'exact_isin';
      }
    }

    // Try category match (fallback)
    if (!matchedTarget) {
      const categoryKey = `${holding.asset_type}|${holding.asset_category || ''}`;
      const categoryTargets = targetsByCategory.get(categoryKey);
      if (categoryTargets && categoryTargets.length > 0) {
        // Use first matching category target
        matchedTarget = categoryTargets[0];
        matchType = 'category';
      }
    }

    if (matchedTarget) {
      // Update holding with asset type from target
      matched.push({
        ...holding,
        asset_type: matchedTarget.asset_type,
        asset_category: matchedTarget.asset_category || holding.asset_category,
        matchedTargetId: matchedTarget.id,
        matchType,
      });
    } else {
      // Find suggested matches
      const suggestedMatches = findSuggestedMatches(holding, targets);
      const suggestedAssetType = inferAssetType(holding);
      
      unmatched.push({
        holding,
        suggestedMatches,
        suggestedAssetType,
      });
    }
  }

  return { matched, unmatched };
}

/**
 * Find suggested target matches for an unmatched holding
 */
function findSuggestedMatches(
  holding: Holding,
  targets: TargetAllocation[]
): UnmatchedHolding['suggestedMatches'] {
  const suggestions: UnmatchedHolding['suggestedMatches'] = [];

  for (const target of targets) {
    let score = 0;
    let reason = '';

    // Symbol similarity
    if (holding.symbol && target.symbol) {
      const holdingSym = holding.symbol.toUpperCase();
      const targetSym = target.symbol.toUpperCase();
      if (holdingSym === targetSym) {
        score += 100;
        reason = 'Exact symbol match';
      } else if (holdingSym.includes(targetSym) || targetSym.includes(holdingSym)) {
        score += 50;
        reason = 'Partial symbol match';
      }
    }

    // ISIN match
    if (holding.isin && target.isin) {
      if (holding.isin.toUpperCase() === target.isin.toUpperCase()) {
        score += 100;
        reason = 'Exact ISIN match';
      }
    }

    // Asset category match
    if (holding.asset_category && target.asset_category) {
      if (holding.asset_category.toLowerCase() === target.asset_category.toLowerCase()) {
        score += 30;
        reason = reason ? reason + ', category match' : 'Category match';
      }
    }

    if (score > 0) {
      suggestions.push({ target, matchScore: score, matchReason: reason });
    }
  }

  // Sort by score descending
  suggestions.sort((a, b) => b.matchScore - a.matchScore);
  
  return suggestions.slice(0, 5); // Return top 5 suggestions
}

/**
 * Infer asset type from holding (fallback when no target match)
 */
function inferAssetType(holding: Holding): string {
  const symbol = holding.symbol.toUpperCase();
  const category = (holding.asset_category || '').toLowerCase();

  // Check for crypto
  if (symbol.includes('BTC') || symbol.includes('ETH') || symbol === 'COIN' || symbol === 'GBTC') {
    return 'Crypto';
  }

  // Check for bonds
  if (symbol.includes('BND') || symbol.includes('TIP') || symbol.includes('AGG') || 
      category.includes('bond')) {
    return 'Bond';
  }

  // Check for REITs
  if (symbol.includes('REIT') || symbol.includes('VNQ') || symbol.includes('REET') || 
      category.includes('reit') || category.includes('real estate')) {
    return 'REIT';
  }

  // Check for commodities
  if (symbol.includes('GLD') || symbol.includes('SLV') || symbol.includes('USAG') || 
      category.includes('commodity') || category.includes('gold') || category.includes('silver')) {
    return 'Commodity';
  }

  // Check for cash/money market
  if (category.includes('cash') || category.includes('money market') || 
      symbol.includes('SGOV') || symbol.includes('CSH')) {
    return 'Cash';
  }

  // Default to stock
  return 'Stock';
}

/**
 * Update holdings with asset types from targets
 */
export function updateHoldingsWithTargetTypes(
  holdings: Holding[],
  accountId: number,
  statementDate: string
): { updated: number; unmatched: number } {
  const db = getDatabase();
  
  // Get all targets
  const targets = db.prepare('SELECT * FROM target_allocations').all() as TargetAllocation[];
  
  // Match holdings to targets
  const { matched, unmatched } = matchHoldingsToTargets(holdings, targets);
  
  // Update matched holdings
  const updateStmt = db.prepare(`
    UPDATE holdings 
    SET asset_type = ?, asset_category = ?
    WHERE account_id = ? AND symbol = ? AND statement_date = ?
  `);
  
  let updated = 0;
  for (const holding of matched) {
    updateStmt.run(
      holding.asset_type,
      holding.asset_category || null,
      accountId,
      holding.symbol,
      statementDate
    );
    updated++;
  }
  
  // For unmatched holdings, use suggested asset type
  const updateUnmatchedStmt = db.prepare(`
    UPDATE holdings 
    SET asset_type = ?
    WHERE account_id = ? AND symbol = ? AND statement_date = ?
  `);
  
  for (const { holding, suggestedAssetType } of unmatched) {
    if (suggestedAssetType) {
      updateUnmatchedStmt.run(
        suggestedAssetType,
        accountId,
        holding.symbol,
        statementDate
      );
    }
  }
  
  return { updated, unmatched: unmatched.length };
}

