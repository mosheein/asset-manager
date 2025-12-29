const fs = require('fs');
const { parseIBStatement } = require('./dist/parsers/ibStatementParser');

async function testParser() {
  try {
    const pdfBuffer = fs.readFileSync('./ActivityStatement.202502.pdf');
    console.log('PDF file size:', pdfBuffer.length, 'bytes');
    
    const parsed = await parseIBStatement(pdfBuffer);
    
    console.log('\n=== PARSING RESULTS ===');
    console.log('Account ID:', parsed.accountId);
    console.log('Statement Date:', parsed.statementDate);
    console.log('Base Currency:', parsed.baseCurrency);
    console.log('Holdings found:', parsed.holdings.length);
    console.log('Cash:', parsed.cash);
    console.log('Total Value:', parsed.totalValue);
    
    if (parsed.holdings.length > 0) {
      console.log('\n=== FIRST 10 HOLDINGS ===');
      parsed.holdings.slice(0, 10).forEach((h, i) => {
        console.log(`${i + 1}. ${h.symbol}: Qty=${h.quantity}, Price=$${h.price}, Value=$${h.value}, Type=${h.assetType}`);
      });
    } else {
      console.log('\n=== NO HOLDINGS FOUND ===');
      console.log('This means the parser could not extract any holdings from the PDF.');
    }
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

testParser();

