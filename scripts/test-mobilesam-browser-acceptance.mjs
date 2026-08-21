import { chromium } from 'playwright';
import { createServer } from 'vite';

const fixtures = JSON.parse(process.env.MOBILESAM_ACCEPTANCE_FIXTURES ?? '[]');
if (fixtures.length !== 4 || !['person/clothing', 'car/object', 'animal', 'complex-background'].every(category => fixtures.some(item => item.category === category))) throw new Error('MOBILESAM_ACCEPTANCE_FIXTURES must contain the four required real-image categories');
if (!fixtures.some(item => item.points.some(point => point.label === 'NEGATIVE') && item.points.filter(point => point.label === 'POSITIVE').length > 1)) throw new Error('One fixture must contain two positive points and a negative point');
const server = await createServer({ server: { port: 4174 } }); await server.listen(); let browser;
try {
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.goto('http://localhost:4174/tests/mobile-sam-browser-acceptance.html');
  const report = await page.evaluate(async input => globalThis.runMobileSamAcceptance(input), fixtures); console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
