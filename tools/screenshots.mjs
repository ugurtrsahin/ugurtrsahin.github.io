// Simülatörün sabit kamera açılarından ekran görüntülerini alır (görsel regresyon / önce-sonra).
// Kullanım:  python3 -m http.server 8765 &   sonra
//            node tools/screenshots.mjs [çıktı_dizini] [http://localhost:8765/hplc-simulator.html?…]
// Gereksinim: Playwright (global kurulu; PLAYWRIGHT_PATH ile modül yolu verilebilir) ve Chromium.
// WebGL, GPU'suz ortamda SwiftShader ile yazılımsal çizilir; fps değerleri bu yüzden temsilî değildir.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_PATH ||
  (execSync('npm root -g').toString().trim() + '/playwright');
const { chromium } = require(pwPath);

const outDir = process.argv[2] || 'screenshots';
const url = process.argv[3] || 'http://localhost:8765/hplc-simulator.html';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));

await page.goto(url);
try {
  // V klasik betikte üst düzey const olduğu için window özelliği değildir; typeof ile sorgulanır
  await page.waitForFunction(() => typeof V !== 'undefined' && V.ok, null, { timeout: 120000 });
} catch (e) {
  console.log(JSON.stringify({ url, error: String(e), logs }, null, 2));
  await page.screenshot({ path: `${outDir}/00-hata.png` });
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(2500);
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); };
await shot('01-genel');

const info = await page.evaluate(() => ({
  rig: V.rig, quality: V.quality,
  calls: V.renderer.info.render.calls, triangles: V.renderer.info.render.triangles,
  geometries: V.renderer.info.memory.geometries, textures: V.renderer.info.memory.textures
}));

// Analizi başlat, simülasyonu hızlandır ve bantlar kolondayken fırına odaklan
await page.evaluate(() => { S.speed = 60; startRun(); selectModule('column', true); });
await page.waitForTimeout(3500);
await shot('02-kolon-analiz');
await page.evaluate(() => { selectModule('autosampler', true); });
await page.waitForTimeout(3000);
await shot('03-otosampler');
await page.evaluate(() => { selectModule('pump', true); });
await page.waitForTimeout(3000);
await shot('04-pompa');
await page.evaluate(() => { selectModule('detector', true); });
await page.waitForTimeout(3000);
await shot('05-dedektor');
await page.evaluate(() => { S.t = S.run - 0.01; camHome(); S.selected = null; applyHighlight(); });
await page.waitForTimeout(3500);
await shot('06-sonuc');
await page.evaluate(() => { setQuality('std'); });
await page.waitForTimeout(1500);
await shot('07-standart-kalite');

console.log(JSON.stringify({ url, info, logs }, null, 2));
await browser.close();
