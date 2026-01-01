import { Holding, TargetAllocation } from '../db/schema';

export interface RebalancingAction {
  symbol: string;
  action: 'BUY' | 'SELL' | 'OK';
  quantity: number;
  amount: number;
  currentAllocation: number;
  targetAllocation: number;
  deviation: number;
  status: 'needs_buy' | 'needs_sell' | 'balanced';
}

export interface AssetStatus {
  symbol: string;
  currentAllocation: number;
  targetAllocation: number;
  deviation: number;
  status: 'needs_buy' | 'needs_sell' | 'balanced';
  currentValue: number;
  targetValue: number;
  adjustmentNeeded: number;
  mappedTargetSymbol?: string; // If this holding is mapped to a target symbol
  assetType?: string; // Asset type for grouping in pie charts
}

export interface RebalancingPlan {
  actions: RebalancingAction[];
  allAssets: AssetStatus[];
  totalValue: number;
  totalBuy: number;
  totalSell: number;
  netCashNeeded: number;
}

export function calculateRebalancing(
  holdings: Holding[],
  targets: TargetAllocation[],
  totalValue: number,
  tolerance: number = 0.01, // 1% tolerance
  symbolMappings?: Map<string, string> // Map of holding_symbol -> target_symbol
): RebalancingPlan {
  // Build target allocation map - prioritize ticker-level targets, fallback to category-level
  const tickerTargetMap = new Map<string, number>(); // symbol -> target %
  const categoryTargetMap = new Map<string, number>(); // asset_type|category -> target %
  
  for (const target of targets) {
    if (target.symbol) {
      // Ticker-level target - map primary symbol
      tickerTargetMap.set(target.symbol.toUpperCase(), target.target_percentage);
      
      // Also map alternative tickers
      let alternativeTickers: string[] = [];
      if (target.alternative_tickers) {
        if (typeof target.alternative_tickers === 'string') {
          try {
            alternativeTickers = JSON.parse(target.alternative_tickers);
          } catch (e) {
            alternativeTickers = [target.alternative_tickers];
          }
        } else if (Array.isArray(target.alternative_tickers)) {
          alternativeTickers = target.alternative_tickers;
        }
      }
      
      for (const altTicker of alternativeTickers) {
        if (altTicker) {
          tickerTargetMap.set(String(altTicker).toUpperCase(), target.target_percentage);
        }
      }
    } else {
      // Category-level target
      const key = `${target.asset_type}|${target.asset_category || ''}`;
      categoryTargetMap.set(key, target.target_percentage);
    }
  }

  // Calculate current allocations per ticker
  // Use mapped target symbol if mapping exists, otherwise use holding symbol
  // EXCLUDE CASH from rebalancing calculations - it's not an asset to rebalance
  const tickerAllocations = new Map<string, { holding: Holding; allocation: number; mappedSymbol?: string }>();
  for (const holding of holdings) {
    // Skip CASH holdings - they shouldn't be part of rebalancing
    if (holding.symbol.toUpperCase() === 'CASH') {
      continue;
    }
    
    const allocation = (holding.value_usd / totalValue) * 100;
    const holdingSymbol = holding.symbol.toUpperCase();
    const mappedSymbol = symbolMappings?.get(holdingSymbol);
    const keySymbol = mappedSymbol || holdingSymbol;
    
    // If already exists, aggregate
    const existing = tickerAllocations.get(keySymbol);
    if (existing) {
      existing.allocation += allocation;
    } else {
      tickerAllocations.set(keySymbol, { 
        holding, 
        allocation,
        mappedSymbol: mappedSymbol || undefined
      });
    }
  }

  // Calculate deviations and required adjustments per ticker
  const actions: RebalancingAction[] = [];
  const allAssets: AssetStatus[] = [];
  let totalBuy = 0;
  let totalSell = 0;

  for (const [symbol, { holding, allocation: currentPct, mappedSymbol }] of tickerAllocations) {
    // Get target - use mapped symbol if available, otherwise use holding symbol
    const targetSymbol = mappedSymbol || symbol;
    let targetPct = tickerTargetMap.get(targetSymbol);
    
    // Also check if the holding symbol itself matches (in case mapping wasn't used)
    if (targetPct === undefined) {
      targetPct = tickerTargetMap.get(holding.symbol.toUpperCase());
    }
    
    // Track whether we found any target (ticker or category)
    let hasAnyTarget = targetPct !== undefined;
    
    if (targetPct === undefined) {
      // Fallback to category-level target
      const categoryKey = `${holding.asset_type}|${holding.asset_category || ''}`;
      targetPct = categoryTargetMap.get(categoryKey);
      if (targetPct !== undefined) {
        hasAnyTarget = true;
      } else {
        targetPct = 0; // No target at all
      }
    }

    const currentValue = holding.value_usd;
    const targetValue = (targetPct / 100) * totalValue;
    const deviation = currentPct - targetPct;
    const adjustmentNeeded = targetValue - currentValue;
    
    // Determine status
    // Only show "needs_sell" if there's truly NO target (not even category-level)
    // If targetPct is 0 but it came from a target (category or ticker), it's still a valid target (just set to 0%)
    let status: 'needs_buy' | 'needs_sell' | 'balanced';
    if (!hasAnyTarget && targetPct === 0 && currentPct > 0) {
      // Truly no target set and we have holdings - needs to be sold
      status = 'needs_sell';
    } else if (targetPct === 0 && currentPct === 0) {
      // No target and no holdings - balanced
      status = 'balanced';
    } else if (Math.abs(deviation) <= tolerance) {
      status = 'balanced';
    } else if (deviation < 0) {
      status = 'needs_buy';
    } else {
      status = 'needs_sell';
    }

    // Add to all assets list
    allAssets.push({
      symbol: holding.symbol,
      currentAllocation: currentPct,
      targetAllocation: targetPct,
      deviation,
      status,
      currentValue,
      targetValue,
      adjustmentNeeded,
      mappedTargetSymbol: mappedSymbol, // Indicate if this is mapped
      assetType: holding.asset_type, // Include asset type for pie chart
    });

    // Create action if:
    // 1. Target is defined and deviation exceeds tolerance, OR
    // 2. Truly no target is set (not even category-level) but we have holdings (needs to be sold)
    if ((targetPct > 0 && Math.abs(deviation) > tolerance) || (!hasAnyTarget && targetPct === 0 && currentPct > 0)) {
      if (!hasAnyTarget && targetPct === 0 && currentPct > 0) {
        // Truly no target set - sell all holdings
        const sellAmount = currentValue;
        totalSell += sellAmount;
        const actionQuantity = sellAmount / holding.price;

        actions.push({
          symbol: holding.symbol,
          action: 'SELL',
          quantity: actionQuantity,
          amount: sellAmount,
          currentAllocation: currentPct,
          targetAllocation: targetPct,
          deviation: currentPct, // Full current allocation is deviation
          status: 'needs_sell',
        });
      } else if (adjustmentNeeded > 0) {
        // Need to buy
        totalBuy += adjustmentNeeded;
        const actionQuantity = adjustmentNeeded / holding.price;

        actions.push({
          symbol: holding.symbol,
          action: 'BUY',
          quantity: actionQuantity,
          amount: adjustmentNeeded,
          currentAllocation: currentPct,
          targetAllocation: targetPct,
          deviation: -deviation, // Negative because we're below target
          status: 'needs_buy',
        });
      } else {
        // Need to sell
        const sellAmount = Math.abs(adjustmentNeeded);
        totalSell += sellAmount;
        const actionQuantity = sellAmount / holding.price;

        actions.push({
          symbol: holding.symbol,
          action: 'SELL',
          quantity: actionQuantity,
          amount: sellAmount,
          currentAllocation: currentPct,
          targetAllocation: targetPct,
          deviation: deviation, // Positive because we're above target
          status: 'needs_sell',
        });
      }
    }
  }

  return {
    actions: actions.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation)),
    allAssets: allAssets.sort((a, b) => {
      // Sort by status priority: needs_buy, needs_sell, balanced
      const statusOrder = { needs_buy: 0, needs_sell: 1, balanced: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      // Then by absolute deviation
      return Math.abs(b.deviation) - Math.abs(a.deviation);
    }),
    totalValue,
    totalBuy,
    totalSell,
    netCashNeeded: totalBuy - totalSell,
  };
}

