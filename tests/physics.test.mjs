// Fizik/kimya modelinin DOĞRULAMA (verification) testleri: kodun, beyan edilen modeli
// doğru çözüp çözmediği bağımsız kapalı form çözümlerle karşılaştırılır.
// Bu testler modelin gerçeği temsil ettiğini (validation) göstermez; bkz. tests/README.md.
// Çalıştırma: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSim } from './sim-context.mjs';

const sim = loadSim();
const { run, reset } = sim;
const relErr = (a, b) => Math.abs(a - b) / Math.abs(b);

test('kolon geometrisi: V_M = π r² L ε_T ve t0 = V_M / F', () => {
  reset();
  run("S.col='c18_150'; S.flow=1.0");
  const g = run('colGeom()');
  const vm = Math.PI * 0.23 ** 2 * 15 * 0.65;
  assert.ok(relErr(g.Vm, vm) < 1e-12);
  assert.ok(relErr(g.t0, vm / 1.0) < 1e-12);
  run('S.flow=2.0');
  assert.ok(relErr(run('colGeom().t0'), vm / 2.0) < 1e-12);
});

test('izokratik alıkonma: integratör t_R = t0·(1+k) sonucunu verir (±%0,2)', () => {
  reset();
  run("S.mode='iso'; S.isoB=40; S.run=40; S.temp=30");
  const r = run('computeRun()');
  const t0 = r.t0;
  for (const p of r.eluting) {
    const k = run(`kOf(ANALYTES.find(a=>a.id===${p.a.id}), 0.40, 303.15)`);
    const expected = t0 * (1 + k);
    assert.ok(relErr(p.tRideal, expected) < 0.002, `${p.a.name}: ${p.tRideal} ≠ ${expected}`);
  }
});

test('doğrusal gradient: Snyder kapalı formu ile uyum (±%0,5)', () => {
  // tR = (t0/b)·log10(2,3·k0·b·(1 − tD/(t0·k0)) + 1) + t0 + tD,  b = S_eff·Δφ·t0/tG
  // Koşullar: gradient analiz boyunca sürer (plato yok), analit dwell süresinde elüe olmaz.
  reset();
  run("S.mode='grad'; S.grad=[{t:0,b:20},{t:30,b:100}]; S.run=30; S.temp=30; S.flow=1.0");
  const r = run('computeRun()');
  const t0 = r.t0, tD = r.tD, tG = 30, dphi = 0.80;
  let checked = 0;
  for (const p of r.peaks.filter(q => q.eluted)) {
    const a = `ANALYTES.find(x=>x.id===${p.a.id})`;
    const k0 = run(`kOf(${a}, 0.20, 303.15)`);
    // Etkin eğim: log k'nın φ'ye göre türevi (sayısal) — çözücü gücü ve iyonlaşma terimlerini kapsar
    const h = 1e-4;
    const Seff = (Math.log10(run(`kOf(${a}, 0.30-${h}, 303.15)`)) - Math.log10(run(`kOf(${a}, 0.30+${h}, 303.15)`))) / (2 * h);
    if (tD / (t0 * k0) > 0.5) continue;            // dwell sırasında anlamlı göç: formül varsayımı dışı
    const b = Seff * dphi * t0 / tG;
    const tR = (t0 / b) * Math.log10(2.3 * k0 * b * (1 - tD / (t0 * k0)) + 1) + t0 + tD;
    assert.ok(relErr(p.tRideal, tR) < 0.005, `${p.a.name}: model ${p.tRideal.toFixed(3)} / Snyder ${tR.toFixed(3)}`);
    checked++;
  }
  assert.ok(checked >= 2, 'en az iki analit karşılaştırılmalı');
});

test('pik genişliği: Gauss profilinde w50 = 2·√(2 ln 2)·σ (±%0,5)', () => {
  const n = 4001, sigma = 0.05, t0 = 2;
  const out = run(`(()=>{const n=${n}, time=new Float64Array(n), prof=new Float64Array(n);
    for(let i=0;i<n;i++){ time[i]=i*0.001; prof[i]=Math.exp(-0.5*((time[i]-${t0})/${sigma})**2); }
    let mi=0; for(let i=1;i<n;i++) if(prof[i]>prof[mi]) mi=i;
    return widthAt(prof,time,mi,0.5); })()`);
  assert.ok(relErr(out, 2 * Math.sqrt(2 * Math.LN2) * sigma) < 0.005);
});

test('çözünürlük: EP yarı yükseklik formülü Gauss pikleri için taban formülüne eşdeğer', () => {
  // Rs_EP = 1,18·Δt/(w50,1+w50,2);  Rs_taban = Δt/(2(σ1+σ2)). Gauss için oran 1,18/(2√(2ln2))·2 ≈ 1,0022
  const ratio = (1.18 / (2 * Math.sqrt(2 * Math.LN2))) * 2;
  assert.ok(Math.abs(ratio - 1) < 0.003);
});

