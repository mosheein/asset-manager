/**
 * Migration script to add symbol column to target_allocations table
 */
import { getDatabase } from './database';

function migrateTickerTargets() {
  const db = getDatabase();
  console.log('Migrating target_allocations table to add symbol column...');

  try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(target_allocations)").all() as Array<{ name: string }>;
    const hasSymbolColumn = tableInfo.some(col => col.name === 'symbol');

    if (hasSymbolColumn) {
      console.log('Symbol column already exists, skipping migration.');
      return;
    }

    // Add symbol column
    db.exec(`
      ALTER TABLE target_allocations ADD COLUMN symbol TEXT
    `);

    // Update unique constraint to include symbol
    // SQLite doesn't support ALTER TABLE to modify constraints, so we need to recreate
    db.exec(`
      CREATE TABLE IF NOT EXISTS target_allocations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_type TEXT NOT NULL,
        asset_category TEXT,
        symbol TEXT,
        target_percentage REAL NOT NULL,
        bucket TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(asset_type, asset_category, symbol, bucket)
      )
    `);

    // Copy data
    db.exec(`
      INSERT INTO target_allocations_new 
      (id, asset_type, asset_category, symbol, target_percentage, bucket, created_at, updated_at)
      SELECT id, asset_type, asset_category, NULL, target_percentage, bucket, created_at, updated_at
      FROM target_allocations
    `);

    // Disable foreign keys temporarily
    db.exec(`PRAGMA foreign_keys = OFF`);
    
    // Drop old table and rename new one
    db.exec(`DROP TABLE target_allocations`);
    db.exec(`ALTER TABLE target_allocations_new RENAME TO target_allocations`);
    
    // Re-enable foreign keys
    db.exec(`PRAGMA foreign_keys = ON`);

    console.log('Successfully added symbol column to target_allocations table.');
  } catch (error: any) {
    if (error.message.includes('duplicate column')) {
      console.log('Symbol column already exists.');
    } else {
      console.error('Error migrating symbol column:', error);
      throw error;
    }
  }
}

migrateTickerTargets();

