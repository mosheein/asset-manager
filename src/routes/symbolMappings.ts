import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database';

const router = Router();

// Create or update symbol mapping
router.post('/', (req: Request, res: Response) => {
  try {
    const { account_id, holding_symbol, target_id, match_type } = req.body;

    if (!account_id || !holding_symbol) {
      return res.status(400).json({ error: 'account_id and holding_symbol are required' });
    }

    // If target_id is null/undefined, we're clearing the mapping
    // If target_id is provided, match_type should also be provided
    if (target_id !== null && target_id !== undefined && !match_type) {
      return res.status(400).json({ error: 'match_type is required when target_id is provided' });
    }

    const db = getDatabase();
    
    // Check if mapping already exists
    const existing = db.prepare(`
      SELECT id FROM symbol_mappings 
      WHERE account_id = ? AND holding_symbol = ?
    `).get(account_id, holding_symbol) as { id: number } | undefined;

    if (target_id === null || target_id === undefined) {
      // Clear the mapping
      if (existing) {
        db.prepare('DELETE FROM symbol_mappings WHERE id = ?').run(existing.id);
      }
      res.json({ message: 'Symbol mapping cleared successfully' });
    } else {
      // Validate target_id exists
      const target = db.prepare('SELECT id FROM target_allocations WHERE id = ?').get(target_id) as { id: number } | undefined;
      if (!target) {
        return res.status(400).json({ error: 'Invalid target_id' });
      }

      if (existing) {
        // Update existing mapping
        db.prepare(`
          UPDATE symbol_mappings 
          SET target_id = ?, match_type = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(target_id, match_type || null, existing.id);
      } else {
        // Create new mapping
        db.prepare(`
          INSERT INTO symbol_mappings (account_id, holding_symbol, target_id, match_type)
          VALUES (?, ?, ?, ?)
        `).run(account_id, holding_symbol, target_id, match_type || null);
      }

      res.json({ message: 'Symbol mapping saved successfully' });
    }
  } catch (error: any) {
    console.error('Error saving symbol mapping:', error);
    res.status(500).json({ error: 'Failed to save symbol mapping' });
  }
});

// Get all mappings for an account
router.get('/', (req: Request, res: Response) => {
  try {
    const { account_id } = req.query;

    if (!account_id) {
      return res.status(400).json({ error: 'account_id is required' });
    }

    const db = getDatabase();
    const mappings = db.prepare(`
      SELECT sm.*, ta.symbol as target_symbol, ta.asset_type, ta.asset_category, ta.isin as target_isin
      FROM symbol_mappings sm
      JOIN target_allocations ta ON sm.target_id = ta.id
      WHERE sm.account_id = ?
      ORDER BY sm.holding_symbol
    `).all(account_id);

    res.json(mappings);
  } catch (error: any) {
    console.error('Error fetching symbol mappings:', error);
    res.status(500).json({ error: 'Failed to fetch symbol mappings' });
  }
});

// Delete a mapping
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    db.prepare('DELETE FROM symbol_mappings WHERE id = ?').run(id);
    
    res.json({ message: 'Symbol mapping deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting symbol mapping:', error);
    res.status(500).json({ error: 'Failed to delete symbol mapping' });
  }
});

export default router;

