import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parseIBStatement, parseIBStatementCSV } from '../parsers/ibStatementParser';
import { getDatabase } from '../db/database';
import { Holding, TargetAllocation } from '../db/schema';
import { getCurrenciesForSymbols, getExchangeRate } from '../services/currencyLookup';
import { matchHoldingsToTargets, updateHoldingsWithTargetTypes } from '../services/holdingMatcher';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload and parse PDF or CSV statement
router.post('/upload', upload.single('statement'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { account_id } = req.body;
    if (!account_id) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    // Detect file type
    const fileExtension = req.file.originalname.toLowerCase().split('.').pop();
    const isCSV = fileExtension === 'csv';
    const isPDF = fileExtension === 'pdf';

    if (!isCSV && !isPDF) {
      return res.status(400).json({ error: 'File must be a PDF or CSV file' });
    }

    let parsed;
    if (isCSV) {
      // Parse CSV
      console.log('Parsing CSV statement...');
      console.log('File size:', req.file.size, 'bytes');
      const csvText = req.file.buffer.toString('utf-8');
      parsed = parseIBStatementCSV(csvText);
      console.log(`Parsed CSV statement: ${parsed.holdings.length} holdings found`);
      console.log('Account ID from CSV:', parsed.accountId);
      console.log('Statement date:', parsed.statementDate);
    } else {
      // Parse PDF
      console.log('Parsing PDF statement...');
      console.log('File size:', req.file.size, 'bytes');
      parsed = await parseIBStatement(req.file.buffer);
      console.log(`Parsed PDF statement: ${parsed.holdings.length} holdings found`);
      console.log('Account ID from PDF:', parsed.accountId);
      console.log('Statement date:', parsed.statementDate);
    }
    
    if (parsed.holdings.length > 0) {
      console.log('Sample holdings:', parsed.holdings.slice(0, 3).map(h => ({
        symbol: h.symbol,
        quantity: h.quantity,
        price: h.price,
        value: h.value
      })));
    }

    if (parsed.holdings.length === 0) {
      return res.status(400).json({ 
        error: `No holdings found in ${isCSV ? 'CSV' : 'PDF'}. The file might not be in the expected Interactive Brokers format, or the Open Positions / Mark-to-Market Performance Summary section could not be parsed.`,
        accountId: parsed.accountId,
        statementDate: parsed.statementDate,
        fileType: isCSV ? 'CSV' : 'PDF',
        debug: 'Check server console logs for detailed parsing information',
      });
    }

    // Verify account exists and matches
    const db = getDatabase();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Convert statement date to ISO format
    const statementDate = new Date(parsed.statementDate).toISOString().split('T')[0];

    // Delete old holdings for this account and date
    db.prepare('DELETE FROM holdings WHERE account_id = ? AND statement_date = ?')
      .run(account_id, statementDate);

    // Get account base currency
    const accountData = db.prepare('SELECT base_currency FROM accounts WHERE id = ?').get(account_id) as { base_currency: string };
    const accountBaseCurrency = accountData?.base_currency || 'USD';

    // Lookup currencies for all holdings
    console.log('Looking up currencies for holdings...');
    const currencyMap = await getCurrenciesForSymbols(
      parsed.holdings.map(h => ({ symbol: h.symbol, currency: h.currency }))
    );

    // Get exchange rates for currencies we need
    const currenciesNeeded = new Set<string>();
    currencyMap.forEach(currency => {
      currenciesNeeded.add(currency); // We need all currencies for USD conversion too
      if (currency !== accountBaseCurrency) {
        currenciesNeeded.add(currency);
      }
    });

    // Get exchange rates: currency -> USD and currency -> base currency
    const exchangeRatesToUSD = new Map<string, number>();
    const exchangeRatesToBase = new Map<string, number>();
    
    for (const currency of currenciesNeeded) {
      if (currency !== 'USD') {
        const usdRate = await getExchangeRate(currency, 'USD');
        exchangeRatesToUSD.set(currency, usdRate);
        console.log(`Exchange rate ${currency} to USD: ${usdRate}`);
      } else {
        exchangeRatesToUSD.set('USD', 1.0);
      }
      
      if (currency !== accountBaseCurrency) {
        const baseRate = await getExchangeRate(currency, accountBaseCurrency);
        exchangeRatesToBase.set(currency, baseRate);
        console.log(`Exchange rate ${currency} to ${accountBaseCurrency}: ${baseRate}`);
      } else {
        exchangeRatesToBase.set(accountBaseCurrency, 1.0);
      }
    }

    // Insert new holdings
    const insertStmt = db.prepare(`
      INSERT INTO holdings (
        account_id, symbol, isin, instrument_name, asset_type, asset_category,
        quantity, price, currency, value_usd, value_base, statement_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((holdings) => {
      for (const holding of holdings) {
        const assetCurrency = currencyMap.get(holding.symbol) || holding.currency || 'USD';
        
        // The holding.value is in the asset's currency
        // Calculate value from quantity * price to ensure accuracy
        const valueInCurrency = holding.quantity * holding.price;
        
        // Convert value to USD (if not already)
        let valueUsd = valueInCurrency;
        if (assetCurrency !== 'USD') {
          const usdRate = exchangeRatesToUSD.get(assetCurrency) || 1.0;
          valueUsd = valueInCurrency * usdRate;
          console.log(`Converting ${holding.symbol}: ${valueInCurrency.toFixed(2)} ${assetCurrency} * ${usdRate.toFixed(4)} = ${valueUsd.toFixed(2)} USD`);
        }
        
        // Convert value to account's base currency
        let valueBase = valueInCurrency;
        if (assetCurrency !== accountBaseCurrency) {
          const baseRate = exchangeRatesToBase.get(assetCurrency) || 1.0;
          valueBase = valueInCurrency * baseRate;
        }
        
        insertStmt.run(
          account_id,
          holding.symbol,
          holding.isin || null,
          holding.instrumentName || null,
          'Unknown', // Will be determined from targets
          holding.assetCategory || null,
          holding.quantity,
          holding.price,
          assetCurrency,
          valueUsd,
          valueBase,
          statementDate
        );
      }
    });

    insertMany(parsed.holdings);
    
    // Add cash as a holding if cash > 0
    if (parsed.cash > 0) {
      // Cash is in base currency
      const cashCurrency = accountBaseCurrency;
      const cashValueUsd = accountBaseCurrency === 'USD' ? parsed.cash : parsed.cash * (exchangeRatesToUSD.get(accountBaseCurrency) || 1.0);
      const cashValueBase = parsed.cash;
      
      // Check if cash holding already exists for this account/date
      const existingCash = db.prepare(`
        SELECT id FROM holdings 
        WHERE account_id = ? AND symbol = 'CASH' AND statement_date = ?
      `).get(account_id, statementDate) as { id: number } | undefined;
      
      if (!existingCash) {
        db.prepare(`
          INSERT INTO holdings (
            account_id, symbol, isin, instrument_name, asset_type, asset_category,
            quantity, price, currency, value_usd, value_base, statement_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          account_id,
          'CASH',
          null,
          'Cash',
          'Cash',
          'Cash',
          1, // quantity
          parsed.cash, // price = total cash
          cashCurrency,
          cashValueUsd,
          cashValueBase,
          statementDate
        );
        console.log(`Added cash holding: ${cashCurrency} ${parsed.cash.toFixed(2)} = USD ${cashValueUsd.toFixed(2)}`);
      }
    }

    // Match holdings to targets and update asset types
    console.log('Matching holdings to targets...');
    const allTargets = db.prepare('SELECT * FROM target_allocations').all() as TargetAllocation[];
    const insertedHoldings = db.prepare(`
      SELECT * FROM holdings 
      WHERE account_id = ? AND statement_date = ?
    `).all(account_id, statementDate) as Holding[];
    
    const { matched, unmatched } = matchHoldingsToTargets(insertedHoldings, allTargets);
    
    // Update matched holdings with asset types from targets
    const updateMatchedStmt = db.prepare(`
      UPDATE holdings 
      SET asset_type = ?, asset_category = ?
      WHERE account_id = ? AND symbol = ? AND statement_date = ?
    `);
    
    for (const matchedHolding of matched) {
      const target = allTargets.find(t => t.id === matchedHolding.matchedTargetId);
      if (target) {
        updateMatchedStmt.run(
          target.asset_type,
          target.asset_category || matchedHolding.asset_category || null,
          account_id,
          matchedHolding.symbol,
          statementDate
        );
      }
    }
    
    // For unmatched holdings, use suggested asset type
    const updateUnmatchedStmt = db.prepare(`
      UPDATE holdings 
      SET asset_type = ?
      WHERE account_id = ? AND symbol = ? AND statement_date = ?
    `);
    
    for (const { holding, suggestedAssetType } of unmatched) {
      if (suggestedAssetType) {
        updateUnmatchedStmt.run(
          suggestedAssetType,
          account_id,
          holding.symbol,
          statementDate
        );
      }
    }
    
    console.log(`Matched ${matched.length} holdings, ${unmatched.length} unmatched`);

    // Create portfolio snapshot for this date
    const latestHoldings = db.prepare(`
      SELECT h.* 
      FROM holdings h
      INNER JOIN (
        SELECT account_id, MAX(statement_date) as max_date
        FROM holdings
        GROUP BY account_id
      ) latest ON h.account_id = latest.account_id AND h.statement_date = latest.max_date
    `).all() as Array<{ asset_type: string; asset_category: string | null; value_usd: number; value_base: number }>;

    const totalValueUsd = latestHoldings.reduce((sum, h) => sum + h.value_usd, 0);
    const totalValueBase = latestHoldings.reduce((sum, h) => sum + h.value_base, 0);

    // Check if snapshot already exists for this date
    const existingSnapshot = db.prepare('SELECT id FROM portfolio_snapshots WHERE snapshot_date = ?')
      .get(statementDate) as { id: number } | undefined;

    if (!existingSnapshot) {
      const account = db.prepare('SELECT base_currency FROM accounts WHERE id = ?').get(account_id) as { base_currency: string };
      const baseCurrency = account?.base_currency || 'USD';

      const snapshotResult = db.prepare(`
        INSERT INTO portfolio_snapshots (snapshot_date, total_value_usd, total_value_base, base_currency)
        VALUES (?, ?, ?, ?)
      `).run(statementDate, totalValueUsd, totalValueBase, baseCurrency);

      const snapshotId = snapshotResult.lastInsertRowid;

      // Create allocations
      const allocationsByType = new Map<string, { value: number; category?: string }>();
      for (const holding of latestHoldings) {
        const key = `${holding.asset_type}|${holding.asset_category || ''}`;
        if (!allocationsByType.has(key)) {
          allocationsByType.set(key, { value: 0, category: holding.asset_category || undefined });
        }
        const existing = allocationsByType.get(key)!;
        existing.value += holding.value_usd;
      }

      const insertAllocation = db.prepare(`
        INSERT INTO snapshot_allocations (snapshot_id, asset_type, asset_category, percentage, value_usd)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertAllocations = db.transaction((allocations) => {
        for (const [key, data] of allocations) {
          const [assetType, assetCategory] = key.split('|');
          const percentage = (data.value / totalValueUsd) * 100;
          insertAllocation.run(
            snapshotId,
            assetType,
            assetCategory || null,
            percentage,
            data.value
          );
        }
      });

      insertAllocations(allocationsByType);
    }

    // Get final holdings with updated asset types
    const finalHoldings = db.prepare(`
      SELECT * FROM holdings 
      WHERE account_id = ? AND statement_date = ?
      ORDER BY value_usd DESC
    `).all(account_id, statementDate) as Holding[];

    res.json({
      message: 'Statement parsed successfully',
      accountId: parsed.accountId,
      statementDate,
      holdingsCount: finalHoldings.length,
      holdings: finalHoldings,
      unmatchedCount: unmatched.length,
      unmatchedHoldings: unmatched.map(u => ({
        holding: u.holding, // Include full holding object
        symbol: u.holding.symbol,
        suggestedAssetType: u.suggestedAssetType,
        suggestedMatches: u.suggestedMatches.map(m => ({
          targetId: m.target.id,
          assetType: m.target.asset_type,
          assetCategory: m.target.asset_category,
          symbol: m.target.symbol,
          matchReason: m.matchReason,
        })),
      })),
    });
  } catch (error: any) {
    console.error('Error parsing statement:', error);
    res.status(500).json({ error: `Failed to parse statement: ${error.message}` });
  }
});

export default router;

