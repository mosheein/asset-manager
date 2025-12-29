import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database';
import { Holding } from '../db/schema';

const router = Router();

// Get all holdings (optionally filtered by account and date)
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { account_id, statement_date } = req.query;

    let query = 'SELECT * FROM holdings WHERE 1=1';
    const params: any[] = [];

    if (account_id) {
      query += ' AND account_id = ?';
      params.push(account_id);
    }

    if (statement_date) {
      query += ' AND statement_date = ?';
      params.push(statement_date);
    }

    query += ' ORDER BY statement_date DESC, value_usd DESC';

    const holdings = db.prepare(query).all(...params) as Holding[];
    res.json(holdings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

// Get latest holdings for all accounts (optionally filtered by account)
router.get('/latest', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { account_id } = req.query;
    
    if (account_id) {
      // Filter by specific account
      const holdings = db.prepare(`
        SELECT h.* 
        FROM holdings h
        INNER JOIN (
          SELECT account_id, MAX(statement_date) as max_date
          FROM holdings
          WHERE account_id = ?
          GROUP BY account_id
        ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
        WHERE h.account_id = ?
        ORDER BY h.value_usd DESC
      `).all(account_id, account_id) as Holding[];
      res.json(holdings);
    } else {
      // Get all accounts
      const holdings = db.prepare(`
        SELECT h.* 
        FROM holdings h
        INNER JOIN (
          SELECT account_id, MAX(statement_date) as max_date
          FROM holdings
          GROUP BY account_id
        ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
        ORDER BY h.value_usd DESC
      `).all() as Holding[];
      res.json(holdings);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest holdings' });
  }
});

// Get portfolio summary (aggregated by asset type, optionally filtered by account)
router.get('/summary', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { account_id } = req.query;
    
    if (account_id) {
      // Filter by specific account
      const summary = db.prepare(`
        SELECT 
          asset_type,
          asset_category,
          SUM(value_usd) as total_value_usd,
          SUM(value_base) as total_value_base,
          COUNT(*) as holding_count
        FROM holdings h
        INNER JOIN (
          SELECT account_id, MAX(statement_date) as max_date
          FROM holdings
          WHERE account_id = ?
          GROUP BY account_id
        ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
        WHERE h.account_id = ?
        GROUP BY asset_type, asset_category
        ORDER BY total_value_usd DESC
      `).all(account_id, account_id);
      res.json(summary);
    } else {
      // Get all accounts
      const summary = db.prepare(`
        SELECT 
          asset_type,
          asset_category,
          SUM(value_usd) as total_value_usd,
          SUM(value_base) as total_value_base,
          COUNT(*) as holding_count
        FROM holdings h
        INNER JOIN (
          SELECT account_id, MAX(statement_date) as max_date
          FROM holdings
          GROUP BY account_id
        ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
        GROUP BY asset_type, asset_category
        ORDER BY total_value_usd DESC
      `).all();
      res.json(summary);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch portfolio summary' });
  }
});

export default router;

