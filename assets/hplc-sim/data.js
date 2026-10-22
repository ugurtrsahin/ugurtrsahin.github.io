/* =====================================================================================
   İNTERAKTİF HPLC SİSTEMİ — 3D SİMÜLASYON
   Tek dosyalık, backend gerektirmeyen uygulama.

   Bölümler:
     1) Veri katmanı  : modül bilgileri, analit özellikleri, kolon tanımları, eğitim adımları
     2) Fizik/kimya   : LSS alıkonma modeli, van Deemter verim modeli, Darcy basınç modeli
     3) 3B sahne      : Three.js ile modüler cihaz geometrisi, kapiler bağlantılar, akış partikülleri
     4) Etkileşim     : orbit/pan/zoom kamera, raycast ile modül seçimi, eğitim modu kamera geçişleri
     5) Kromatogram   : Canvas 2D üzerinde gerçek zamanlı sinyal, zoom/pan, pik etiketleme, tooltip
     6) UI bağlama    : kontrol paneli, sistem durumu LED'leri, sonuç tabloları
   ===================================================================================== */
'use strict';

/* ==========================================================================
   1) VERİ KATMANI
   ========================================================================== */

/* --- Modül bilgi kartları (Türkçe teknik içerik) --- */
const MODULES = {
  bottles: {
    title: 'Mobil Faz Hazneleri',
    kicker: 'Solvent Reservuarları',
    desc: 'Mobil fazın (A: sulu faz, B: organik faz) bulunduğu, genellikle 1 L borosilikat cam şişelerdir. ' +
          'Şişe kapaklarındaki emiş hatları PTFE/PEEK malzemedendir ve uçlarında 2–10 µm gözenekli paslanmaz çelik ' +
          'sinter filtre (frit) bulunur.',
    principle: [
      'Emiş hattı hidrostatik olarak pompanın giriş valfini besler; bu nedenle şişeler daima pompa seviyesinin üzerinde durur.',
      'Frit, partikül kaynaklı giriş valfi tıkanmasını ve kolon başı kirlenmesini engeller.',
      'Tampon içeren sulu fazlarda mikrobiyal üreme riski nedeniyle günlük hazırlama ve şişe yıkama esastır.',
      'Organik oranı yüksek karışımlarda tampon çökelmesi (özellikle fosfat + >%60 ACN) sistemi tıkayabilir.'
    ],
    specs: [['Tipik hacim','1 L (cam)'],['Emiş filtresi','2–10 µm sinter'],['Hat malzemesi','PTFE / PEEK'],
            ['Konum','Sistemin en üstünde'],['Kritik risk','Kuru kalma, tampon çökelmesi']]
  },
  degasser: {
    title: 'Degazör',
    kicker: 'Çevrimiçi Vakum Degazörü',
    desc: 'Mobil faz içinde çözünmüş gazları (özellikle O₂ ve N₂) pompaya girmeden önce uzaklaştırır. ' +
          'Modern sistemlerde gaz geçirgen membran (AF-2400 tipi amorf floropolimer) kanallarından geçen sıvı, ' +
          'membranın dış yüzeyindeki vakum odası sayesinde gazını kaybeder.',
    principle: [
      'Henry yasası gereği çözünmüş gaz miktarı kısmi basınçla orantılıdır; vakum odası kısmi basıncı düşürerek gazı sıvıdan çeker.',
      'Degaze edilmemiş mobil fazda pompa başında kabarcık oluşumu debi kararsızlığına ve basınç dalgalanmasına yol açar.',
      'Dedektör hücresinde kabarcık, taban çizgisinde ani spike ve gürültü artışı olarak görülür.',
      'Su/ACN gibi karışımlarda karıştırma sırasında çözünürlük düştüğü için kabarcık oluşumu tipiktir; degazör bunu önler.'
    ],
    specs: [['Prensip','Membran + vakum'],['İç hacim','~500 µL/kanal'],['Kanal sayısı','2–4'],
            ['Etki','Taban gürültüsü ↓, debi kararlılığı ↑'],['Alternatif','Helyum ile süpürme (sparging)']]
  },
  pump: {
    title: 'Pompa',
    kicker: 'İkili Pistonlu Yüksek Basınç Pompası',
    desc: 'Mobil fazı sabit ve pulsasyonsuz debide, kolonun oluşturduğu geri basınca karşı iter. ' +
          'Seri veya paralel çalışan iki piston, bir pistonun emiş yaptığı fazda diğerinin basması sayesinde ' +
          'sürekli akış üretir. Gradient, düşük basınç tarafındaki oransal valf (LPG) veya iki ayrı pompa başı (HPG) ile oluşturulur.',
    principle: [
      'Kontrol sabit debidir (sabit basınç değil); basınç, sistemin akış direncine göre türeyen bir çıktıdır.',
      'Darcy yasası: ΔP = φ·η·L·u / d_p². Basınç; viskozite, kolon uzunluğu, lineer hız ile doğru, partikül çapının karesi ile ters orantılıdır.',
      'Piston geçişlerindeki pulsasyon, sönümleyici (damper) ve piston hareket profili ile bastırılır; artık pulsasyon dedektörde periyodik gürültü verir.',
      'Check-valf sızıntısı ve piston keçesi aşınması, debinin sistematik düşmesi ve alıkonma zamanı kayması olarak görünür.'
    ],
    specs: [['Debi aralığı','0,001–10 mL/dk'],['Maks. basınç','400 bar (HPLC) / 1300 bar (UHPLC)'],
            ['Debi doğruluğu','±%1'],['Gradient tipi','LPG (kuaterner) veya HPG (binary)'],
            ['Dwell hacmi','LPG ~0,6–1,2 mL, HPG ~0,1–0,4 mL']]
  },
  autosampler: {
    title: 'Otosampler',
    kicker: 'Otomatik Enjeksiyon Ünitesi',
    desc: 'Numuneyi vialden ölçülü hacimde çekip, altı yollu (six-port) enjeksiyon valfi üzerinden akış hattına ' +
          'aktarır. LOAD konumunda numune döngüye (loop) doldurulur; INJECT konumunda valf döner ve mobil faz ' +
          'döngüdeki numuneyi kolona taşır.',
    principle: [
      'Enjeksiyon anı kromatogramın t = 0 referansıdır; valf dönüşü sistemde küçük bir basınç sıçraması yaratır.',
      'Sabit döngü (fixed loop) tam dolumda hacimsel doğruluğu yüksektir; kısmi dolum (partial loop) esnek hacim sağlar ama tekrarlanabilirliği biraz düşüktür.',
      'Enjeksiyon hacmi arttıkça hacimsel bant genişlemesi başlar: σ_inj = V_inj/√12; bu terim özellikle dar kolonlarda (2,1 mm) belirleyicidir.',
      'Numune çözücüsünün mobil fazdan güçlü olması, pik bozulmasına (fronting/split) yol açar — çözücü uyumu kritiktir.'
    ],
    specs: [['Enjeksiyon hacmi','0,1–100 µL'],['Taşıma (carry-over)','< %0,05'],['Tekrarlanabilirlik','RSD < %0,5'],
            ['Valf','6 yollu, 2 konumlu'],['Vial sıcaklığı','4–40 °C (termostatlı)']]
  },
  oven: {
    title: 'Kolon Fırını',
    kicker: 'Termostatlı Kolon Bölmesi',
    desc: 'Kolonu ±0,1 °C mertebesinde sabit sıcaklıkta tutar. Sıcaklık; alıkonma, seçicilik, viskozite ve ' +
          'dolayısıyla sistem basıncı üzerinde doğrudan etkilidir. Yüksek debilerde mobil fazın kolona girmeden ' +
          'önce ısıtıldığı ön-ısıtma (pre-heater) kapileri bulunur.',
    principle: [
      "van 't Hoff bağıntısı: ln k = −ΔH°/RT + ΔS°/R + ln β. Transfer entalpisi negatif olduğundan sıcaklık artışı k'yı düşürür (tipik %1–2/°C).",
      'Sıcaklık artışı viskoziteyi düşürerek basıncı azaltır ve difüzyon katsayısını (D_m) artırarak kütle transferi direncini (C terimi) iyileştirir.',
      'Sıcaklık aynı zamanda seçiciliği (α) değiştirebilir: farklı analitlerin ΔH° değerleri farklıysa pik sırası bile değişebilir.',
      'Oda sıcaklığında çalışma tekrarlanabilirliği bozar; validasyonlu metotlarda fırın sıcaklığı daima kontrol edilir.'
    ],
    specs: [['Sıcaklık aralığı','Ortam+5 … 80 °C'],['Kararlılık','±0,1 °C'],['Isıtma tipi','Peltier / zorlanmış hava'],
            ['Ön ısıtma','Kapiler ön-ısıtıcı'],['Etki','k, α, η, D_m']]
  },
  column: {
    title: 'HPLC Kolonu',
    kicker: 'Ayırmanın Gerçekleştiği Yer',
    desc: 'Paslanmaz çelik gövde içinde, yüzeyi kimyasal olarak modifiye edilmiş gözenekli silika partikülleri ' +
          '(ör. oktadesilsilan, C18) bulunur. Analitler durgun faz ile mobil faz arasında sürekli dağılım dengesine ' +
          'girerek farklı hızlarda ilerler; ayırma bu hız farkından doğar.',
    principle: [
      'Alıkonma faktörü k = (t_R − t_0)/t_0; ters faz kromatografisinde organik oran (φ) arttıkça k üstel olarak azalır: log k = log k_w − S·φ (LSS modeli).',
      'Verimlilik van Deemter/Knox ile tanımlanır: h = ν^⅓ + 2/ν + 0,05·ν. Küçük partikül çapı hem H değerini düşürür hem de optimum hızı yukarı kaydırır.',
      'Çözünürlük üç terimin çarpımıdır: R_s = (√N/4)·((α−1)/α)·(k/(1+k)). Pratikte en verimli kaldıraç seçiciliktir (α).',
      'Basınç d_p² ile ters orantılı olduğundan 1,8 µm partiküller UHPLC donanımı (yüksek basınç, düşük ekstra-kolon hacim) gerektirir.'
    ],
    specs: [['Gövde','Paslanmaz çelik'],['Durgun faz','C18 / C8, uç kapamalı'],['Partikül','1,8–5 µm, 100 Å'],
            ['Boyut','50–250 mm × 2,1–4,6 mm'],['Frit','0,5–2 µm'],['Toplam gözeneklilik','ε_T ≈ 0,65']]
  },
  detector: {
    title: 'Dedektör (UV/DAD)',
    kicker: 'Ultraviyole / Diyot Dizisi Dedektörü',
    desc: 'Kolon çıkışındaki akışkanı, ışık yolu 6–10 mm olan bir akış hücresinden geçirir ve absorbansı ölçer. ' +
          'DAD, tüm spektrumu diyot dizisi üzerine düşürerek eş zamanlı çok dalga boylu ölçüm ve pik saflığı ' +
          'değerlendirmesi yapılmasını sağlar.',
    principle: [
      'Lambert–Beer yasası: A = ε·b·c. Sinyal derişimle orantılıdır; bu nedenle UV dedektörü derişim duyarlıdır (kütle duyarlı değil).',
      'Sabit kütle enjekte edilirken debi artarsa pik alanı azalır (alan ∝ kütle/debi), pik yüksekliği ise büyük ölçüde korunur.',
      'Dalga boyu seçimi λ_max civarında yapılır; λ düştükçe mobil faz kesme (cut-off) absorbansı ve gradient taban çizgisi kayması artar.',
      'Hücre hacmi (1–14 µL) ekstra-kolon bant genişlemesine katkı verir; dar kolonlarda küçük hacimli hücre şarttır.'
    ],
    specs: [['Lamba','Döteryum (190–400 nm) + W'],['Dalga boyu','190–800 nm'],['Hücre','~10 µL, 10 mm yol'],
            ['Gürültü','< ±0,5 ×10⁻⁵ AU'],['Veri hızı','1–100 Hz'],['Doğrusallık','~2 AU']]
  },
  waste: {
    title: 'Atık Haznesi',
    kicker: 'Solvent Atık Toplama',
    desc: 'Dedektörden çıkan akış, kimyasal atık mevzuatına uygun şekilde toplanır. Hat ucu sıvı içine ' +
          'daldırılmaz; aksi halde sifon etkisi ve geri basınç değişimi dedektör taban çizgisini bozar.',
    principle: [
      'Atık hattı serbest (atmosferik) olmalıdır; kısıtlama dedektör hücresinde basınç oluşturarak kabarcık/patlama riski yaratır.',
      'Organik solvent buharlarının geri difüzyonu için havalandırmalı kapak veya karbon filtre kullanılır.',
      'Tamponlu ve organik atıklar mevzuata göre ayrı toplanır; kütlesel takip validasyon dosyalarının parçasıdır.',
      'Atık hacmi izlenerek gerçek debi kabaca doğrulanabilir (gravimetrik debi kontrolü).'
    ],
    specs: [['Hacim','2–10 L'],['Malzeme','HDPE / cam'],['Kapak','Havalandırmalı, karbon filtreli'],
            ['Kural','Hat ucu sıvıya daldırılmaz']]
  },
  tubing: {
    title: 'Kapiler ve Bağlantılar',
    kicker: 'Akış Hattı Elemanları',
    desc: 'Modüller arası bağlantılar; pompa öncesi PTFE (düşük basınç), pompa sonrası paslanmaz çelik veya ' +
          'PEEK kapiler (yüksek basınç) ile yapılır. Kolon–dedektör arası hat, ekstra-kolon bant genişlemesinin ' +
          'en kritik bileşenidir.',
    principle: [
      'Ekstra-kolon varyans toplanır: σ²_toplam = σ²_kolon + σ²_enj + σ²_kapiler + σ²_hücre.',
      'Kapiler varyansı yarıçapın 4. kuvveti ile artar (Taylor–Aris): iç çap 0,17 mm yerine 0,12 mm seçmek belirgin kazanç sağlar.',
      'Kolon sonrası hat mümkün olan en kısa ve en dar olmalıdır; kolon öncesi hattın genişlemeye etkisi ihmal edilebilir.',
      'Yanlış fitting derinliği ölü hacim (void) yaratır ve pik kuyruklanması olarak görünür.'
    ],
    specs: [['Düşük basınç','PTFE, 1,6 mm İÇ'],['Yüksek basınç','SS/PEEK, 0,12–0,17 mm İÇ'],
            ['Fitting','10-32 koni, PEEK/SS'],['Kritik hat','Kolon → Dedektör']]
  }
};

