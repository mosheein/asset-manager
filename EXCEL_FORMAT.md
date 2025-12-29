# Excel Upload Format for Target Allocations

## Required Format

Your Excel file should have the following columns (in any order, but these exact column names):

1. **Asset Type** (required)
2. **Asset Category** (optional)
3. **Instrument** (optional but recommended)
4. **ISIN** (optional)
5. **Ticker** (optional)
6. **% target holding** or **%** (required) - The target percentage allocation

## Example Excel Format

| Asset Type | Asset Category | Instrument | ISIN | Ticker | % target holding |
|------------|----------------|------------|------|--------|------------------|
| Shares | US Stock market | VTI | US9229087690 | VTI | 38.00 |
| Shares | World stock market (no US) | VXUS | US9229085538 | VXUS | 23.00 |
| Shares | EU | Invesco EURO STOXX High Dividend Low Volatility UCITS ETF | IE00BZ4BMM98 | | 4.00 |
| Money Markets Funds | Money Markets Funds | Xtrackers II EUR Overnight Rate Swap UCITS ETF 1C | LU0290358497 | XEON | 1.50 |
| Money Markets Funds | Money Markets Funds | iShares € Cash UCITS ETF Acc | IE000JJPY166 | YCSH | 1.50 |
| Money Markets Funds | Money Markets Funds | Amundi Smart Overnight Return UCITS ETF Acc | LU1190417599 | CSH2 | 1.50 |
| Money Markets Funds | Money Markets Funds / Short terms bond | iShares EUR Ultrashort Bond UCITS ETF EUR Acc | IE000RHYOR04 | ERNX | 1.50 |
| Bonds | Medium Term Government Bonds (ETF) | iShares Euro Government Bond 5-7yr UCITS ETF | IE00B4WXJG34 | EUN9 | 10.00 |
| Bonds | Medium Term Government Bonds (ETF) | iShares Euro Inflation Linked Government Bond UCITS ETF | IE00B0M62X26 | | 4.00 |
| Bonds | Corporate Bonds | iShares iBonds Dec 2026 Term EUR Corporate UCITS ETF EUR (Acc) | IE000WA6L436 | | 2.00 |
| Bonds | Corporate Bonds | iShares iBonds Dec 2027 Term EUR Corporate UCITS ETF EUR (Acc) | IE000ZO180K5 | | 2.00 |
| Bonds | Corporate Bonds | iShares iBonds Dec 2028 Term EUR Corporate UCITS ETF EUR (Acc) | IE0008UEVOE0 | | 2.00 |
| Commodities | Gold | iShares Physical Gold ETC | IE00B4ND3602 | | 3.00 |
| Commodities | Crypto | BTCW | GB00BJYDH287 | BTCW | 1.00 |
| REIT | REIT (US) | O | | O | 0.50 |
| REIT | REIT (US) | VICI | | VICI | 0.50 |
| REIT | REIT (US) | REET | | REET | 4.00 |

**Total: 100.00%**

## Important Notes

1. **Header Row**: The first row must contain the column headers. The parser will automatically detect the header row.

2. **Asset Type**: Must be one of:
   - Shares (or Stock)
   - Money Markets Funds (or Cash)
   - Bonds
   - Commodities
   - Crypto
   - REIT

3. **Asset Category**: Should match common categories for the asset type. If it doesn't match, you'll get a warning but the target will still be saved. Common categories:
   - **Shares**: US Stock market, World stock market (no US), EU, Global World Market, Emerging Markets
   - **Money Markets Funds**: Money Markets Funds, Money Markets Funds / Short terms bond, Short Term Bonds
   - **Bonds**: Medium Term Government Bonds (ETF), Corporate Bonds, Long Term Government Bonds, Inflation Linked Bonds
   - **Commodities**: Gold, Silver, Crypto, Other Commodities
   - **REIT**: REIT (US), REIT (Global), REIT (EU)

4. **Percentage**: 
   - Can be entered as a number (e.g., `38.00`) or with % sign (e.g., `38.00%`)
   - Should sum to 100% (you'll get a warning if it doesn't)
   - Rows with 0% will be skipped

5. **Optional Columns**: 
   - Instrument, ISIN, and Ticker are optional but helpful for reference
   - Empty cells are fine

6. **Case Sensitivity**: Column names are case-insensitive. The parser will find columns like "Asset Type", "asset type", "ASSET TYPE", etc.

## Creating Your Excel File

1. Open Excel (or Google Sheets, then download as .xlsx)
2. Create a header row with the column names
3. Fill in your target allocations
4. Save as `.xlsx` or `.xls` format
5. Upload via the "Upload Excel" button on the Targets page

## What Happens After Upload

- All existing targets are saved to history
- New targets from the Excel file replace all existing targets
- You'll see warnings if:
  - Asset categories don't match expected values
  - Total percentage doesn't equal 100%
- You'll see errors if:
  - Required columns are missing
  - Invalid percentage values
  - Missing Asset Type

