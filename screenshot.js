const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/admin');
  
  await page.evaluate(() => {
    sessionStorage.setItem('jalbon_role', 'admin');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button'));
    const monthlyTab = tabs.find(b => b.textContent.includes('월간 치료사 통계'));
    if (monthlyTab) monthlyTab.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.card.text-center.cursor-pointer'));
    if (cards.length > 0) cards[0].click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'monthly_tab_full.png', fullPage: true });
  
  await browser.close();
})();
