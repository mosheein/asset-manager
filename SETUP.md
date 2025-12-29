# Setup Instructions

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn

## Installation

1. Install backend dependencies:
```bash
npm install
```

2. Install frontend dependencies:
```bash
cd client
npm install
cd ..
```

3. Initialize the database:
```bash
npm run init:db
```

This will create a SQLite database file (`portfolio.db`) in the project root.

## Running the Application

### Development Mode

Run both backend and frontend in development mode:
```bash
npm run dev
```

This will start:
- Backend API server on `http://localhost:3001`
- Frontend development server on `http://localhost:5173`

### Production Build

1. Build both backend and frontend:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

The app will be available at `http://localhost:3001`

## Usage

1. **Add Accounts**: 
   - Go to the "Accounts" page
   - Click "Add Account"
   - Enter your account name, IB Account ID (e.g., U***3705), and base currency

2. **Upload Statements**:
   - In the Accounts page, click "Upload PDF" next to an account
   - Select your Interactive Brokers PDF statement
   - The system will parse the statement and update your holdings

3. **Set Target Allocations**:
   - Go to the "Targets" page
   - Add target percentages for each asset type/category
   - Make sure the total equals 100%

4. **View Portfolio**:
   - The "Portfolio" page shows your current holdings aggregated across all accounts
   - View allocation by asset type with charts

5. **Rebalancing**:
   - Go to the "Rebalancing" page
   - Adjust the tolerance slider if needed
   - Review buy/sell suggestions to reach your target allocation

6. **History**:
   - The "History" page shows portfolio value over time
   - Snapshots are automatically created when you upload statements

## Notes

- The PDF parser extracts holdings from the "Mark-to-Market Performance Summary" section
- Asset types are automatically inferred from symbols (e.g., BND → Bond, GLD → Commodity)
- The database file (`portfolio.db`) stores all your data locally
- Make sure to back up the database file regularly

## Troubleshooting

- If PDF parsing fails, check that the PDF is a valid IB Activity Statement
- The parser looks for specific sections in the PDF - make sure the statement format matches IB's standard format
- If holdings aren't showing up, verify the statement was uploaded for the correct account

