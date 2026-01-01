import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { getDatabase } from '../db/database';
import { TargetAllocation, TargetHistory } from '../db/schema';
import { parseTargetExcel } from '../parsers/targetExcelParser';
import { parseTargetCsv } from '../parsers/targetCsvParser';
import { lookupTickerFromISIN, lookupTickerFromName, getBestTicker, getAllTickers, ISINLookupResult, lookupNameFromTicker, lookupNameFromISIN } from '../services/tickerLookup';
import { validateTargets, TargetToValidate } from '../services/targetValidator';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all target allocations (optionally filtered by account - shows targets relevant to account holdings)
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // Targets are global - account_id filter is ignored for targets
    // (Account filtering only applies to holdings/portfolio, not to target allocations)
    const targets = db.prepare(`
      SELECT * FROM target_allocations 
      ORDER BY asset_type, asset_category, symbol, bucket
    `).all() as any[];
    
    // Build a map of symbol/ISIN -> instrument_name from all holdings
    // Get all holdings ordered by date (most recent first), then build map (first entry wins)
    const namesMap = new Map<string, string>();
    const holdings = db.prepare(`
      SELECT symbol, isin, instrument_name
      FROM holdings
      WHERE instrument_name IS NOT NULL AND instrument_name != ''
      ORDER BY statement_date DESC, created_at DESC
    `).all() as Array<{ symbol: string; isin: string | null; instrument_name: string }>;
    
    holdings.forEach((holding) => {
      if (holding.instrument_name) {
        // Map by symbol (case-insensitive) - first (most recent) entry wins
        if (holding.symbol) {
          const symbolKey = holding.symbol.toUpperCase();
          if (!namesMap.has(symbolKey)) {
            namesMap.set(symbolKey, holding.instrument_name);
          }
        }
        // Map by ISIN if available - first (most recent) entry wins
        if (holding.isin) {
          const isinKey = holding.isin.toUpperCase();
          if (!namesMap.has(isinKey)) {
            namesMap.set(isinKey, holding.instrument_name);
          }
        }
      }
    });
    
    // Parse alternative_tickers JSON strings and add names
    // First, try to get names from holdings (fast, no API calls)
    const parsedTargets = targets.map(target => {
      let parsedAltTickers: string[] | undefined = undefined;
      if (target.alternative_tickers && typeof target.alternative_tickers === 'string') {
        try {
          const parsed = JSON.parse(target.alternative_tickers);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedAltTickers = parsed;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Look up name from holdings first (fastest)
      let name: string | undefined = undefined;
      if (target.symbol) {
        name = namesMap.get(target.symbol.toUpperCase());
      }
      if (!name && target.isin) {
        name = namesMap.get(target.isin.toUpperCase());
      }
      
      return {
        ...target,
        alternative_tickers: parsedAltTickers,
        name: name || undefined,
        _needsNameLookup: !name && (!!target.symbol || !!target.isin), // Mark for async lookup
      } as TargetAllocation & { name?: string; _needsNameLookup?: boolean };
    });
    
    // For targets without names, try to look them up from external APIs
    // Do this in parallel but limit concurrency and add delays to avoid rate limiting
    const targetsNeedingLookup = parsedTargets.filter(t => t._needsNameLookup);
    
    // Process in batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES = 200; // 200ms delay between batches
    
    for (let i = 0; i < targetsNeedingLookup.length; i += BATCH_SIZE) {
      const batch = targetsNeedingLookup.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (target) => {
        let name: string | null = null;
        
        // Try ISIN first (more reliable)
        if (target.isin) {
          try {
            name = await Promise.race([
              lookupNameFromISIN(target.isin),
              new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)) // 3s timeout
            ]);
          } catch (error) {
            console.warn(`Failed to lookup name from ISIN ${target.isin}:`, error);
          }
        }
        
        // Fallback to ticker symbol
        if (!name && target.symbol) {
          try {
            name = await Promise.race([
              lookupNameFromTicker(target.symbol),
              new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 3000)) // 3s timeout
            ]);
          } catch (error) {
            console.warn(`Failed to lookup name from ticker ${target.symbol}:`, error);
          }
        }
        
        if (name) {
          target.name = name;
        }
        
        delete target._needsNameLookup;
      });
      
      // Wait for batch to complete
      await Promise.allSettled(batchPromises);
      
      // Add delay between batches (except for the last batch)
      if (i + BATCH_SIZE < targetsNeedingLookup.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Remove the temporary flag
    parsedTargets.forEach(target => {
      delete (target as any)._needsNameLookup;
    });
    
    res.json(parsedTargets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch target allocations' });
  }
});

