import { getDatabase } from './database';

console.log('Clearing database...');
const db = getDatabase();

// Delete all data from tables (in order to respect foreign keys)
db.prepare('DELETE FROM target_history').run();
db.prepare('DELETE FROM snapshot_allocations').run();
db.prepare('DELETE FROM portfolio_snapshots').run();
db.prepare('DELETE FROM transactions').run();
db.prepare('DELETE FROM holdings').run();
db.prepare('DELETE FROM target_allocations').run();
db.prepare('DELETE FROM accounts').run();

console.log('Database cleared successfully!');
console.log('All tables have been emptied.');

process.exit(0);

