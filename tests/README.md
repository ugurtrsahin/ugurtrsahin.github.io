# Simülatör testleri

```bash
node --test tests/*.test.mjs
```

Bağımlılık yoktur; Node.js 20+ yeterlidir. `sim-context.mjs`, `assets/hplc-sim/data.js` ve
`physics.js` dosyalarını tarayıcıdaki gibi klasik betik olarak tek bir V8 bağlamında çalıştırır.

## Kapsam: doğrulama (verification), geçerlilik (validation) değil

Testler **kodun, beyan edilen modeli doğru çözüp çözmediğini** bağımsız kapalı form çözümler
ve tanımlarla karşılaştırır:

| Test | Referans |
|---|---|
| İzokratik t_R | t_R = t0·(1+k) |
| Doğrusal gradient t_R | Snyder kapalı formu (dwell düzeltmeli), ±%0,5 |
| w50, R_s | Gauss tanımı; Ph. Eur. 2.2.46 yarı yükseklik formülü |
| Kütle dengesi | profil integrali = raporlanan alan; alan ∝ 1/F |
| Basınç | Darcy doğrusallığı, izokratikte profil = tek bileşim; tipik büyüklük aralıkları |
| van 't Hoff, Knox, Poppe G | analitik bağıntılar ve sınır değerleri |
| İyonlaşma | pH = pKa'da f_n = 0,5; monotonluk; nötr analitin pH'tan bağımsızlığı |
| Kaçak ışık | düşük A'da doğrusallık, yüksek A'da negatif sapma, monotonluk |
| Gürültü, S/N | tohumla tekrarlanabilirlik; S/N'nin seyreltmeyle doğrusal ölçeklenmesi |
| Dwell | güçlü tutunan analitte Δt_R ≈ ΔV_D/F |
| LSS iki-çalışma uydurması | modelden üretilen t_R çiftinden S ve log k_w'nin geri bulunması |

Basınç için "tipik büyüklük" kontrolleri (ör. 150×4,6 mm, 5 µm, 1 mL/dk, %50 ACN → 60–130 bar)
bir makullük sınamasıdır, ölçüme dayalı bir geçerlilik kanıtı değildir. Modelin belirli bir
kolon/cihaz için geçerliliği, ölçülen alıkonma zamanlarıyla (ör. Sonuçlar sekmesindeki
iki-çalışma LSS uydurması) ayrıca gösterilmelidir.