/* --- Analit kütüphanesi ---
   logkw : saf sulu fazda log k (LSS kesişimi)
   S     : LSS eğimi (log k = log kw - S*phi)
   dH    : transfer entalpisi (kJ/mol, negatif = ekzotermik)
   conc  : numune derişimi (mg/mL)
   uv    : UV spektrumu, gauss bantlarının toplamı {lm: merkez nm, e: bağıl absorptivite, w: yarı genişlik}
   tau   : kuyruklanma zaman sabiti (dk cinsinden, birinci mertebe gecikme)               */
const ANALYTES = [
  { id:1, name:'Parasetamol', color:'#4aa3ff', logkw:0.85, S:3.20, dH:-16, conc:0.10, tau:0.010,
    uv:[{lm:243,e:1.00,w:16},{lm:210,e:0.72,w:14}] },
  { id:2, name:'Kafein',      color:'#25d0c4', logkw:1.15, S:3.50, dH:-17, conc:0.08, tau:0.011,
    uv:[{lm:273,e:0.95,w:18},{lm:205,e:0.80,w:12}] },
  { id:3, name:'Naproksen',   color:'#ffb347', logkw:3.00, S:4.50, dH:-19, conc:0.06, tau:0.014,
    uv:[{lm:230,e:1.20,w:12},{lm:262,e:0.45,w:14},{lm:331,e:0.18,w:16}] },
  { id:4, name:'İbuprofen',   color:'#ff6b6b', logkw:3.90, S:4.90, dH:-20, conc:0.20, tau:0.016,
    uv:[{lm:222,e:0.65,w:11},{lm:264,e:0.06,w:12}] }
];

