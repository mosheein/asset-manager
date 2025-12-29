const fs = require('fs');
const pdfParse = require('pdf-parse');

async function testFull() {
  const pdfBuffer = fs.readFileSync('./ActivityStatement.202502.pdf');
  const data = await pdfParse(pdfBuffer);
  const text = data.text;
  
  // Find Open Positions and see what comes after
  const openPosIndex = text.indexOf('Open Positions');
  if (openPosIndex >= 0) {
    const afterOpenPos = text.substring(openPosIndex, openPosIndex + 5000);
    console.log('Text around Open Positions (5000 chars):');
    console.log(afterOpenPos);
    
    // Look for other sections
    console.log('\n\n=== Looking for other sections ===');
    const sections = ['Open Positions', 'Mark-to-Market', 'Total', 'USD', 'EUR', 'Stocks'];
    sections.forEach(section => {
      const matches = text.match(new RegExp(section, 'gi'));
      if (matches) {
        console.log(`Found "${section}": ${matches.length} times`);
      }
    });
    
    // Look for symbol patterns
    console.log('\n\n=== Looking for symbols ===');
    const symbols = ['ACWD', 'BEAM', 'BND', 'BTC', 'COIN', 'GBTC', 'GLD', 'GS', 'JPM', 'MELI', 'SCHD', 'SGOV', 'SPY', 'TIP', 'USAG', 'VT', 'VTI', 'VWRA', 'IWDA', 'XDWD'];
    symbols.forEach(symbol => {
      if (text.includes(symbol)) {
        const index = text.indexOf(symbol);
        const context = text.substring(Math.max(0, index - 50), Math.min(text.length, index + 100));
        console.log(`Found ${symbol} at position ${index}: ...${context}...`);
      }
    });
  }
}

testFull();

