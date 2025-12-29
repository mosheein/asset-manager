import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database';

const router = Router();

// Get portfolio snapshots over time
router.get('/snapshots', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const snapshots = db.prepare(`
      SELECT * FROM portfolio_snapshots 
      ORDER BY snapshot_date DESC
      LIMIT 100
    `).all();
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// Get snapshot with allocations
router.get('/snapshots/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const snapshot = db.prepare('SELECT * FROM portfolio_snapshots WHERE id = ?')
      .get(req.params.id);
    
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }

    const allocations = db.prepare(`
      SELECT * FROM snapshot_allocations 
      WHERE snapshot_id = ?
      ORDER BY value_usd DESC
    `).all(req.params.id);

    res.json({ ...snapshot, allocations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch snapshot' });
  }
});

// Create snapshot from current holdings
router.post('/snapshots', (req: Request, res: Response) => {
  try {
    const { snapshot_date, base_currency } = req.body;
    const date = snapshot_date || new Date().toISOString().split('T')[0];

    const db = getDatabase();

    // Get latest holdings
    const holdings = db.prepare(`
      SELECT h.* 
      FROM holdings h
      INNER JOIN (
        SELECT account_id, MAX(statement_date) as max_date
        FROM holdings
        GROUP BY account_id
      ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
    `).all() as Array<{ asset_type: string; asset_category: string | null; value_usd: number; value_base: number }>;

    const totalValueUsd = holdings.reduce((sum, h) => sum + h.value_usd, 0);
    const totalValueBase = holdings.reduce((sum, h) => sum + h.value_base, 0);

    // Create snapshot
    const snapshotResult = db.prepare(`
      INSERT INTO portfolio_snapshots (snapshot_date, total_value_usd, total_value_base, base_currency)
      VALUES (?, ?, ?, ?)
    `).run(date, totalValueUsd, totalValueBase, base_currency || 'USD');

    const snapshotId = snapshotResult.lastInsertRowid;

    // Create allocations
    const allocationsByType = new Map<string, { value: number; category?: string }>();
    for (const holding of holdings) {
      const key = `${holding.asset_type}|${holding.asset_category || ''}`;
      if (!allocationsByType.has(key)) {
        allocationsByType.set(key, { value: 0, category: holding.asset_category || undefined });
      }
      const existing = allocationsByType.get(key)!;
      existing.value += holding.value_usd;
    }

    const insertAllocation = db.prepare(`
      INSERT INTO snapshot_allocations (snapshot_id, asset_type, asset_category, percentage, value_usd)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((allocations) => {
      for (const [key, data] of allocations) {
        const [assetType, assetCategory] = key.split('|');
        const percentage = (data.value / totalValueUsd) * 100;
        insertAllocation.run(
          snapshotId,
          assetType,
          assetCategory || null,
          percentage,
          data.value
        );
      }
    });

    insertMany(allocationsByType);

    const snapshot = db.prepare('SELECT * FROM portfolio_snapshots WHERE id = ?')
      .get(snapshotId);

    res.status(201).json(snapshot);
  } catch (error: any) {
    console.error('Error creating snapshot:', error);
    res.status(500).json({ error: `Failed to create snapshot: ${error.message}` });
  }
});

export default router;

