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
    assert.ok(relErr(integral, p.area) < 0.01, `${p.a.name}: ∫=${integral} alan=${p.area}`);
  }
  run('S.flow=2.0');
  const r2 = run('computeRun()');
  for (const p of r2.eluting) {
    const q = r1.eluting.find(x => x.a.id === p.a.id);
    assert.ok(relErr(q.area / p.area, 2.0) < 1e-9);
  }
});

test('basınç: Darcy — debi ile doğrusal, sıcaklık arttıkça azalır', { todo: 'Faz 4: akış direnci ve sistem (kapiler) basıncı yeniden kalibre edilecek' }, () => {
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

test('Knox: indirgenmiş tabaka yüksekliğinin minimumu ν ≈ 2,5–4,5 aralığında', () => {
  let best = 1e9, nuBest = 0;
  for (let nu = 0.5; nu < 20; nu += 0.01) {
    const h = Math.pow(nu, 1 / 3) + 2 / nu + 0.05 * nu;
    if (h < best) { best = h; nuBest = nu; }
  }
  assert.ok(nuBest > 2.5 && nuBest < 4.5, `ν_opt=${nuBest}`);
  assert.ok(best > 1.5 && best < 3.0, `h_min=${best}`);
});
