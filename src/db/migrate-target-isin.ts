/**
 * Migration script to add isin column to target_allocations table
 */
import { getDatabase } from './database';

function migrateTargetIsin() {
  const db = getDatabase();
  console.log('Migrating target_allocations table to add isin column...');

  try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(target_allocations)").all() as Array<{ name: string }>;
    const hasIsinColumn = tableInfo.some(col => col.name === 'isin');

    if (hasIsinColumn) {
      console.log('ISIN column already exists, skipping migration.');
      return;
    }

    // Add isin column
    db.exec(`
      ALTER TABLE target_allocations ADD COLUMN isin TEXT
    `);

    console.log('Successfully added isin column to target_allocations table.');
  } catch (error: any) {
    if (error.message.includes('duplicate column')) {
      console.log('ISIN column already exists.');
    } else {
      console.error('Error migrating isin column:', error);
      throw error;
    }
  }
}

migrateTargetIsin();