/* --- Kolon tanımları --- */
const COLUMNS = {
  c18_150:{ label:'C18 150×4,6 mm 5 µm',  L:15.0, id:0.46, dp:5.0, eT:0.65, dOff:0.00, sEC:7.0 },
  c18_100:{ label:'C18 100×4,6 mm 3,5 µm',L:10.0, id:0.46, dp:3.5, eT:0.65, dOff:0.00, sEC:7.0 },
  c18_50: { label:'C18 50×2,1 mm 1,8 µm', L:5.0,  id:0.21, dp:1.8, eT:0.64, dOff:0.00, sEC:2.0 },
  c8_150: { label:'C8 150×4,6 mm 5 µm',   L:15.0, id:0.46, dp:5.0, eT:0.65, dOff:-0.45, sEC:7.0 }
};

/* --- Çözücü özellikleri (25 °C viskozite, cP; eluotropik güç katsayısı) --- */
const SOLVENTS = {
  acn : { label:'Asetonitril', eta:0.34, curv:0.60, strength:1.00, cutoff:190 },
  meoh: { label:'Metanol',     eta:0.55, curv:3.60, strength:0.82, cutoff:205 }
};
const AQUEOUS = {
  water:    { label:'Su (0,1% FA)',      eta:0.89, uvbase:0.6 },
  buffer:   { label:'Fosfat pH 3,0',     eta:0.95, uvbase:1.6 },
  ammonium: { label:'Amonyum asetat',    eta:0.92, uvbase:2.4 }
};