test('kütle dengesi: profil integrali raporlanan alana eşit, alan ∝ 1/F (derişime duyarlı dedektör)', () => {
  reset();
  run("S.mode='iso'; S.isoB=45; S.run=40; S.flow=1.0");
  const r1 = run('computeRun()');
  for (const p of r1.eluting) {
    let s = 0; for (let i = 0; i < r1.n; i++) s += p.prof[i];
    const integral = s * r1.dtGrid * 60;              // mAU·s
    assert.ok(relErr(integral, p.area) < 1e-9, `${p.a.name}: ∫=${integral} alan=${p.area}`);
    assert.ok(relErr(p.area, p.areaTrue) < 0.01, `${p.a.name}: doğrusal bölgede gözlenen ≈ gerçek alan`);
  }
  run('S.flow=2.0');
  const r2 = run('computeRun()');
  for (const p of r2.eluting) {
    const q = r1.eluting.find(x => x.a.id === p.a.id);
    assert.ok(relErr(q.areaTrue / p.areaTrue, 2.0) < 1e-9);
    assert.ok(relErr(q.area / p.area, 2.0) < 0.01);
  }
});

test('basınç: Darcy + Poiseuille — debi ile doğrusal, sıcaklık arttıkça azalır, tipik büyüklükte', () => {
  reset();
  run("S.mode='iso'; S.isoB=50; S.flow=1.0; S.temp=30");
  const p1 = run('pressureBar(0.5)');
  run('S.flow=2.0');
  const p2 = run('pressureBar(0.5)');
  assert.ok(relErr(p2 / p1, 2.0) < 1e-9);
  run('S.temp=60');
  assert.ok(run('pressureBar(0.5)') < p2);
  // Tipik değer kontrolü: 150×4,6 mm 5 µm, 1 mL/dk, %50 ACN, 30 °C → ~60–130 bar
  run('S.flow=1.0; S.temp=30');
  const p = run('pressureBar(0.5)');
  assert.ok(p > 60 && p < 130, `basınç ${p} bar`);
  // İzokratik modda kolon boyunca bileşim sabit: profil integrali tek bileşimli hesaba eşit
  run("S.mode='iso'; S.isoB=50");
  assert.ok(relErr(run('pressureAt(3.0)'), run('pressureBar(0.5)')) < 1e-9);
  // UHPLC: 50×2,1 mm 1,8 µm, 0,5 mL/dk → yüzlerce bar
  run("S.col='c18_50'; S.flow=0.5");
  const pu = run('pressureBar(0.5)');
  assert.ok(pu > 250 && pu < 700, `UHPLC basıncı ${pu} bar`);
});

test("van 't Hoff: k(T) oranı ΔH° ile tutarlı", () => {
  reset();
  const a = 'ANALYTES[3]';
  const k30 = run(`kOf(${a}, 0.5, 303.15)`), k50 = run(`kOf(${a}, 0.5, 323.15)`);
  const dH = run(`${a}.dH`) * 1000;
  const expected = Math.pow(10, (-dH / (2.303 * 8.314)) * (1 / 323.15 - 1 / 303.15));
  assert.ok(relErr(k50 / k30, expected) < 1e-9);
  assert.ok(k50 < k30, 'ekzotermik transferde sıcaklık artışı k değerini düşürür');
});

test('Knox: tabaka yüksekliği minimumu ν ≈ 2,5–4,5; C terimi k ile artar', () => {
  for (const k of [0, 1, 10]) {
    const C = run(`knoxC(${k})`);
    let best = 1e9, nuBest = 0;
    for (let nu = 0.5; nu < 20; nu += 0.01) {
      const h = Math.pow(nu, 1 / 3) + 2 / nu + C * nu;
      if (h < best) { best = h; nuBest = nu; }
    }
    assert.ok(nuBest > 2.5 && nuBest < 4.5, `k=${k}: ν_opt=${nuBest}`);
    assert.ok(best > 1.5 && best < 3.0, `k=${k}: h_min=${best}`);
  }
  assert.ok(run('knoxC(10)') > run('knoxC(1)') && run('knoxC(1)') > run('knoxC(0)'));
});

test('iyonlaşma: pH = pKa iken f_n = 0,5; asit alıkonması pH ile azalır, nötr analit etkilenmez', () => {
  reset();
  const nap = 'ANALYTES[2]', caf = 'ANALYTES[1]';
  // φ=0'da s_s düzeltmesi yok: pH = pKa → yarı yarıya iyonik
  run("AQUEOUS.water.pH = ANALYTES[2].pKa");
  assert.ok(Math.abs(run(`fracNeutral(${nap}, 0)`) - 0.5) < 1e-12);
  const kAt = (pH) => { run(`AQUEOUS.water.pH = ${pH}`); return run(`kOf(${nap}, 0.4, 303.15)`); };
  const k25 = kAt(2.5), k45 = kAt(4.5), k65 = kAt(6.5);
  assert.ok(k25 > k45 && k45 > k65, `naproksen k: ${k25}, ${k45}, ${k65}`);
  run('AQUEOUS.water.pH = 2.5'); const c1 = run(`kOf(${caf}, 0.4, 303.15)`);
  run('AQUEOUS.water.pH = 6.5'); const c2 = run(`kOf(${caf}, 0.4, 303.15)`);
  assert.ok(relErr(c1, c2) < 1e-3, 'kafein (pKa 0,6) bu aralıkta nötrdür');
  run('AQUEOUS.water.pH = 2.7');
});

