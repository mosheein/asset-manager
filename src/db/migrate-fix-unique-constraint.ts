/**
 * Migration script to fix the UNIQUE constraint on target_allocations
 * The current constraint doesn't include symbol/isin, causing duplicate targets to be skipped
 */
import { getDatabase } from './database';

function migrateFixUniqueConstraint() {
  const db = getDatabase();
  console.log('Fixing UNIQUE constraint on target_allocations table...');

  try {
    // SQLite doesn't support DROP CONSTRAINT directly
    // We need to recreate the table with the correct constraint
    
    // 0. Drop new table if it exists from a previous failed migration
    db.exec(`DROP TABLE IF EXISTS target_allocations_new`);
    
    // 1. Create new table with correct UNIQUE constraint (match column order of existing table)
    db.exec(`
      CREATE TABLE target_allocations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_type TEXT NOT NULL,
        asset_category TEXT,
        target_percentage REAL NOT NULL,
        bucket TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        symbol TEXT,
        isin TEXT,
        alternative_tickers TEXT,
        UNIQUE(asset_type, asset_category, symbol, isin, bucket)
      )
    `);
    
    // 2. Copy data from old table (match the exact column order)
    db.exec(`
      INSERT INTO target_allocations_new 
        (id, asset_type, asset_category, target_percentage, bucket, created_at, updated_at, symbol, isin, alternative_tickers)
      SELECT 
        id, asset_type, asset_category, target_percentage, bucket, created_at, updated_at, symbol, isin, alternative_tickers
      FROM target_allocations
    `);
    
    // 3. Drop old table
    db.exec(`DROP TABLE target_allocations`);
    
    // 4. Rename new table
    db.exec(`ALTER TABLE target_allocations_new RENAME TO target_allocations`);
    
    console.log('Successfully fixed UNIQUE constraint on target_allocations table.');
    console.log('The constraint now includes symbol and isin, allowing multiple targets with same asset_type/category but different symbols.');
  } catch (error: any) {
    console.error('Error fixing UNIQUE constraint:', error);
    throw error;
  }
}

migrateFixUniqueConstraint();

