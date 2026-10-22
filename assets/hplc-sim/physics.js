'use strict';
/* ==========================================================================
   2) FİZİKSEL/KİMYASAL MODEL
   --------------------------------------------------------------------------
   Modelin dayandığı varsayımlar (bilinçli basitleştirmeler):
     • Alıkonma: lineer çözücü gücü (LSS) modeli, log k = log k_w − S·φ
     • Sıcaklık: van 't Hoff, sabit ΔH° kabulü (dar sıcaklık aralığında geçerli)
     • Verim   : Knox indirgenmiş tabaka yüksekliği, h = ν^(1/3) + 2/ν + 0,05·ν
     • Basınç  : Darcy, ΔP = φ_res·η·L·u/d_p² (+ %12 donanım direnci)
     • Gradient: çözücünün kolon içindeki konumuna göre gecikmeli bileşim yaklaşımı
     • Pik şekli: Gauss + birinci mertebe üstel gecikme (EMG eşdeğeri kuyruklanma)
   Bu bir eğitim/öngörü modelidir; deneysel veri yerine geçmez.
   ========================================================================== */

const R_GAS = 8.314;          // J/(mol·K)
const DWELL_V = 0.60;         // mL — gradient gecikme (dwell) hacmi (LPG kabulü)
const FLOW_RESIST = 700;      // Darcy akış direnci katsayısı (küresel dolgu + frit)
const DM25 = 1.0e-5;          // cm²/s — 25 °C referans difüzyon katsayısı
const KRESP = 1500;           // mAU·s / (µg·mL⁻¹·dk) ölçek sabiti (cihaz kazancı)

