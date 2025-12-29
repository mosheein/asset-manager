const fs = require('fs');
const pdfParse = require('pdf-parse');

async function testDetailed() {
  const pdfBuffer = fs.readFileSync('./ActivityStatement.202502.pdf');
  const data = await pdfParse(pdfBuffer);
  const text = data.text;
  
  const openPositionsMatch = text.match(/Open Positions[\s\S]*?(?=Total|Notes|$)/i);
  if (openPositionsMatch) {
    const section = openPositionsMatch[0];
    const lines = section.split('\n').map(l => l.trim()).filter(l => l);
    
    console.log('Total lines in Open Positions:', lines.length);
    console.log('\nFirst 50 lines:');
    lines.slice(0, 50).forEach((line, i) => {
      console.log(`${i}: "${line}"`);
    });
  }
}

testDetailed();