test('organik modifiyer: asidin s_s pKa artışı tamponun pH artışından büyük → nötr oran φ ile artar', () => {
  reset();
  run("S.solvA='ammonium'");
  const f0 = run('fracNeutral(ANALYTES[2], 0.0)'), f6 = run('fracNeutral(ANALYTES[2], 0.6)');
  assert.ok(f6 > f0, `f_n(0)=${f0}, f_n(0,6)=${f6}`);
});

test('Poppe G: sınır değerleri (b → 0: G → 1; k0·b → ∞: G → √(7/3)/2)', () => {
  assert.equal(run('poppeG(10, 0)'), 1);
  assert.ok(Math.abs(run('poppeG(1e6, 10)') - Math.sqrt(7 / 3) / 2) < 1e-4);
  const g1 = run('poppeG(5, 0.05)'), g2 = run('poppeG(5, 0.5)');
  assert.ok(g1 < 1 && g2 < g1, 'G, gradient diklik parametresiyle azalır');
});

test('kaçak ışık: düşük absorbansta doğrusal, yüksek absorbansta negatif sapma', () => {
  assert.ok(relErr(run('strayLight(100)'), 100) < 2e-3);
  assert.ok(relErr(run('strayLight(1000)'), 1000) < 5e-3);
  assert.ok(run('strayLight(3000)') < 2900, 'yaklaşık 3 AU\'da belirgin doygunluk');
  let prev = -1;
  for (let a = 0; a <= 4000; a += 50) { const v = run(`strayLight(${a})`); assert.ok(v > prev); prev = v; }
});

test('gürültü: aynı tohum aynı kromatogramı, farklı tohum farklı gürültüyü verir', () => {
  reset();
  const a = run('Array.from(computeRun().total)');
  const b = run('Array.from(computeRun().total)');
  assert.deepEqual(a, b);
  run('S.seed = 777');
  const c = run('Array.from(computeRun().total)');
  assert.notDeepEqual(a, c);
});

test('S/N: seyreltme ile doğrusal ölçeklenir (aynı gürültü) ve EP tanımına uyar', () => {
  reset();
  const r1 = run('computeRun()');
  run('S.dil = 0.1');
  const r2 = run('computeRun()');
  for (const p of r2.eluting) {
    const q = r1.eluting.find(x => x.a.id === p.a.id);
    assert.ok(relErr(p.SN / q.SN, 0.1) < 0.02, `${p.a.name}: ${p.SN / q.SN}`);
    assert.ok(relErr(p.SN, 2 * p.height / p.noisePP) < 1e-12);
  }
});

test('dwell hacmi: güçlü tutunan analitte t_R kayması ≈ ΔV_D / F', () => {
  reset();
  run('S.dwell = 0.2'); const a = run('computeRun()');
  run('S.dwell = 1.0'); const b = run('computeRun()');
  const id = 4;                                       // ibuprofen
  const d = b.eluting.find(p => p.a.id === id).tRideal - a.eluting.find(p => p.a.id === id).tRideal;
  assert.ok(relErr(d, 0.8 / 1.0) < 0.1, `Δt_R = ${d} dk`);
});

test('LSS iki-çalışma uydurması: modelden üretilen t_R çiftinden S ve log k_w geri bulunur', () => {
  // Nötr analit (kafein), doğrusal %5 → %95 gradientler, tG = 10 ve 30 dk
  reset();
  const tr = (tG) => { run(`S.mode='grad'; S.grad=[{t:0,b:5},{t:${tG},b:95}]; S.run=${tG}`);
                       return run('computeRun()').peaks.find(p => p.a.id === 2).tRideal; };
  const tR1 = tr(10), tR2 = tr(30);
  const t0 = run('colGeom().t0'), tD = run('dwellTime()');
  const fit = run(`fitLSS2(10, ${tR1}, 30, ${tR2}, 0.05, 0.95, ${t0}, ${tD})`);
  // Gerçek değerler sıcaklık düzeltmesi dahil (30 °C referans → düzeltme 0)
  assert.ok(relErr(fit.S, 3.50) < 0.05, `S=${fit.S}`);
  assert.ok(Math.abs(fit.logkw - 1.15) < 0.12, `log kw=${fit.logkw}`);
});
