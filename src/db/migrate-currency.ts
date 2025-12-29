/**
 * Migration script to add currency column to holdings table
 */
import { getDatabase } from './database';

function migrateCurrencyColumn() {
  const db = getDatabase();
  console.log('Migrating holdings table to add currency column...');

  try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(holdings)").all() as Array<{ name: string }>;
    const hasCurrencyColumn = tableInfo.some(col => col.name === 'currency');

    if (hasCurrencyColumn) {
      console.log('Currency column already exists, skipping migration.');
      return;
    }

    // Add currency column
    db.exec(`
      ALTER TABLE holdings ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'
    `);

    console.log('Successfully added currency column to holdings table.');
    console.log('All existing holdings have been set to USD as default.');
  } catch (error: any) {
    if (error.message.includes('duplicate column')) {
      console.log('Currency column already exists.');
    } else {
      console.error('Error migrating currency column:', error);
      throw error;
    }
  }
}

migrateCurrencyColumn();

