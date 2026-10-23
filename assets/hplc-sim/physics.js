'use strict';
/* ==========================================================================
   2) FİZİKSEL/KİMYASAL MODEL (v2)
   --------------------------------------------------------------------------
   Modelin dayandığı varsayımlar (bilinçli basitleştirmeler):
     • Alıkonma : çözücüye özel lineer çözücü gücü (LSS) modeli,
                  log k = log k_w(solvent) − S(solvent)·φ
     • İyonlaşma: zayıf asit/baz için nötr ve iyonik türün ağırlıklı ortalaması,
                  k = f_n·k_n + (1−f_n)·k_i ;  asit için f_n = 1/(1+10^(pH−pKa)).
                  Organik modifiyer hem analitin pKa'sını hem tamponun pH'ını yükseltir
                  (s_s pH ölçeği); her ikisi φ ile doğrusal kayar (yaklaşık katsayılar).
     • Sıcaklık : van 't Hoff, sabit ΔH° (dar aralıkta geçerli); pKa sıcaklıktan bağımsız.
     • Verim    : Knox, h = ν^(1/3) + 2/ν + C(k)·ν ; C(k) = 0,03 + 0,08·(k/(1+k))²
                  her pik için elüsyon anındaki k ve viskozite ile hesaplanır.
     • Gradient : çözücü kolon içinde t0 hızında ilerler (dwell + konum gecikmesi);
                  bant sıkışması Poppe G faktörü ile (elüsyondaki yerel gradient eğimi).
     • Basınç   : Darcy (kolon boyunca viskozite integrali) + Hagen–Poiseuille (kapilerler)
                  + sabit donanım direnci.
     • Dedektör : Lambert–Beer; kaçak ışık nedeniyle yüksek absorbansta doğrusallıktan sapma;
                  tohumlu (tekrarlanabilir) beyaz + 1/f benzeri gürültü + pompa pulsasyonu.
     • Pik şekli: Gauss + birinci mertebe üstel gecikme (EMG eşdeğeri kuyruklanma).
   Analit parametreleri (log k_w, S, ΔH°, iyonik tür farkları) örnek değerlerdir; literatüre
   veya ölçüme uydurulmamıştır. Bu bir eğitim/öngörü modelidir; deneysel veri yerine geçmez.
   ========================================================================== */

const R_GAS = 8.314;          // J/(mol·K)
const FLOW_RESIST = 900;      // Darcy akış direnci Φ (u0 = L/t0 tabanlı; dolgulu yatak için tipik 500–1000)
const DM25 = 1.0e-5;          // cm²/s — 25 °C referans difüzyon katsayısı (küçük molekül)
const KRESP = 1500;           // mAU·s / (µg·mL⁻¹·dk) ölçek sabiti (cihaz kazancı)
const STRAY = 5e-4;           // kaçak ışık oranı (%0,05) — ~2 AU'ya kadar doğrusal yanıt
const CAP_PRE  = {L:0.60, d:0.17e-3};   // m — pompa → otosampler → kolon kapilerleri (toplam)
const CAP_POST = {L:0.35, d:0.12e-3};   // m — kolon → dedektör kapileri
const P_FIXED = 3.0;          // bar (1 mL/dk'da) — mikser, filtre, enjeksiyon valfi, akış hücresi
const NOISE_W = 0.012;        // mAU — beyaz gürültü standart sapması (254 nm, 1 s yanıt süresi kabulü)
const NOISE_F = 0.0015;       // mAU — 1/f benzeri (AR(1)) gürültü itici terimi
const PULSE   = 0.02;         // mAU — artık pompa pulsasyonu genliği

