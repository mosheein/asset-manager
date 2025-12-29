import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database';
import { Account } from '../db/schema';

const router = Router();

// Get all accounts
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all() as Account[];
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Get account by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as Account;
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// Create account
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, ib_account_id, base_currency } = req.body;
    
    if (!name || !ib_account_id) {
      return res.status(400).json({ error: 'Name and IB account ID are required' });
    }

    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO accounts (name, ib_account_id, base_currency)
      VALUES (?, ?, ?)
    `).run(name, ib_account_id, base_currency || 'USD');

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid) as Account;
    res.status(201).json(account);
  } catch (error: any) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Account ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, base_currency } = req.body;
    const db = getDatabase();
    
    db.prepare(`
      UPDATE accounts 
      SET name = COALESCE(?, name), 
          base_currency = COALESCE(?, base_currency)
      WHERE id = ?
    `).run(name, base_currency, req.params.id);

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as Account;
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;

