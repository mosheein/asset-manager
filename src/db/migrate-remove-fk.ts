/**
 * Migration script to remove foreign key constraint from target_history
 * This allows deleting targets without breaking history records
 */
import { getDatabase } from './database';

function migrateRemoveFK() {
  const db = getDatabase();
  console.log('Removing foreign key constraint from target_history table...');

  try {
    // SQLite doesn't support DROP CONSTRAINT directly
    // We need to recreate the table without the foreign key
    
    // 1. Create new table without foreign key
    db.exec(`
      CREATE TABLE IF NOT EXISTS target_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_allocation_id INTEGER,
        target_percentage REAL NOT NULL,
        asset_type TEXT,
        asset_category TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 2. Copy data from old table
    db.exec(`
      INSERT INTO target_history_new 
      SELECT * FROM target_history
    `);
    
    // 3. Drop old table
    db.exec(`DROP TABLE target_history`);
    
    // 4. Rename new table
    db.exec(`ALTER TABLE target_history_new RENAME TO target_history`);
    
    console.log('Successfully removed foreign key constraint from target_history table.');
  } catch (error: any) {
    if (error.message.includes('no such table: target_history')) {
      console.log('target_history table does not exist, creating it without foreign key...');
      db.exec(`
        CREATE TABLE IF NOT EXISTS target_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_allocation_id INTEGER,
          target_percentage REAL NOT NULL,
          asset_type TEXT,
          asset_category TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else if (error.message.includes('already exists')) {
      console.log('Migration already applied, skipping.');
    } else {
      console.error('Error removing foreign key constraint:', error);
      throw error;
    }
  }
}

migrateRemoveFK();