// Create or update target allocation
router.post('/', (req: Request, res: Response) => {
  try {
    const { asset_type, asset_category, symbol, isin, target_percentage, bucket } = req.body;

    if (!asset_type || target_percentage === undefined) {
      return res.status(400).json({ error: 'Asset type and target percentage are required' });
    }

    const db = getDatabase();
    
    // Parse alternative_tickers if provided
    let alternativeTickersJson: string | null = null;
    if ((req.body as any).alternative_tickers && Array.isArray((req.body as any).alternative_tickers)) {
      const altTickers = (req.body as any).alternative_tickers as string[];
      if (altTickers.length > 0) {
        alternativeTickersJson = JSON.stringify(altTickers);
      }
    }
    
    // Check if target already exists
    const existing = db.prepare(`
      SELECT id FROM target_allocations 
      WHERE asset_type = ? AND 
            (asset_category IS NULL AND ? IS NULL OR asset_category = ?) AND
            (symbol IS NULL AND ? IS NULL OR symbol = ?) AND
            (isin IS NULL AND ? IS NULL OR isin = ?) AND
            (bucket IS NULL AND ? IS NULL OR bucket = ?)
    `).get(
      asset_type, 
      asset_category || null, asset_category || null,
      symbol || null, symbol || null,
      isin || null, isin || null,
      bucket || null, bucket || null
    ) as { id: number } | undefined;

    const insertHistory = db.prepare(`
      INSERT INTO target_history (target_allocation_id, target_percentage, asset_type, asset_category)
      VALUES (?, ?, ?, ?)
    `);

    let result;
    if (existing) {
      // Save old value to history
      const oldTarget = db.prepare('SELECT * FROM target_allocations WHERE id = ?')
        .get(existing.id) as TargetAllocation;
      if (oldTarget) {
        insertHistory.run(existing.id, oldTarget.target_percentage, oldTarget.asset_type, oldTarget.asset_category || null);
      }

      // Update existing
      db.prepare(`
        UPDATE target_allocations 
        SET target_percentage = ?, symbol = ?, alternative_tickers = ?, isin = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(target_percentage, symbol || null, alternativeTickersJson, isin || null, existing.id);

      // Save new value to history
      insertHistory.run(existing.id, target_percentage, asset_type, asset_category || null);
      result = { lastInsertRowid: existing.id };
    } else {
      // Insert new
      result = db.prepare(`
        INSERT INTO target_allocations (asset_type, asset_category, symbol, alternative_tickers, isin, target_percentage, bucket, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(asset_type, asset_category || null, symbol || null, alternativeTickersJson, isin || null, target_percentage, bucket || null);

      // Save to history
      insertHistory.run(result.lastInsertRowid as number, target_percentage, asset_type, asset_category || null);
    }

    const target = db.prepare('SELECT * FROM target_allocations WHERE id = ?')
      .get(result.lastInsertRowid) as TargetAllocation;
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create target allocation' });
  }
});

// Update target allocation
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { target_percentage } = req.body;
    const db = getDatabase();
    
    // Save old value to history
    const oldTarget = db.prepare('SELECT * FROM target_allocations WHERE id = ?')
      .get(req.params.id) as TargetAllocation | undefined;
    
    if (!oldTarget) {
      return res.status(404).json({ error: 'Target allocation not found' });
    }

    const insertHistory = db.prepare(`
      INSERT INTO target_history (target_allocation_id, target_percentage, asset_type, asset_category)
      VALUES (?, ?, ?, ?)
    `);
    insertHistory.run(req.params.id, oldTarget.target_percentage, oldTarget.asset_type, oldTarget.asset_category || null);
    
    db.prepare(`
      UPDATE target_allocations 
      SET target_percentage = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(target_percentage, req.params.id);

    // Save new value to history
    const updatedTarget = db.prepare('SELECT * FROM target_allocations WHERE id = ?')
      .get(req.params.id) as TargetAllocation;
    insertHistory.run(req.params.id, target_percentage, updatedTarget.asset_type, updatedTarget.asset_category || null);

    const target = db.prepare('SELECT * FROM target_allocations WHERE id = ?')
      .get(req.params.id) as TargetAllocation;
    
    res.json(target);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update target allocation' });
  }
});

// Delete target allocation
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM target_allocations WHERE id = ?').run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Target allocation not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete target allocation' });
  }
});

// Preview Excel/CSV file (parse but don't save)
router.post('/upload-excel-preview', upload.single('excel'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        errors: ['Please select a file to upload'],
        warnings: []
      });
    }

    // Check file type
    const fileExtension = req.file.originalname.toLowerCase().split('.').pop();
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls';
    const isCsv = fileExtension === 'csv';
    
    if (!isExcel && !isCsv) {
      return res.status(400).json({ 
        error: 'Invalid file type',
        errors: [`Expected Excel file (.xlsx or .xls) or CSV file (.csv), got: ${fileExtension}`],
        warnings: []
      });
    }

    // Parse file (Excel or CSV)
    let parsed;
    let availableSheets: string[] = [];
    let selectedSheet: string | undefined = undefined;
    
    try {
      if (isCsv) {
        const csvText = req.file.buffer.toString('utf-8');
        parsed = parseTargetCsv(csvText);
      } else {
        // For Excel, check if there are multiple sheets
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        availableSheets = workbook.SheetNames || [];
        
        // If user specified a sheet, use it; otherwise use first sheet
        // Note: req.body.sheetName comes from FormData
        const requestedSheetName = (req.body as any).sheetName;
        selectedSheet = requestedSheetName || (availableSheets.length > 0 ? availableSheets[0] : undefined);
        
        parsed = parseTargetExcel(req.file.buffer, selectedSheet);
      }
    } catch (parseError: any) {
      console.error(`Error parsing ${isCsv ? 'CSV' : 'Excel'} file:`, parseError);
      return res.status(400).json({ 
        error: `Failed to parse ${isCsv ? 'CSV' : 'Excel'} file`,
        errors: [parseError.message || `Invalid ${isCsv ? 'CSV' : 'Excel'} file format`],
        warnings: [],
        availableSheets: isCsv ? [] : availableSheets,
        selectedSheet: selectedSheet,
        hasMultipleSheets: !isCsv && availableSheets.length > 1,
      });
    }

    if (parsed.errors.length > 0) {
      return res.status(400).json({ 
        error: `${isCsv ? 'CSV' : 'Excel'} file parsing errors`,
        errors: parsed.errors,
        warnings: parsed.warnings,
        availableSheets: isCsv ? [] : availableSheets,
        selectedSheet: selectedSheet,
        hasMultipleSheets: !isCsv && availableSheets.length > 1,
      });
    }

    // Check if we have any targets
    if (parsed.targets.length === 0) {
      return res.status(400).json({ 
        error: 'No targets found',
        errors: [`${isCsv ? 'CSV' : 'Excel'} file does not contain any valid target allocations`],
        warnings: parsed.warnings,
        availableSheets: isCsv ? [] : availableSheets,
        selectedSheet: selectedSheet,
        hasMultipleSheets: !isCsv && availableSheets.length > 1,
      });
    }

    // Calculate total percentage
    const totalPercentage = parsed.targets.reduce((sum, t) => sum + t.targetPercentage, 0);

    // Convert parsed targets to validation format
    // Handle both Excel and CSV formats
    const targetsToValidate: TargetToValidate[] = parsed.targets.map((t, index) => {
      // CSV format uses mainTicker, Excel format uses ticker
      const mainTicker = (t as any).mainTicker || (t as any).ticker || undefined;
      // CSV format has otherTickers array, Excel might have it too
      const otherTickers = (t as any).otherTickers || undefined;
      
      return {
        assetType: t.assetType,
        assetCategory: t.assetCategory,
        instrument: (t as any).instrument || undefined,
        isin: t.isin,
        mainTicker: mainTicker,
        otherTickers: otherTickers,
        targetPercentage: t.targetPercentage,
        rowNumber: index + 2, // +2 because index is 0-based and we skip header
      };
    });

    // STEP 1: Validate all targets (check if tickers/ISINs exist)
    const validation = await validateTargets(targetsToValidate);

    // STEP 2: Format targets for preview
    const previewTargets = [];
    const autoDetectSuggestions: Array<{ index: number; field: string; suggestions: any }> = [];
    
    for (let i = 0; i < targetsToValidate.length; i++) {
      const t = targetsToValidate[i];
      const valResult = validation.results[i].validation;
      
      let ticker = t.mainTicker || null;
      let alternativeTickers: string[] = []; // Will be populated from auto-detect if needed
      let needsAutoDetect = false;
      let lookupResult: ISINLookupResult | null = null;
      
      // If data is missing, prepare auto-detect suggestions (but don't apply yet)
      if (valResult.needsAutoDetect) {
        needsAutoDetect = true;
        
        // If ticker is missing but ISIN is provided, prepare lookup
        if (!ticker && t.isin) {
          try {
            lookupResult = await lookupTickerFromISIN(t.isin);
            if (lookupResult) {
              autoDetectSuggestions.push({
                index: i,
                field: 'ticker',
                suggestions: lookupResult.tickers,
              });
            }
          } catch (error) {
            console.warn(`Failed to lookup ticker for ISIN ${t.isin}:`, error);
          }
        }
        
        // If still no ticker and instrument name is provided, try name lookup
        if (!ticker && t.instrument) {
          try {
            const nameTickers = await lookupTickerFromName(t.instrument);
            if (nameTickers && nameTickers.length > 0) {
              autoDetectSuggestions.push({
                index: i,
                field: 'ticker',
                suggestions: nameTickers,
              });
            }
          } catch (error) {
            console.warn(`Failed to lookup ticker for instrument ${t.instrument}:`, error);
          }
        }
      }
      
      // Get other tickers from CSV format if available
      const otherTickersFromCsv = t.otherTickers || [];
      
      previewTargets.push({
        asset_type: t.assetType,
        asset_category: t.assetCategory || null,
        target_percentage: t.targetPercentage,
        instrument: t.instrument || null,
        isin: t.isin || null,
        ticker: ticker || null,
        // Combine CSV otherTickers with auto-detected alternatives
        alternative_tickers: otherTickersFromCsv.length > 0 
          ? otherTickersFromCsv 
          : (alternativeTickers.length > 0 ? alternativeTickers : null),
        _needsAutoDetect: needsAutoDetect,
        _missingFields: valResult.missingFields,
        _validationErrors: valResult.errors,
        _validationWarnings: valResult.warnings,
        _autoDetectSuggestions: autoDetectSuggestions.find(s => s.index === i)?.suggestions || null,
      });
    }

    // Combine all validation warnings and errors
    const allValidationErrors = validation.results.flatMap(r => r.validation.errors);
    const allValidationWarnings = [
      ...parsed.warnings,
      ...validation.results.flatMap(r => r.validation.warnings),
    ];

    const hasMultipleSheets = !isCsv && availableSheets.length > 1;
    
    res.json({
      targets: previewTargets,
      warnings: allValidationWarnings,
      errors: allValidationErrors,
      totalPercentage,
      targetsCount: previewTargets.length,
      validationSummary: validation.summary,
      allComplete: validation.allComplete,
      needsAutoDetect: validation.summary.needsAutoDetect > 0,
      availableSheets: isCsv ? [] : availableSheets,
      selectedSheet: selectedSheet,
      hasMultipleSheets: hasMultipleSheets,
    });
  } catch (error: any) {
    console.error('Unexpected error parsing Excel:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: `Failed to parse Excel file: ${error.message || 'Unknown error'}`,
      errors: [error.message || 'An unexpected error occurred while parsing the Excel file'],
      warnings: []
    });
  }
});

// Commit Excel targets (save to database)
router.post('/commit-excel', async (req: Request, res: Response) => {
  try {
    const { targets } = req.body;

    if (!targets || !Array.isArray(targets)) {
      return res.status(400).json({ error: 'Targets array is required' });
    }

    const db = getDatabase();
          const insertTarget = db.prepare(`
            INSERT INTO target_allocations (asset_type, asset_category, symbol, alternative_tickers, isin, target_percentage, bucket, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `);

    const insertHistory = db.prepare(`
      INSERT INTO target_history (target_allocation_id, target_percentage, asset_type, asset_category)
      VALUES (?, ?, ?, ?)
    `);

    // Disable foreign key checks BEFORE transaction (PRAGMA doesn't work well inside transactions)
    db.exec('PRAGMA foreign_keys = OFF');
    
    console.log(`\n=== COMMITTING ${targets.length} TARGETS ===`);
    console.log(`Total percentage in request: ${targets.reduce((sum: number, t: any) => sum + (t.target_percentage || 0), 0).toFixed(2)}%`);
    
    const transaction = db.transaction((targetList) => {
      // First, save current targets to history BEFORE any changes
      const existingTargets = db.prepare('SELECT * FROM target_allocations').all() as TargetAllocation[];
      console.log(`Saving ${existingTargets.length} existing targets to history...`);
      for (const existing of existingTargets) {
        insertHistory.run(existing.id, existing.target_percentage, existing.asset_type, existing.asset_category || null);
      }

      // Delete all existing targets (history is already saved with asset info, so we can delete safely)
      db.prepare('DELETE FROM target_allocations').run();
      console.log(`Deleted all existing targets. Now inserting ${targetList.length} new targets...`);

      // Insert new targets
      const targetIds: number[] = [];
      const insertedTargets: Array<{asset_type: string, asset_category: string | null, symbol: string | null, isin: string | null, percentage: number}> = [];
      
      for (let i = 0; i < targetList.length; i++) {
        const target = targetList[i];
        // Extract symbol from ticker if available (support both "ticker" and "mainTicker" fields)
        const symbol = (target as any).ticker || (target as any).mainTicker || (target as any).symbol || null;
        
        // Handle alternative tickers - can come from "alternative_tickers" or "otherTickers"
        let alternativeTickers: string[] = [];
        if ((target as any).alternative_tickers && Array.isArray((target as any).alternative_tickers)) {
          alternativeTickers = (target as any).alternative_tickers;
        } else if ((target as any).otherTickers && Array.isArray((target as any).otherTickers)) {
          alternativeTickers = (target as any).otherTickers;
        }
        
        const isin = (target as any).isin || null;
        
        // Store alternative tickers as JSON string
        const alternativeTickersJson = alternativeTickers.length > 0
          ? JSON.stringify(alternativeTickers)
          : null;
        
        console.log(`[${i + 1}/${targetList.length}] Inserting: ${target.asset_type} | ${target.asset_category || 'NULL'} | ${symbol || 'NULL'} | ${isin || 'NULL'} | ${target.target_percentage}%`);
        
        try {
          const result = insertTarget.run(
            target.asset_type,
            target.asset_category || null,
            symbol,
            alternativeTickersJson,
            isin,
            target.target_percentage,
            null // bucket not in Excel format
          );
          const newId = result.lastInsertRowid as number;
          targetIds.push(newId);
          insertedTargets.push({
            asset_type: target.asset_type,
            asset_category: target.asset_category || null,
            symbol,
            isin,
            percentage: target.target_percentage
          });
          
          // Save new target to history immediately after creation
          insertHistory.run(newId, target.target_percentage, target.asset_type, target.asset_category || null);
          console.log(`  ✓ Successfully inserted (ID: ${newId})`);
        } catch (insertError: any) {
          // Log the error for debugging
          console.error(`  ✗ ERROR inserting target [${i + 1}]: ${target.asset_type} - ${target.asset_category} - ${symbol} - ${isin}:`, insertError.message);
          console.error(`  Full error:`, insertError);
          
          // If unique constraint violation, log and throw (shouldn't happen after migration)
          if (insertError.message.includes('UNIQUE') || insertError.message.includes('unique')) {
            console.error(`\n❌ UNIQUE CONSTRAINT VIOLATION:`);
            console.error(`  Target [${i + 1}/${targetList.length}]: ${target.asset_type} | ${target.asset_category || 'NULL'} | ${symbol || 'NULL'} | ${isin || 'NULL'}`);
            console.error(`  Error: ${insertError.message}`);
            console.error(`  This should not happen after migration. Please run: npm run migrate:fix-unique`);
            
            // Check if this exact combination already exists in insertedTargets
            const duplicate = insertedTargets.find(t => 
              t.asset_type === target.asset_type &&
              (t.asset_category === (target.asset_category || null)) &&
              (t.symbol === symbol) &&
              (t.isin === isin)
            );
            if (duplicate) {
              console.error(`  ⚠️  This target was already inserted in this batch: ${JSON.stringify(duplicate)}`);
            } else {
              // Check if it exists in the database (shouldn't since we deleted all)
              const existing = db.prepare(`
                SELECT * FROM target_allocations 
                WHERE asset_type = ? 
                  AND (asset_category IS NULL AND ? IS NULL OR asset_category = ?)
                  AND (symbol IS NULL AND ? IS NULL OR symbol = ?)
                  AND (isin IS NULL AND ? IS NULL OR isin = ?)
                  AND (bucket IS NULL AND ? IS NULL OR bucket = ?)
              `).get(
                target.asset_type,
                target.asset_category || null, target.asset_category || null,
                symbol, symbol,
                isin, isin,
                null, null
              );
              if (existing) {
                console.error(`  ⚠️  This target already exists in database: ${JSON.stringify(existing)}`);
              }
            }
            // Don't skip - throw error so user knows something went wrong
            throw new Error(`Failed to insert target [${i + 1}]: ${target.asset_type} - ${target.asset_category || 'NULL'} - ${symbol || 'NULL'} - ${isin || 'NULL'}. This may be a duplicate. Error: ${insertError.message}`);
          }
          throw insertError;
        }
      }

      console.log(`Successfully inserted ${targetIds.length} out of ${targetList.length} targets.`);
      const totalPct = insertedTargets.reduce((sum, t) => sum + t.percentage, 0);
      console.log(`Total percentage inserted: ${totalPct.toFixed(2)}%`);
      
      return targetIds;
    });

    // Log what we're about to insert
    console.log('\n=== TARGETS TO INSERT ===');
    targets.forEach((t: any, i: number) => {
      const symbol = t.ticker || t.symbol || null;
      const isin = t.isin || null;
      console.log(`[${i + 1}] ${t.asset_type} | ${t.asset_category || 'NULL'} | ${symbol || 'NULL'} | ${isin || 'NULL'} | ${t.target_percentage}%`);
    });
    console.log(`Total: ${targets.length} targets, ${targets.reduce((sum: number, t: any) => sum + (t.target_percentage || 0), 0).toFixed(2)}%\n`);

    let targetIds;
    let insertedCount = 0;
    try {
      targetIds = transaction(targets);
      insertedCount = targetIds.length;
      
      // Verify all targets were inserted
      if (insertedCount !== targets.length) {
        console.error(`\n❌ ERROR: Only ${insertedCount} out of ${targets.length} targets were inserted!`);
        console.error(`Missing ${targets.length - insertedCount} targets.`);
        // This should not happen - transaction should rollback on error
        throw new Error(`Transaction completed but only ${insertedCount} out of ${targets.length} targets were inserted. This indicates a bug.`);
      }
    } catch (error: any) {
      // Always re-enable foreign key checks, even if transaction fails
      db.exec('PRAGMA foreign_keys = ON');
      console.error('\n❌ TRANSACTION FAILED:', error.message);
      console.error('Stack:', error.stack);
      throw error;
    } finally {
      // Always re-enable foreign key checks, even if transaction fails
      db.exec('PRAGMA foreign_keys = ON');
    }

    // Get inserted targets and verify total percentage
    const newTargets = db.prepare(`
      SELECT * FROM target_allocations 
      ORDER BY asset_type, asset_category
    `).all() as any[];
    
    // Parse alternative_tickers JSON strings
    const parsedTargets = newTargets.map(target => {
      let parsedAltTickers: string[] | undefined = undefined;
      if (target.alternative_tickers && typeof target.alternative_tickers === 'string') {
        try {
          const parsed = JSON.parse(target.alternative_tickers);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedAltTickers = parsed;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      return {
        ...target,
        alternative_tickers: parsedAltTickers,
      } as TargetAllocation;
    });

    // Calculate total percentage of inserted targets
    const totalPercentage = parsedTargets.reduce((sum, t) => sum + t.target_percentage, 0);

    // Warn if total doesn't match expected
    if (insertedCount !== targets.length) {
      console.warn(`Warning: Expected ${targets.length} targets, but only ${insertedCount} were inserted.`);
    }

    res.json({
      message: 'Targets committed successfully',
      targets: parsedTargets,
      targetsCount: parsedTargets.length,
      totalPercentage,
      insertedCount,
      expectedCount: targets.length,
    });
  } catch (error: any) {
    console.error('Error committing targets:', error);
    res.status(500).json({ error: `Failed to commit targets: ${error.message}` });
  }
});

// Get target history
router.get('/history', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const history = db.prepare(`
      SELECT 
        th.*,
        ta.asset_type,
        ta.asset_category,
        ta.bucket
      FROM target_history th
      JOIN target_allocations ta ON th.target_allocation_id = ta.id
      ORDER BY th.created_at DESC
      LIMIT 500
    `).all() as Array<TargetHistory & { asset_type: string; asset_category: string | null; bucket: string | null }>;
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch target history' });
  }
});

// Get target history for a specific target allocation
router.get('/:id/history', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const history = db.prepare(`
      SELECT * FROM target_history 
      WHERE target_allocation_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id) as TargetHistory[];
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch target history' });
  }
});

export default router;

