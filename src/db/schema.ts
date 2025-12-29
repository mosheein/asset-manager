import Database from 'better-sqlite3';

export interface Account {
  id: number;
  name: string;
  ib_account_id: string;
  base_currency: string;
  created_at: string;
}

export interface Holding {
  id: number;
  account_id: number;
  symbol: string;
  isin?: string;
  instrument_name?: string;
  asset_type: string; // 'Stock', 'Bond', 'Cash', 'Commodity', 'REIT', etc.
  asset_category?: string; // 'US Stock market', 'World stock market', etc.
  quantity: number;
  price: number;
  currency: string; // Trading currency of the asset (USD, EUR, etc.)
  value_usd: number;
  value_base: number; // value in account's base currency
  statement_date: string;
  created_at: string;
}

export interface TargetAllocation {
  id: number;
  asset_type: string;
  asset_category?: string;
  symbol?: string; // Primary ticker/symbol for ticker-level targets
  alternative_tickers?: string[]; // Alternative ticker symbols (e.g., different exchanges)
  isin?: string; // Optional ISIN for matching
  target_percentage: number;
  bucket?: string; // 'short', 'medium', 'long' term
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  symbol: string;
  transaction_type: string; // 'BUY', 'SELL', 'DIVIDEND', 'INTEREST', etc.
  quantity: number;
  price: number;
  amount: number;
  currency: string;
  transaction_date: string;
  created_at: string;
}

export interface PortfolioSnapshot {
  id: number;
  snapshot_date: string;
  total_value_usd: number;
  total_value_base: number;
  base_currency: string;
  created_at: string;
}

export interface SymbolMapping {
  id: number;
  account_id: number;
  holding_symbol: string;
  target_id: number;
  match_type?: 'exact' | 'same_basket' | null; // 'exact' = same ISIN/Ticker, 'same_basket' = same category, null = no match
  created_at: string;
  updated_at: string;
}

export interface SnapshotAllocation {
  id: number;
  snapshot_id: number;
  asset_type: string;
  asset_category?: string;
  percentage: number;
  value_usd: number;
  created_at: string;
}

export interface TargetHistory {
  id: number;
  target_allocation_id: number;
  target_percentage: number;
  created_at: string;
}

export function initDatabase(db: Database.Database) {
  // Accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ib_account_id TEXT NOT NULL UNIQUE,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Holdings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      isin TEXT,
      instrument_name TEXT,
      asset_type TEXT NOT NULL,
      asset_category TEXT,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      value_usd REAL NOT NULL,
      value_base REAL NOT NULL,
      statement_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      UNIQUE(account_id, symbol, statement_date)
    )
  `);

  // Target allocations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS target_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type TEXT NOT NULL,
      asset_category TEXT,
      symbol TEXT,
      isin TEXT,
      target_percentage REAL NOT NULL,
      bucket TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_type, asset_category, symbol, isin, bucket)
    )
  `);

  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      quantity REAL,
      price REAL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // Portfolio snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT NOT NULL UNIQUE,
      total_value_usd REAL NOT NULL,
      total_value_base REAL NOT NULL,
      base_currency TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Snapshot allocations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshot_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      asset_type TEXT NOT NULL,
      asset_category TEXT,
      percentage REAL NOT NULL,
      value_usd REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (snapshot_id) REFERENCES portfolio_snapshots(id),
      UNIQUE(snapshot_id, asset_type, asset_category)
    )
  `);

  // Target history table
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

  // Symbol mappings table - maps holding symbols to target symbols
  db.exec(`
    CREATE TABLE IF NOT EXISTS symbol_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      holding_symbol TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      match_type TEXT CHECK(match_type IN ('exact', 'same_basket')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (target_id) REFERENCES target_allocations(id),
      UNIQUE(account_id, holding_symbol)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_holdings_account_date ON holdings(account_id, statement_date);
    CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_snapshot_allocations_snapshot ON snapshot_allocations(snapshot_id);
    CREATE INDEX IF NOT EXISTS idx_target_history_allocation ON target_history(target_allocation_id);
    CREATE INDEX IF NOT EXISTS idx_symbol_mappings_account ON symbol_mappings(account_id);
    CREATE INDEX IF NOT EXISTS idx_symbol_mappings_target ON symbol_mappings(target_id);
  `);
}

