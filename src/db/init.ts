import { getDatabase } from './database';

console.log('Initializing database...');
const db = getDatabase();
console.log('Database initialized successfully!');
process.exit(0);

