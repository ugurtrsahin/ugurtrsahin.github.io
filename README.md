# ugurtrsahin.github.io — HPLC Bilgi Merkezi

Analitik kimya, HPLC metot geliştirme ve ICH Q2(R2) kapsamında metot
validasyonu üzerine Türkçe teknik içerik yayımlayan statik site.
GitHub Pages üzerinde, derleme adımı olmadan yayınlanır: `main` dalına yapılan
push doğrudan yayına gider.

Yerel önizleme:

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## URL şeması

Sayfalar kökte `*.html`, alt ağaçta `hplc-guide/*.html` olarak sunulur.
**Bu şema değiştirilmeyecektir.** Dizin bazlı URL'lere (`/hplc-guide/` gibi)
geçiş mevcut tüm iç ve dış bağlantıları kırar; GitHub Pages sunucu tarafı
301 yönlendirmesi desteklemediği için kırılan bağlantılar telafi edilemez.
Dosya yeniden adlandırma ve taşıma da aynı nedenle yapılmaz.

`sitemap.xml`, `tools/gen-sitemap.sh` ile üretilir (depo kökünden
`sh tools/gen-sitemap.sh`). Betik `git ls-files '*.html'` çıktısını tarar,
`404.html`'i hariç tutar, `index.html`'i site köküne eşler ve `lastmod`
değerini dosyanın son commit tarihinden okur. Sayfa eklendiğinde veya
silindiğinde betik yeniden çalıştırılır; sitemap elle düzenlenmez.

## İçerik envanteri

### Kök

| Dosya | Başlık | Not |
|---|---|---|
| `index.html` | Uğur Sahin | Giriş sayfası, içerik dizini |
| `hplc-guide.html` | HPLC Kılavuzu | Giriş düzeyinde derleme; kapsam notu içerir |
| `hplc-column-selection.html` | HPLC Kolon Seçiminde Rastgele Orman Regresyonu: Kapsam, Sonuçlar ve Sınırlar | Denetim kaydı; metodolojik sınırlar bildirimi içerir |
| `hplc-column-selection/about-data.html` | Data Dosyası Hakkında | Veri seti tanımı |
| `hplc-simulator.html` | İnteraktif HPLC Sistemi — 3D Simülasyon | LSS / van 't Hoff / Knox / Darcy modelleri; model çıktısı, ölçüm değil |
| `404.html` | Sayfa bulunamadı | `noindex, follow`; ortak temaya bağlı değil |

### `hplc-guide/` — kılavuzlar

| Dosya | Başlık |
|---|---|
| `guidelines.html` | Kılavuzlar |
| `info-resources-guide.html` | HPLC Bilgi Kaynakları Rehberi |
| `troubleshooting-guide.html` | HPLC Sorun Çözme Rehberi |
| `method-development-guide.html` | HPLC Metod Geliştirme Rehberi |
| `validation-guide.html` | HPLC Validasyon Rehberi |
| `detectors-guide.html` | HPLC Dedektörlerinin Bilimsel Temelleri ve Özellikleri |
| `detectors/uv-visible-detectors.html` | UV-Görünür Dedektörlerin Bilimsel Temelleri ve Teorileri |
| `detectors/dad-detectors.html` | Diyot Dizisi Dedektörlerin (DAD) Bilimsel Temelleri ve Teorileri |
| `pda-peak-purity-analysis.html` | PDA Veri Analizinde Pik Saflığı Analizinin Temelleri |

### `hplc-guide/validation/` — validasyon ve SOP taslakları

| Dosya | Başlık |
|---|---|
| `acceptance-criteria.html` | Kabul Kriterleri ve Hesaplama Yöntemleri |
| `procedure-4.html` | 4. Prosedür |
| `data-analysis-5.html` | 5. Veri Analizi ve Raporlama |
| `sop-main.html` | Validasyon için Standart Operasyon Prosedürü (SOP) |
| `sop/preparation.html` | Ön Hazırlık SOP |
| `sop/system-suitability.html` | Sistem Uygunluk Testi SOP |
| `sop/specificity.html` | Özgüllük (Specificity) SOP |
| `sop/linearity.html` | Doğrusallık (Linearity) SOP |
| `sop/range.html` | Aralık (Range) SOP |
| `sop/accuracy.html` | Doğruluk (Accuracy) SOP |
| `sop/precision.html` | Kesinlik (Precision) SOP |
| `sop/repeatability.html` | Tekrarlanabilirlik (Repeatability) SOP |
| `sop/intermediate-precision.html` | Ara Kesinlik (Intermediate Precision) SOP |
| `sop/lod.html` | Tespit Limiti (LOD) SOP |
| `sop/loq.html` | Kantitasyon Limiti (LOQ) SOP |
| `sop/robustness.html` | Sağlamlık (Robustness) SOP |
| `sop/data-analysis-reporting.html` | Veri Analizi ve Raporlama SOP |
| `sop/records.html` | Kayıtlar SOP |

### `hplc-guide/shimadzu/` — LabSolutions

