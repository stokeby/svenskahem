import express from 'express';
import puppeteer from 'puppeteer-core';
import chromium from 'chromium';

const app = express();
const PORT = process.env.PORT || 3000;

let cachedListings = [];
let lastUpdated = 0;
const CACHE_DURATION_MS = 10 * 60 * 1000;

async function fetchListings() {
  let browser;
  try {
    const executablePath = chromium.path || '/usr/bin/google-chrome' || '/usr/bin/chromium-browser';

    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 0
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    );

    await page.goto('https://www.svenskahem.se/produkter/soffor', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const html = await page.content();
    console.log('DOM-innehåll:', html.slice(0, 1000));

    await page.waitForFunction(
      () => document.querySelectorAll('.product-list .product-tile').length > 0,
      { timeout: 40000 }
    );

    const listings = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.product-list .product-tile')).slice(0, 20).map(el => {
        const title = el.querySelector('.product-title')?.textContent.trim();
        const price = el.querySelector('.product-price')?.textContent.trim();
        const img = el.querySelector('img')?.src;
        const link = "https://www.svenskahem.se" + el.querySelector('a')?.getAttribute('href');
        return { title, price, img, link };
      });
    });

    cachedListings = listings;
    lastUpdated = Date.now();
    console.log(`[${new Date().toISOString()}] Uppdaterade ${listings.length} soffor`);
  } catch (e) {
    console.error('Fel vid hämtning:', e);
  } finally {
    if (browser) await browser.close();
  }
}

app.get('/api/listings', async (req, res) => {
  if (Date.now() - lastUpdated > CACHE_DURATION_MS || cachedListings.length === 0) {
    await fetchListings();
  }
  res.json(cachedListings);
});

setInterval(fetchListings, CACHE_DURATION_MS);
app.use(express.static('public'));
app.listen(PORT, () => {
  console.log(`Server körs på port ${PORT}`);
  fetchListings();
});