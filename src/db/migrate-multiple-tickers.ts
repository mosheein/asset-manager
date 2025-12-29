/**
 * Migration script to add alternative_tickers column to target_allocations table
 * This allows storing multiple ticker symbols for the same ISIN (e.g., B26A, CEBE for IE000WA6L436)
 */
import { getDatabase } from './database';

function migrateMultipleTickers() {
  const db = getDatabase();
  console.log('Migrating target_allocations table to add alternative_tickers column...');

  try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(target_allocations)").all() as Array<{ name: string }>;
    const hasAltTickersColumn = tableInfo.some(col => col.name === 'alternative_tickers');

    if (hasAltTickersColumn) {
      console.log('alternative_tickers column already exists, skipping migration.');
      return;
    }

    // Add alternative_tickers column (JSON array of ticker strings)
    db.exec(`
      ALTER TABLE target_allocations ADD COLUMN alternative_tickers TEXT
    `);

    console.log('Successfully added alternative_tickers column to target_allocations table.');
  } catch (error: any) {
    if (error.message.includes('duplicate column')) {
      console.log('alternative_tickers column already exists.');
    } else {
      console.error('Error migrating alternative_tickers column:', error);
      throw error;
    }
  }
}

migrateMultipleTickers();

