import { getDatabase } from './database';

console.log('Migrating database schema...');
const db = getDatabase();

try {
  // Check if asset_type column exists in target_history
  const tableInfo = db.prepare("PRAGMA table_info(target_history)").all() as Array<{ name: string }>;
  const hasAssetType = tableInfo.some(col => col.name === 'asset_type');
  
  if (!hasAssetType) {
    console.log('Adding asset_type and asset_category columns to target_history...');
    
    // SQLite doesn't support ALTER TABLE ADD COLUMN with multiple columns in one statement
    // So we need to do them separately
    db.exec(`
      ALTER TABLE target_history 
      ADD COLUMN asset_type TEXT
    `);
    
    db.exec(`
      ALTER TABLE target_history 
      ADD COLUMN asset_category TEXT
    `);
    
    console.log('Migration completed successfully!');
  } else {
    console.log('Database schema is already up to date.');
  }
} catch (error: any) {
  console.error('Migration error:', error.message);
  process.exit(1);
}

process.exit(0);