/* Uygulama durumu */
const S = {
  flow:1.0, temp:30, inj:10, wl:254, run:10,
  mode:'grad', isoB:55,
  grad:[{t:0,b:5},{t:0.5,b:5},{t:7.0,b:95},{t:9.0,b:95},{t:9.2,b:5}],
  col:'c18_150', solvA:'water', solvB:'acn', speed:10,
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

/* Sistem basıncı (bar) — Darcy */
function pressureBar(phi){
  const {c,u}=colGeom();
  const TK=S.temp+273.15;
  const eta=viscosity(phi,TK)*1e-3;                 // Pa·s
  const dp=c.dp*1e-6, L=c.L*1e-2, uSI=u*1e-2;
  const dP=FLOW_RESIST*eta*L*uSI/(dp*dp);           // Pa
  return dP*1.12/1e5;                               // +%12 donanım direnci → bar
}

/* Teorik tabaka sayısı — Knox modeli */
function platesN(phiAvg){
  const {c,u}=colGeom();
  const TK=S.temp+273.15;
  const eta=viscosity(phiAvg,TK);
  const Dm=DM25*(TK/298.15)*(0.89/eta);             // cm²/s (Wilke–Chang benzeri ölçekleme)
  const dpc=c.dp*1e-4;                              // cm
  const nu=u*dpc/Dm;                                // indirgenmiş hız
  const h=Math.pow(nu,1/3)+2/nu+0.05*nu;            // indirgenmiş tabaka yüksekliği
  const H=h*dpc;
  return {N:Math.max(200,c.L/H), nu, h, Dm};
}

/* Alıkonma faktörü k(φ,T) */
function kOf(a, phi, TK){
  const st=SOLVENTS[S.solvB].strength;
  const phiEff=clamp(phi*st,0,0.98);
  let logk=(a.logkw+COLUMNS[S.col].dOff) - a.S*phiEff;
  logk += (-a.dH*1000/(2.303*R_GAS))*(1/TK - 1/303.15);   // van 't Hoff
  return clamp(Math.pow(10,clamp(logk,-2,3.4)),0,2500);
}

/* Dalga boyuna bağlı bağıl molar absorptivite */
function absorptivity(a, wl){
  let s=0;
  for(const b of a.uv) s += b.e*Math.exp(-Math.pow(wl-b.lm,2)/(2*b.w*b.w));
  return s;
}

/* ---------------------------------------------------------------------------
   ÇALIŞMA HESABI — analitlerin göçü, pik profilleri ve kromatogram sinyali
   --------------------------------------------------------------------------- */
function computeRun(){
  const g=colGeom(), TK=S.temp+273.15;
  const runT=S.run, n=1600, dtGrid=runT/(n-1);
  const tD=DWELL_V/S.flow;                       // dwell zamanı (dk)

  /* Ortalama bileşim → verim ve difüzyon için temsilî φ */
  let phiSum=0; for(let i=0;i<n;i++) phiSum+=phiProgram(i*dtGrid);
  const phiAvg=phiSum/n;
  const {N,nu,h}=platesN(phiAvg);

  /* Zaman ızgarası */
  const time=new Float64Array(n);
  for(let i=0;i<n;i++) time[i]=i*dtGrid;

  /* Ekstra-kolon ve enjeksiyon varyansları (dk) */
  const sigInj=(S.inj/1000)/(Math.sqrt(12)*S.flow);
  const sigEC =(g.c.sEC/1000)/S.flow;
  const Gcomp =(S.mode==='grad')?0.85:1.0;        // gradient bant sıkışması

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

    /* --- Pik genişliği --- */
    const sigCol=(g.t0*(1+kEl)/Math.sqrt(N))*Gcomp;
    const sigma=Math.sqrt(sigCol*sigCol + sigInj*sigInj + sigEC*sigEC);

    /* --- Pik alanı: derişim duyarlı dedektör → alan ∝ kütle/debi --- */
    const mass=a.conc*S.inj;                      // µg
    const area=mass*absorptivity(a,S.wl)*KRESP/S.flow;   // mAU·s

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

    peaks.push({a, eluted:true, prof, area, sigma, k:kEl, tRideal:tR, N:N});
  }

  /* --- Taban çizgisi: gradient kaynaklı kayma + gürültü + pompa pulsasyonu --- */
  const base=new Float64Array(n);
  const aq=AQUEOUS[S.solvA], sb=SOLVENTS[S.solvB];
  const uvPenalty=Math.max(0,(sb.cutoff+30-S.wl))/30;          // kesme dalga boyuna yaklaşım
  const driftMag=aq.uvbase*(0.4+uvPenalty*2.2);
  for(let i=0;i<n;i++){
    const phiDet=phiProgram(time[i]-tD-g.t0);                   // dedektöre ulaşan bileşim
    base[i]=1.2 + driftMag*phiDet
          + 0.35*Math.sin(time[i]*2*Math.PI*S.flow*8)*0.15      // pompa pulsasyonu
          + (Math.random()-0.5)*0.16;                           // dedektör gürültüsü
  }

  /* --- Ölü hacim (void) bozulması: t0 civarında bağlanmamış matris --- */
  const voidH=clamp(S.inj*0.35,1,18);
  for(let i=0;i<n;i++){
    const z=(time[i]-g.t0)/(0.012+ sigInj*1.4);
    if(Math.abs(z)<6) base[i]+=voidH*Math.exp(-0.5*z*z);
  }

  /* --- Toplam sinyal --- */
  const total=new Float64Array(n);
  for(let i=0;i<n;i++){
    let v=base[i];
    for(const p of peaks) if(p.eluted) v+=p.prof[i];
    total[i]=v;
  }

  /* --- Pik ölçütleri: gözlenen tR, yükseklik, w50, N, kuyruklanma, Rs --- */
  const eluting=peaks.filter(p=>p.eluted);
  for(const p of eluting){
    let mi=0; for(let i=1;i<n;i++) if(p.prof[i]>p.prof[mi]) mi=i;
    p.tR=time[mi]; p.height=p.prof[mi];
    p.w50=widthAt(p.prof,time,mi,0.5);
    p.w05=widthAt(p.prof,time,mi,0.05,true);
    p.Nobs=(p.w50>0)?5.54*Math.pow(p.tR/p.w50,2):p.N;
    p.As=(p.w05 && p.w05.front>0)?(p.w05.front+p.w05.back)/(2*p.w05.front):1;
    p.kObs=(p.tR-g.t0)/g.t0;
  }
  eluting.sort((x,y)=>x.tR-y.tR);
  for(let i=0;i<eluting.length;i++){
    if(i===0){ eluting[i].Rs=null; continue; }
    const a1=eluting[i-1], a2=eluting[i];
    eluting[i].Rs=1.18*(a2.tR-a1.tR)/(a1.w50+a2.w50);          // yarı yükseklik (EP) yöntemi
  }

  /* --- Basınç profili --- */
  let pMax=0; const press=new Float64Array(n);
  for(let i=0;i<n;i++){ press[i]=pressureBar(phiProgram(time[i])); if(press[i]>pMax) pMax=press[i]; }

  return {time,total,base,peaks,eluting,trajectories,t0:g.t0,Vm:g.Vm,u:g.u,N,nu,h,
          press,pMax,dtGrid,n,phiAvg,tD,sigInj,sigEC};
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
