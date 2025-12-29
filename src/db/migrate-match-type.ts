/**
 * Migration: Add match_type column to symbol_mappings table
 * match_type: 'exact' | 'same_basket' | NULL
 * - 'exact': Same ISIN/Ticker as target
 * - 'same_basket': Different asset but same category/bucket
 * - NULL: No match (goes to Unknown target bucket)
 */
import { getDatabase } from './database';

export function migrateMatchType() {
  const db = getDatabase();
  
  try {
    // Check if column already exists
    const tableInfo = db.prepare("PRAGMA table_info(symbol_mappings)").all() as Array<{ name: string }>;
    const hasMatchType = tableInfo.some(col => col.name === 'match_type');
    
    if (!hasMatchType) {
      console.log('Adding match_type column to symbol_mappings table...');
      
      // Add match_type column
      db.exec(`
        ALTER TABLE symbol_mappings 
        ADD COLUMN match_type TEXT CHECK(match_type IN ('exact', 'same_basket'))
      `);
      
      // Set default match_type based on existing mappings
      // If holding symbol matches target symbol exactly, it's 'exact'
      // Otherwise, infer from the relationship
      db.exec(`
        UPDATE symbol_mappings
        SET match_type = CASE
          WHEN EXISTS (
            SELECT 1 FROM target_allocations ta
            WHERE ta.id = symbol_mappings.target_id
            AND (ta.symbol = symbol_mappings.holding_symbol 
                 OR ta.isin IN (
                   SELECT isin FROM holdings 
                   WHERE symbol = symbol_mappings.holding_symbol 
                   AND isin IS NOT NULL
                 ))
          ) THEN 'exact'
          ELSE 'same_basket'
        END
        WHERE match_type IS NULL
      `);
      
      console.log('✓ match_type column added successfully');
    } else {
      console.log('match_type column already exists, skipping migration');
    }
  } catch (error: any) {
    console.error('Error migrating match_type:', error);
    throw error;
  }
}

if (require.main === module) {
  migrateMatchType();
}
