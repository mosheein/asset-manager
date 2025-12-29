import { Router, Request, Response } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { parseIBStatement } from '../parsers/ibStatementParser';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Debug endpoint to see what the parser extracts
router.post('/parse-pdf', upload.single('pdf'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // First, extract raw text
    const pdfData = await pdfParse(req.file.buffer);
    const rawText = pdfData.text;

    // Find relevant sections
    const openPositionsMatch = rawText.match(/Open Positions[\s\S]*?(?=Total|Notes|$)/i);
    const m2mMatch = rawText.match(/Mark-to-Market Performance Summary[\s\S]*?(?=Mark-to-Market Performance Summary \(Forex\)|$)/i);
    
    // Try to parse
    const parsed = await parseIBStatement(req.file.buffer);

    // Extract sample lines for debugging
    const lines = rawText.split('\n');
    const openPositionsLines: string[] = [];
    const m2mLines: string[] = [];
    
    let inOpenPositions = false;
    let inM2M = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes('open positions')) {
        inOpenPositions = true;
        inM2M = false;
      }
      if (line.toLowerCase().includes('mark-to-market performance summary')) {
        inM2M = true;
        inOpenPositions = false;
      }
      if (line.toLowerCase().includes('total') && (inOpenPositions || inM2M)) {
        inOpenPositions = false;
        inM2M = false;
      }
      
      if (inOpenPositions && openPositionsLines.length < 50) {
        openPositionsLines.push(`${i}: ${line}`);
      }
      if (inM2M && m2mLines.length < 50) {
        m2mLines.push(`${i}: ${line}`);
      }
    }

    res.json({
      success: true,
      parsed: {
        accountId: parsed.accountId,
        statementDate: parsed.statementDate,
        baseCurrency: parsed.baseCurrency,
        holdingsCount: parsed.holdings.length,
        holdings: parsed.holdings.slice(0, 10), // First 10 for preview
      },
      debug: {
        textLength: rawText.length,
        hasOpenPositions: !!openPositionsMatch,
        hasMarkToMarket: !!m2mMatch,
        openPositionsSection: openPositionsMatch ? openPositionsMatch[0].substring(0, 2000) : null,
        markToMarketSection: m2mMatch ? m2mMatch[0].substring(0, 2000) : null,
        sampleLines: {
          openPositions: openPositionsLines.slice(0, 30),
          markToMarket: m2mLines.slice(0, 30),
        },
        firstSymbolMatch: rawText.match(/^([A-Z0-9]{2,6})\s+/m),
        symbolMatches: (rawText.match(/\b([A-Z0-9]{2,6})\s+/g) || []).slice(0, 20),
      },
    });
  } catch (error: any) {
    console.error('Debug parse error:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;