/* --- Eğitim modu adımları --- */
const EDU_STEPS = [
  { m:'bottles',    t:'1. Mobil Faz Hazneleri',
    d:'Analiz, mobil fazın hazırlanmasıyla başlar. Sulu faz (A) ve organik faz (B) ayrı şişelerde bulunur; emiş hatlarının ucundaki fritler partikülleri tutar. Şişeler daima pompa seviyesinin üzerindedir.' },
  { m:'degasser',   t:'2. Degazör',
    d:'Mobil faz pompaya girmeden önce çözünmüş gazlarından arındırılır. Aksi halde pompa başında kabarcık oluşur; debi kararsızlaşır ve dedektör taban çizgisinde spike’lar görülür.' },
  { m:'pump',       t:'3. Pompa',
    d:'İki pistonlu pompa mobil fazı sabit debide, kolonun geri basıncına karşı iter. Gradient programı burada oransal valfle oluşturulur. Basınç bir ayar değil, sistemin direncine bağlı bir sonuçtur.' },
  { m:'autosampler',t:'4. Otosampler',
    d:'Numune vialden çekilir ve altı yollu valf LOAD konumundayken döngüye doldurulur. Valf INJECT konumuna döndüğünde mobil faz numuneyi kolona taşır; kromatogramın t = 0 anı budur.' },
  { m:'oven',       t:'5. Kolon Fırını',
    d:'Kolon sabit sıcaklıkta tutulur. Sıcaklık alıkonmayı (van ’t Hoff), viskoziteyi ve difüzyonu etkilediği için hem seçiciliği hem basıncı hem de pik genişliğini değiştirir.' },
  { m:'column',     t:'6. Kolon — Ayırma',
    d:'Analitler durgun faz ile mobil faz arasında sürekli dağılır. Hidrofobikliği yüksek olan analit durgun fazda daha uzun kalır ve daha geç çıkar. Ayırma bu göç hızı farkından doğar.' },
  { m:'detector',   t:'7. Dedektör (UV/DAD)',
    d:'Kolondan çıkan bant akış hücresinden geçerken absorbans ölçülür (A = ε·b·c). Derişim arttıkça sinyal artar; kromatogramdaki pik bu geçişin zaman içindeki izdüşümüdür.' },
  { m:'waste',      t:'8. Atık Haznesi',
    d:'Ölçümü tamamlanan akış, mevzuata uygun biçimde atık haznesinde toplanır. Hattın serbest (atmosferik) kalması, dedektör hücresinde basınç birikmesini önler.' }
];
