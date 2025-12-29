# Asset Manager

A personal portfolio management web application for tracking investments via Interactive Brokers PDF statements.

## Features

- 📄 Parse Interactive Brokers PDF statements
- 💼 Manage multiple IB accounts
- 📊 Aggregate portfolio across all accounts
- 🎯 Compare actual vs target allocation
- ⚖️ Rebalancing suggestions
- 📈 Historical tracking

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, SQLite
- **Frontend**: React, TypeScript, Vite
- **PDF Parsing**: pdf-parse

## Setup

1. Install dependencies:
```bash
npm install
cd client && npm install
```

2. Initialize database:
```bash
npm run init:db
```

3. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173` (frontend) and `http://localhost:3001` (backend API).

## Usage

1. **Add Accounts**: Create accounts in the UI
2. **Upload Statements**: Upload PDF statements from Interactive Brokers
3. **Set Targets**: 
   - Upload an Excel file with your target allocations (see [EXCEL_FORMAT.md](./EXCEL_FORMAT.md) for format)
   - Or manually add targets one by one
4. **View Portfolio**: See aggregated holdings across all accounts
5. **Rebalance**: Get suggestions for trades to reach target allocation

## Excel Upload Format

See [EXCEL_FORMAT.md](./EXCEL_FORMAT.md) for detailed instructions on the Excel file format for target allocations.

