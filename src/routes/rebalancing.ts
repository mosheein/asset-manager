import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database';
import { calculateRebalancing } from '../services/rebalancing';
import { Holding, TargetAllocation } from '../db/schema';

const router = Router();

// Get rebalancing suggestions
router.get('/', (req: Request, res: Response) => {
  try {
    const { tolerance, account_id } = req.query;
    const toleranceValue = tolerance ? parseFloat(tolerance as string) : 0.01;

    const db = getDatabase();

    // Get latest holdings (optionally filtered by account)
    let holdings: Holding[];
    if (account_id) {
      holdings = db.prepare(`
        SELECT h.* 
        FROM holdings h
        INNER JOIN (
          SELECT account_id, MAX(statement_date) as max_date
          FROM holdings
          WHERE account_id = ?
          GROUP BY account_id
        ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
        WHERE h.account_id = ?
      `).all(account_id, account_id) as Holding[];
    } else {
      holdings = db.prepare(`
        SELECT h.* 
        FROM holdings h
        INNER JOIN (
          SELECT account_id, MAX(statement_date) as max_date
          FROM holdings
          GROUP BY account_id
        ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
      `).all() as Holding[];
    }

    // Get target allocations
    const targets = db.prepare('SELECT * FROM target_allocations').all() as TargetAllocation[];

    if (targets.length === 0) {
      return res.json({
        message: 'No target allocations configured',
        actions: [],
        allAssets: [],
        totalValue: 0,
        totalBuy: 0,
        totalSell: 0,
        netCashNeeded: 0,
      });
    }

    // Get symbol mappings for account(s)
    const symbolMappings = new Map<string, string>(); // holding_symbol -> target_symbol
    if (account_id) {
      const mappings = db.prepare(`
        SELECT sm.holding_symbol, ta.symbol as target_symbol
        FROM symbol_mappings sm
        JOIN target_allocations ta ON sm.target_id = ta.id
        WHERE sm.account_id = ?
      `).all(account_id) as Array<{ holding_symbol: string; target_symbol: string | null }>;
      
      for (const mapping of mappings) {
        if (mapping.target_symbol) {
          symbolMappings.set(mapping.holding_symbol.toUpperCase(), mapping.target_symbol.toUpperCase());
        }
      }
    } else {
      // Get mappings for all accounts
      const mappings = db.prepare(`
        SELECT sm.holding_symbol, ta.symbol as target_symbol
        FROM symbol_mappings sm
        JOIN target_allocations ta ON sm.target_id = ta.id
      `).all() as Array<{ holding_symbol: string; target_symbol: string | null }>;
      
      for (const mapping of mappings) {
        if (mapping.target_symbol) {
          symbolMappings.set(mapping.holding_symbol.toUpperCase(), mapping.target_symbol.toUpperCase());
        }
      }
    }

    // Calculate total portfolio value
    const totalValue = holdings.reduce((sum, h) => sum + h.value_usd, 0);

    // Calculate rebalancing plan
    const plan = calculateRebalancing(holdings, targets, totalValue, toleranceValue, symbolMappings);

    res.json(plan);
  } catch (error: any) {
    console.error('Error calculating rebalancing:', error);
    res.status(500).json({ error: `Failed to calculate rebalancing: ${error.message}` });
  }
});

export default router;