/* Uygulama durumu */
const S = {
  flow:1.0, temp:30, inj:10, wl:254, run:10,
  mode:'grad', isoB:55,
  grad:[{t:0,b:5},{t:0.5,b:5},{t:7.0,b:95},{t:9.0,b:95},{t:9.2,b:5}],
  col:'c18_150', solvA:'water', solvB:'acn', speed:10,
  dwell:0.60,            // mL — gradient gecikme (dwell) hacmi
  dil:1,                 // numune seyreltme çarpanı (1 = stok)
  seed:12345,            // gürültü üretecinin tohumu (aynı tohum → aynı kromatogram)
  pHShift:0,             // sağlamlık hesabı için sulu faz pH sapması
  phase:'idle',          // idle | running | paused | done
  t:0,                   // geçen analiz zamanı (dk)
  result:null,           // hesaplanmış çalışma verisi
  flowMode:false,        // "Akış Yolu" gösterimi
  eduMode:false, eduIdx:-1,
  selected:null, hovered:null,
  showLabels:true,
  view:{t0:0,t1:10,autoY:true,y0:-5,y1:100}
};

/* ---------- Yardımcılar ---------- */
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp  = (a,b,t)=>a+(b-a)*t;
const fmt   = (v,d)=>Number(v).toFixed(d).replace('.',',');

