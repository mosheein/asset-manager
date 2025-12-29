/**
 * Migration script to add symbol_mappings table
 */
import { getDatabase } from './database';

function migrateSymbolMappings() {
  const db = getDatabase();
  console.log('Adding symbol_mappings table...');

  try {
    // Check if table already exists
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='symbol_mappings'").get();
    
    if (tableInfo) {
      console.log('symbol_mappings table already exists, skipping migration.');
      return;
    }

    // Create symbol_mappings table
    db.exec(`
      CREATE TABLE symbol_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        holding_symbol TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (target_id) REFERENCES target_allocations(id),
        UNIQUE(account_id, holding_symbol)
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_symbol_mappings_account ON symbol_mappings(account_id);
      CREATE INDEX IF NOT EXISTS idx_symbol_mappings_target ON symbol_mappings(target_id);
    `);

    console.log('Successfully created symbol_mappings table.');
  } catch (error: any) {
    console.error('Error creating symbol_mappings table:', error);
    throw error;
  }
}

migrateSymbolMappings();