| Dosya | Başlık |
|---|---|
| `../shimadzu-software-guide.html` | Shimadzu LabSolutions™ Yazılımı: Gelişmiş Kullanıcı ve Uzman Rehberi |
| `software-components.html` | Yazılım Bileşenleri (Software Components) |
| `technical-terms.html` | Teknik Terimler |
| `spectral-similarity.html` | Spektral Benzerlik (Similarity) Temelleri |
| `data-analysis-methods.html` | LabSolutions'ta Veri Analiz Yöntemleri |
| `data-processing.html` | Veri İşleme ve Analiz |
| `data-processing/peak-identification.html` | Pik Tanımlama |
| `data-processing/peak-purity-analysis.html` | Pik Saflığı Analizi |
| `data-processing/spectral-similarity-peak-purity.html` | Spektral Benzerlik ve Pik Saflığı Analizi |
| `data-processing/ipdea-method.html` | i-PDeA (Türev Spektrum Kromatogram Yöntemi) |
| `data-processing/ipdea/spektral-veri-toplama-…​.html` | Spektral Veri Toplama |
| `data-processing/ipdea/turev-spektrumlarn-hesaplanmas-…​.html` | Türev Spektrumların Hesaplanması |

## Editoryal kurallar

Bu depodaki içerik, regüle ilaç kalite kontrolü pratiğinde savunulabilir olmak
zorundadır. Aşağıdaki kurallar bağlayıcıdır.

1. **Ampirik dürüstlük.** Bir sayfada raporlanan her sayı, o sayfada verilen
   kod veya prosedürün gerçekten ürettiği sayı olmalıdır. Metin ile kod
   arasındaki her çelişki, metin düzeltilerek giderilir; kod veya çıktı
   ampirik kayıttır ve geçmişe dönük değiştirilmez.
2. **Negatif sonuç bildirimi.** Bir yöntemin kusurları, sonuçlarıyla aynı
   sayfada ve aynı görünürlükte yazılır. Kusurlu bir çalışma yayından
   kaldırılmaz; düzeltilir ve düzeltildiği belgelenir. Bir analiz geçersizse
   bunu söyleyen bir bildirim sayfanın en üstüne konur.
3. **Ölçülmemiş olan "ölçülmemiştir" diye yazılır.** Süre kazancı, maliyet
   düşüşü, verimlilik artışı gibi iddialar, karşılaştırmalı bir ölçüm
   yapılmadıysa iddia olarak değil, ölçüm yapılmadığı belirtilerek yazılır.
4. **Karşılaştırma yoksa üstünlük iddiası yoktur.** Bir yöntemin bir diğerine
   üstünlüğü, ancak ikisini aynı veri üzerinde karşılaştıran bir deney
   kurulduysa yazılabilir.
5. **Kaynaksız bilimsel iddia eklenmez.** Doğruluğundan emin olunmayan teknik
   bir ifade yazılmaz; metinden çıkarılır. Sayısal aralıklar, hangi koşul
   altında (sıcaklık, tampon, faz kimyası) geçerli olduğu belirtilerek verilir.
6. **Pazarlama dili yasaktır.** "Devrim", "güçlü araç", "yüksek doğrulukla",
   "başarıyla tahmin etti" gibi niteliksiz ifadeler kullanılmaz. Performans
   yalnızca nicel olarak raporlanır: R², RMSE, MSE, %RSD, n, ve hedef
   değişkenin dağılımı (ortalama ve standart sapma) birlikte verilir. Bir
   hata metriği, tek başına değil, hedefin ölçeğiyle karşılaştırılarak sunulur.
7. **Terminoloji.** Validasyon terimleri ICH Q2(R2) (2023), kromatografik
   terimler EP 2.2.46 ve USP &lt;621&gt; ile uyumlu kullanılır. Özellikle:
   - *Specificity* → **özgüllük / seçicilik** (asla "özgünlük"; Türkçede
     özgünlük = originality).
   - *Ruggedness* bağımsız bir validasyon parametresi değildir; kesinliğin
     bileşenidir ve **ara kesinlik (intermediate precision)** olarak yazılır.
     Terim USP &lt;1225&gt; mirasıdır.
   - *Robustness* → **sağlamlık**; ara kesinlikten ayrı bir parametredir.
   - Çözelti stabilitesi bağımsız bir validasyon parametresi değildir;
     metodun uygulanabilirlik koşulu olarak belgelenir.
   - Kromatografik ayırma ortamı **kolon**'dur, "sütun" değildir. "Sütun"
     yalnızca veri çerçevesi/tablo bağlamında kullanılır.
8. **Regüle ortam uyarısı.** Bu sitedeki hiçbir sayfa, GMP kapsamında metot
   validasyonu, ruhsat dosyası veya farmakope uyumu için referans belge
   değildir. Esas alınacak dokümanlar ICH Q2(R2), EP 2.2.46 ve USP &lt;621&gt;
   orijinal metinleridir.

## Tasarım

Site teması (`assets/theme.css`, `assets/theme.js`) dondurulmuştur. İçerik
düzeltmeleri yalnızca metin düğümlerini, meta etiket değerlerini ve yeni
dosyaları hedefler; CSS, sınıf adları, renkler, fontlar ve layout
değiştirilmez. Yeni blok eklenirken mevcut sınıf adlandırma düzenine uyulur
(`page`, `page-body`, `bulleted-list`, `link-to-page`, `toggle`); yeni CSS
yazılmaz. Tek istisna `404.html`'dir: ortak temaya bağlı değildir ve kendi
içinde minimal stillenmiştir.