/* Tohumlu sözde rastgele sayı üreteci (mulberry32) ve standart normal örnek (Box–Muller) */
function makeRng(seed){
  let a=(seed>>>0)||1;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    let t=a;
    t=Math.imul(t^(t>>>15), t|1);
    t^=t+Math.imul(t^(t>>>7), t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
function gaussOf(rnd){
  const u=Math.max(1e-12,rnd()), v=rnd();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

/* Gradient programındaki t anındaki %B (pompa çıkışı, 0–1) */
function phiProgram(t){
  if(S.mode==='iso') return S.isoB/100;
  const g=S.grad;
  if(!g.length) return 0.05;
  if(t<=g[0].t) return g[0].b/100;
  for(let i=0;i<g.length-1;i++){
    if(t>=g[i].t && t<=g[i+1].t){
      const f=(g[i+1].t===g[i].t)?1:(t-g[i].t)/(g[i+1].t-g[i].t);
      return lerp(g[i].b,g[i+1].b,f)/100;
    }
  }
  return g[g.length-1].b/100;
}

/* Mobil faz viskozitesi (cP) — karışım maksimumu + Andrade sıcaklık düzeltmesi */
function viscosity(phi, TK){
  const A=AQUEOUS[S.solvA], B=SOLVENTS[S.solvB];
  const eta25 = A.eta*(1-phi) + B.eta*phi + B.curv*phi*(1-phi);
  return eta25 * Math.exp(1900*(1/TK - 1/298.15));   // 1900 K ≈ su/organik karışım aktivasyon terimi
}

/* Kolon geometrisi ve temel akış büyüklükleri */
function colGeom(){
  const c=COLUMNS[S.col];
  const Ac=Math.PI*Math.pow(c.id/2,2);      // cm²
  const Vm=Ac*c.L*c.eT;                     // mL (toplam gözenek hacmi)
  const t0=Vm/S.flow;                       // dk
  const u=c.L/(t0*60);                      // cm/s
  return {c,Ac,Vm,t0,u};
}
function dwellTime(){ return S.dwell/S.flow; }

/* ---------- Basınç ---------- */
/* Hagen–Poiseuille: ΔP = 128·η·L·Q/(π·d⁴)  (Pa) */
function capillaryPa(etaPa, cap){
  const Q=S.flow/60e6;                                // m³/s
  return 128*etaPa*cap.L*Q/(Math.PI*Math.pow(cap.d,4));
}
/* Kolon ΔP (Pa) — ortalama viskozite ile Darcy */
function columnPa(etaPaMean){
  const {c,u}=colGeom();
  const dp=c.dp*1e-6, L=c.L*1e-2, uSI=u*1e-2;
  return FLOW_RESIST*etaPaMean*L*uSI/(dp*dp);
}
/* Kolonun tamamı aynı bileşimdeyken sistem basıncı (bar) — izokratik/dengedeki durum */
function pressureBar(phi){
  const TK=S.temp+273.15, eta=viscosity(phi,TK)*1e-3;
  return (columnPa(eta) + capillaryPa(eta,CAP_PRE) + capillaryPa(eta,CAP_POST))/1e5 + P_FIXED*S.flow;
}
/* Gradient sırasında t anındaki sistem basıncı (bar): kolon boyunca bileşim profili
   φ(x,t) = φ_program(t − t_D − x·t0) üzerinden viskozite ortalaması alınır. */
function pressureAt(t){
  const g=colGeom(), TK=S.temp+273.15, tD=dwellTime();
  let s=0; const n=24;
  for(let i=0;i<n;i++){ const x=(i+0.5)/n; s+=viscosity(phiProgram(t-tD-x*g.t0),TK); }
  const etaCol=s/n*1e-3;
  const etaPre=viscosity(phiProgram(t-tD*0.5),TK)*1e-3;
  const etaPost=viscosity(phiProgram(t-tD-g.t0),TK)*1e-3;
  return (columnPa(etaCol) + capillaryPa(etaPre,CAP_PRE) + capillaryPa(etaPost,CAP_POST))/1e5 + P_FIXED*S.flow;
}
/* Arayüz için anlık basınç: çalışma sırasında profil, aksi halde başlangıç bileşimi */
function systemPressure(){
  if(S.phase==='running'||S.phase==='paused') return pressureAt(S.t);
  return pressureBar(S.mode==='iso'?S.isoB/100:phiProgram(0));
}

/* ---------- Verim (Knox) ---------- */
function knoxC(k){ const r=k/(1+k); return 0.03+0.08*r*r; }
function plateCount(phi, k){
  const {c,u}=colGeom();
  const TK=S.temp+273.15;
  const eta=viscosity(phi,TK);
  const Dm=DM25*(TK/298.15)*(0.89/eta);             // cm²/s (Wilke–Chang/Stokes–Einstein ölçeklemesi)
  const dpc=c.dp*1e-4;                              // cm
  const nu=u*dpc/Dm;                                // indirgenmiş hız
  const h=Math.pow(nu,1/3)+2/nu+knoxC(k)*nu;         // indirgenmiş tabaka yüksekliği
  return {N:Math.max(200,c.L/(h*dpc)), nu, h, Dm};
}

/* ---------- Alıkonma ve iyonlaşma ---------- */
/* Sulu fazın s_s pH değeri (organik oranla yükselir) */
function mobilePH(phi){
  return AQUEOUS[S.solvA].pH + S.pHShift + 0.85*SOLVENTS[S.solvB].dpKa*phi;
}
/* Nötr tür oranı f_n. Nötr asitlerin (HA) pKa'sı organik oranla yükselir; katyonik
   asitlerin (BH⁺) pKa'sı hafifçe düşer. */
function fracNeutral(a, phi){
  if(a.pKa==null) return 1;
  const pH=mobilePH(phi);
  if(a.type==='acid'){ const pKa=a.pKa+SOLVENTS[S.solvB].dpKa*phi; return 1/(1+Math.pow(10,pH-pKa)); }
  const pKa=a.pKa-1.0*phi;                          // baz: BH⁺ ⇌ B + H⁺
  return 1/(1+Math.pow(10,pKa-pH));
}
/* Alıkonma faktörü k(φ,T) */
function kOf(a, phi, TK){
  const P=a.lss[S.solvB], off=COLUMNS[S.col].dOff;
  const vh=(-a.dH*1000/(2.303*R_GAS))*(1/TK - 1/303.15);   // van 't Hoff
  const kN=Math.pow(10,clamp((P.logkw+off) - P.S*phi + vh,-2,3.4));
  if(a.pKa==null) return kN;
  const fn=fracNeutral(a,phi);
  const kI=Math.pow(10,clamp((P.logkw+a.ion.dlogkw+off) - (P.S+a.ion.dS)*phi + vh,-2,3.4));
  return clamp(fn*kN+(1-fn)*kI,0,2500);
}
/* Etkin LSS eğimi: −d log k / dφ (sayısal) — iyonlaşma terimini de kapsar */
function sEff(a, phi, TK){
  const h=2e-3, p0=clamp(phi-h,0,1), p1=clamp(phi+h,0,1);
  return (Math.log10(kOf(a,p0,TK))-Math.log10(kOf(a,p1,TK)))/Math.max(1e-6,p1-p0);
}

/* Dalga boyuna bağlı bağıl molar absorptivite */
function absorptivity(a, wl){
  let s=0;
  for(const b of a.uv) s += b.e*Math.exp(-Math.pow(wl-b.lm,2)/(2*b.w*b.w));
  return s;
}
/* Kaçak ışıklı absorbans: A_göz = −log10((10^−A + s)/(1 + s))  (mAU giriş/çıkış) */
function strayLight(mAU){
  const A=Math.max(-0.5,mAU/1000);
  return -Math.log10((Math.pow(10,-A)+STRAY)/(1+STRAY))*1000;
}

/* Poppe gradient sıkışma faktörü: G = √(1+p+p²/3)/(1+p), p = 2,3·k0·b/(1+2,3·k0·b) */
function poppeG(k0, b){
  if(!(b>0)) return 1;
  const x=2.3*k0*b, p=x/(1+x);
  return Math.sqrt(1+p+p*p/3)/(1+p);
}

/* Yeniden dengelenme: gradient sonunda başlangıç bileşiminde kolondan geçen hacim (kolon hacmi cinsinden) */
function reequilibrationCV(){
  if(S.mode!=='grad' || S.grad.length<2) return null;
  const g=S.grad, b0=g[0].b, last=g[g.length-1];
  if(Math.abs(last.b-b0)>0.5) return {cv:0, returned:false};
  let tl=0; for(let i=g.length-1;i>0;i--){ if(Math.abs(g[i].b-g[i-1].b)>0.01){ tl=g[i].t; break; } }
  const hold=S.run-(tl+dwellTime());
  return {cv:Math.max(0,hold)*S.flow/colGeom().Vm, returned:true};
}
/* Fosfat tamponu yüksek organik oranda çöker (yaklaşık eşikler, tampon derişimine bağlıdır) */
function bufferPrecipitationRisk(){
  if(S.solvA!=='buffer') return null;
  const lim=(S.solvB==='acn')?0.70:0.80;
  const pmax=(S.mode==='iso')?S.isoB/100:Math.max.apply(null,S.grad.map(r=>r.b/100));
  return pmax>lim?{pmax,lim}:null;
}

/* ---------------------------------------------------------------------------
   ÇALIŞMA HESABI — analitlerin göçü, pik profilleri ve kromatogram sinyali
   --------------------------------------------------------------------------- */
function computeRun(){
  const g=colGeom(), TK=S.temp+273.15;
  /* Örnekleme: 0,2 s (5 Hz, tipik DAD veri hızı). Sabit nokta sayısı uzun analizlerde dar
     pikleri yetersiz örnekler (σ < Δt) ve alan/w50 hatası doğurur. */
  const runT=S.run, n=clamp(Math.ceil(runT*60/0.2)+1,1600,14000), dtGrid=runT/(n-1);
  const tD=dwellTime();                          // dwell zamanı (dk)

  /* Zaman ızgarası */
  const time=new Float64Array(n);
  for(let i=0;i<n;i++) time[i]=i*dtGrid;

  /* Ekstra-kolon ve enjeksiyon varyansları (dk) */
  const sigInj=(S.inj/1000)/(Math.sqrt(12)*S.flow);
  const sigEC =(g.c.sEC/1000)/S.flow;

  const peaks=[];
  const trajectories=[];                          // 3B görselleştirme için göç eğrileri

  for(const a of ANALYTES){
    /* --- Göç integrasyonu: dx/dt = 1/(t0·(1+k)) --- */
    const dt=Math.min(0.0015, runT/6000);
    let x=0, t=0, kEl=kOf(a,phiProgram(0),TK), eluted=false;
    const traj=new Float64Array(n); let gi=0;
    const tMaxInt=runT*1.6;
    while(t<tMaxInt){
      /* Çözücünün analit konumuna ulaşma gecikmesi: dwell + kolon içi yol */
      const phiLocal=phiProgram(t - tD - x*g.t0);
      const k=kOf(a,phiLocal,TK);
      const dx=dt/(g.t0*(1+k));
      x+=dx; t+=dt;
      while(gi<n && time[gi]<=t){ traj[gi]=Math.min(x,1); gi++; }
      if(x>=1){ kEl=k; eluted=true; break; }
    }
    while(gi<n){ traj[gi]=1; gi++; }
    const tR=t;
    trajectories.push({id:a.id, x:traj, tR:tR, color:a.color, name:a.name});

    if(!eluted || tR>runT){                       // analiz süresinde elüe olmadı
      peaks.push({a, eluted:false, tR:tR});
      continue;
    }

    /* --- Elüsyon anındaki koşullar --- */
    const tLoc=tR-tD-g.t0;                        // kolon çıkışındaki bileşimin pompa zamanı
    const phiE=phiProgram(tLoc);
    const slope=(phiProgram(tLoc+0.01)-phiProgram(tLoc-0.01))/0.02;   // dφ/dt (1/dk)
    const Se=sEff(a,phiE,TK);
    const b=(S.mode==='grad')?Se*g.t0*slope:0;    // yerel gradient eğimi
    const G=poppeG(kOf(a,phiProgram(0),TK), b);
    const pc=plateCount(phiE,kEl);

    /* --- Pik genişliği --- */
    const sigCol=G*g.t0*(1+kEl)/Math.sqrt(pc.N);
    const sigma=Math.sqrt(sigCol*sigCol + sigInj*sigInj + sigEC*sigEC);

    /* --- Pik alanı: derişime duyarlı dedektör → alan ∝ kütle/debi --- */
    const mass=a.conc*S.dil*S.inj;                // µg
    const area=mass*absorptivity(a,S.wl)*KRESP/S.flow;   // mAU·s (doğrusal yanıt)

    /* --- Gauss profili + birinci mertebe kuyruklanma (EMG eşdeğeri) --- */
    const prof=new Float64Array(n);
    const norm=area/(sigma*60*Math.sqrt(2*Math.PI));     // mAU tepe (kuyruklanma öncesi)
    for(let i=0;i<n;i++){
      const z=(time[i]-tR)/sigma;
      prof[i]=(Math.abs(z)<7)?norm*Math.exp(-0.5*z*z):0;
    }
    /* Kuyruklanma zaman sabiti: ekstra-kolon hacim kaynaklı olduğundan
       sistem hacmi ile doğru, debi ile ters orantılıdır (τ = V_tail / F). */
    const tau=a.tau*(g.c.sEC/7)/S.flow;
    let y=0;
    for(let i=0;i<n;i++){ y += (prof[i]-y)*(dtGrid/(tau+dtGrid)); prof[i]=y; }

    peaks.push({a, eluted:true, prof, areaTrue:area, sigma, k:kEl, tRideal:tR, N:pc.N, G,
                phiE, fn:fracNeutral(a,phiE), pHe:mobilePH(phiE)});
  }

  /* --- Taban çizgisi: gradient kaynaklı kayma + gürültü + pompa pulsasyonu ---
     Gürültü tohumlu üreteçten gelir: aynı tohum ve koşullar aynı kromatogramı verir. */
  const rnd=makeRng(S.seed);
  const base=new Float64Array(n), noise=new Float64Array(n);
  const aq=AQUEOUS[S.solvA], sb=SOLVENTS[S.solvB];
  const uvPenalty=Math.max(0,(sb.cutoff+30-S.wl))/30;          // kesme dalga boyuna yaklaşım
  const driftMag=aq.uvbase*(0.4+uvPenalty*2.2);
  const sigW=NOISE_W*(1+uvPenalty*4);                           // düşük ışık → yüksek gürültü
  const phiDet0=phiProgram(-tD-g.t0);
  let fl=0;
  for(let i=0;i<n;i++){
    fl=fl*0.995+NOISE_F*(1+uvPenalty*4)*gaussOf(rnd);
    noise[i]=sigW*gaussOf(rnd) + fl + PULSE*Math.sin(time[i]*2*Math.PI*S.flow*8);
    const phiDet=phiProgram(time[i]-tD-g.t0);                   // dedektöre ulaşan bileşim
    base[i]=driftMag*(phiDet-phiDet0) + noise[i];               // t=0'da otomatik sıfırlama
  }

  /* --- Ölü hacim (void) bozulması: t0 civarında numune çözücüsü/matris --- */
  const voidH=clamp(S.inj*0.35,1,18);
  for(let i=0;i<n;i++){
    const z=(time[i]-g.t0)/(0.012+ sigInj*1.4);
    if(Math.abs(z)<6) base[i]+=voidH*Math.exp(-0.5*z*z);
  }

  /* --- Toplam sinyal (kaçak ışık dahil); her pikin gözlenen katkısı ---
     Pik katkısı A_göz(taban+pik) − A_göz(taban) ile yaklaşık ayrıştırılır. */
  const total=new Float64Array(n), baseObs=new Float64Array(n);
  for(let i=0;i<n;i++){
    let v=base[i];
    for(const p of peaks) if(p.eluted) v+=p.prof[i];
    total[i]=strayLight(v); baseObs[i]=strayLight(base[i]);
  }
  for(const p of peaks){
    if(!p.eluted) continue;
    for(let i=0;i<n;i++) if(p.prof[i]>0) p.prof[i]=strayLight(base[i]+p.prof[i])-baseObs[i];
    let s=0; for(let i=0;i<n;i++) s+=p.prof[i];
    p.area=s*dtGrid*60;                                         // mAU·s (gözlenen)
  }

  /* --- Pik ölçütleri: gözlenen tR, yükseklik, w50, N, kuyruklanma, Rs, S/N --- */
  const eluting=peaks.filter(p=>p.eluted);
  for(const p of eluting){
    let mi=0; for(let i=1;i<n;i++) if(p.prof[i]>p.prof[mi]) mi=i;
    p.tR=time[mi]; p.height=p.prof[mi];
    p.w50=widthAt(p.prof,time,mi,0.5);
    p.w05=widthAt(p.prof,time,mi,0.05,true);
    p.Nobs=(p.w50>0)?5.54*Math.pow(p.tR/p.w50,2):p.N;
    p.As=(p.w05 && p.w05.front>0)?(p.w05.front+p.w05.back)/(2*p.w05.front):1;
    p.kObs=(p.tR-g.t0)/g.t0;
    /* S/N = 2H/h (Ph. Eur. 2.2.46 / USP <621>): h, pikin çevresindeki 20·w50 aralığında
       gürültünün tepeden tepeye genişliği (uyumlaştırılmış güncel metin ≥5·w50 öngörür;
       daha geniş pencere h'yi büyütür, yani bu hesap muhafazakârdır). */
    const half=10*p.w50, i0=clamp(Math.floor((p.tR-half)/dtGrid),0,n-1), i1=clamp(Math.ceil((p.tR+half)/dtGrid),0,n-1);
    let mn=1e9,mx=-1e9; for(let i=i0;i<=i1;i++){ if(noise[i]<mn) mn=noise[i]; if(noise[i]>mx) mx=noise[i]; }
    p.noisePP=Math.max(1e-6,mx-mn);
    p.SN=2*p.height/p.noisePP;
    const cNow=p.a.conc*S.dil*1000;                              // µg/mL
    p.lod=cNow*3/p.SN; p.loq=cNow*10/p.SN;                       // doğrusal yanıt kabulüyle tahmin
    p.saturated=p.height>1500;
  }
  eluting.sort((x,y)=>x.tR-y.tR);
  for(let i=0;i<eluting.length;i++){
    if(i===0){ eluting[i].Rs=null; continue; }
    const a1=eluting[i-1], a2=eluting[i];
    eluting[i].Rs=1.18*(a2.tR-a1.tR)/(a1.w50+a2.w50);          // yarı yükseklik (EP) yöntemi
  }

  /* --- Basınç profili --- */
  let pMax=0; const press=new Float64Array(n);
  for(let i=0;i<n;i++){ press[i]=pressureAt(time[i]); if(press[i]>pMax) pMax=press[i]; }

  /* Ortalama teorik tabaka sayısı (elüe olan pikler, elüsyon koşullarında) */
  const Nmean=eluting.length?eluting.reduce((s,p)=>s+p.N,0)/eluting.length:plateCount(phiProgram(0),3).N;
  const pc0=plateCount(phiProgram(0),3);

  return {time,total,base,noise,peaks,eluting,trajectories,t0:g.t0,Vm:g.Vm,u:g.u,N:Nmean,nu:pc0.nu,h:pc0.h,
          press,pMax,dtGrid,n,tD,sigInj,sigEC};
}

/* Belirli bir yükseklik oranındaki pik genişliği (dk). detail=true ise ön/arka yarılar. */
function widthAt(prof,time,mi,frac,detail){
  const hLim=prof[mi]*frac;
  let l=mi; while(l>0 && prof[l]>hLim) l--;
  let r=mi; while(r<prof.length-1 && prof[r]>hLim) r++;
  const interp=(i,j)=>{
    const d=prof[j]-prof[i];
    const f=(Math.abs(d)<1e-12)?0:(hLim-prof[i])/d;
    return time[i]+(time[j]-time[i])*f;
  };
  const tl=interp(l,Math.min(l+1,prof.length-1));
  const tr=interp(r,Math.max(r-1,0));
  if(detail) return {front:Math.max(1e-6,time[mi]-tl), back:Math.max(1e-6,tr-time[mi])};
  return Math.max(1e-6,tr-tl);
}

/* Sağlamlık: sulu faz pH'ının ±0,1 değişiminde t_R duyarlılığı (dk/pH birimi).
   Ana sonucu ve durum değişkenlerini değiştirmez. */
function pHSensitivity(){
  const keep=S.pHShift, out={};
  S.pHShift=keep+0.1;  const up=computeRun();
  S.pHShift=keep-0.1;  const dn=computeRun();
  S.pHShift=keep;
  for(const p of up.eluting){
    const q=dn.eluting.find(x=>x.a.id===p.a.id);
    if(q) out[p.a.id]=(p.tRideal-q.tRideal)/0.2;
  }
  return out;
}

/* İki gradient çalışmasından LSS parametreleri (Snyder iki-çalışma yöntemi; nötr analit,
   doğrusal gradient, φ0 → φ1, aynı debi ve kolon). t_R'ler ölçülmüş alıkonma zamanlarıdır.
   Dönüş: {S, logkw, k0}. tR = (t0/b)·log10(2,3·k0·b + 1) + t0 + tD denklem çiftinin çözümü. */
function fitLSS2(tG1,tR1,tG2,tR2,phi0,phi1,t0,tD){
  const dphi=phi1-phi0;
  const res=(Sv,tG,tR)=>{
    const b=Sv*dphi*t0/tG;
    /* tR'den k0'ı çöz: k0 = (10^((tR−t0−tD)·b/t0) − 1)/(2,3·b) */
    return (Math.pow(10,(tR-t0-tD)*b/t0)-1)/(2.3*b);
  };
  /* Aynı S için iki çalışmadan elde edilen k0 eşit olmalı → ikiye bölme ile S */
  let lo=0.5, hi=12;
  const f=Sv=>Math.log10(res(Sv,tG1,tR1))-Math.log10(res(Sv,tG2,tR2));
  let flo=f(lo);
  for(let i=0;i<80;i++){
    const mid=(lo+hi)/2, fm=f(mid);
    if((fm<0)===(flo<0)){ lo=mid; flo=fm; } else hi=mid;
  }
  const Sv=(lo+hi)/2, k0=res(Sv,tG1,tR1);
  return {S:Sv, k0, logkw:Math.log10(k0)+Sv*phi0};
}
