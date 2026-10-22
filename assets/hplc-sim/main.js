'use strict';
/* ==========================================================================
   7) ANA DÖNGÜ VE BAŞLATMA — simülasyon saati, 3B motor yükleme, boyutlandırma
   ========================================================================== */

/* ---------- Simülasyon saati ---------- */
let resTimer=0;
function tickSim(dt){
  if(S.phase==='running'){
    S.t+=dt*S.speed/60;
    if(S.t>=S.run){ S.t=S.run; finishRun(); }
    setLeds();
    resTimer+=dt;
    if(resTimer>0.35){ resTimer=0; renderResults(); updateRunNote(); }
  }
}

/* ---------- Ana döngü ---------- */
let lastT=0;
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(0.1,(now-lastT)/1000||0); lastT=now;
  tickSim(dt);
  if(V.ok){
    camUpdate(dt);
    updateFlow3D(dt);
    updateLabels();
    render3D();
  }
  drawChroma();
  updateGauges();
}

/* ---------- 3B başlatma ----------
   1) Sahne/renderer kurulur  2) Blender glTF modeli yüklenir; başarısız olursa
   prosedürel yedek model kurulur  3) Ortak parçalar (hatlar, bantlar, etiketler)
   eklenir. ?model=prosedurel adres parametresi yedek modeli zorlar (test için). */
async function init3D(){
  const canvas=$('glcanvas');
  createStage(canvas);
  const wantProc=/[?&]model=prosedurel\b/.test(location.search);
  let loaded=false;
  if(!wantProc){
    try{ await loadGLTFRig('/assets/models/hplc-system.glb', f=>{
           $('loadMsg').textContent='3B model yükleniyor… %'+Math.round(f*100); });
         loaded=true; }
    catch(err){ console.warn('glTF modeli yüklenemedi, prosedürel modele geçiliyor:',err); resetRig(); }
  }
  if(!loaded) buildProceduralRig();
  finalizeRig();
  bindCameraEvents(canvas);
  buildLabels();
  V.ok=true;
  drawStaticScreens();
  const coarse=window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  setQuality(coarse||window.innerWidth<760?'std':'high');
  syncQualityButton();
  window.addEventListener('resize',resize3D);
  camApply();
  $('loadState').style.display='none';
}
/* Yarım kalan glTF yüklemesinden kalan sahne nesnelerini ve rig alanlarını temizler */
function resetRig(){
  for(const id in V.modules){ const m=V.modules[id]; if(m.group) V.scene.remove(m.group); if(m.outline) V.scene.remove(m.outline); }
  V.modules={}; V.screens={}; V.pistons=[]; V.needle=null; V.injValve=null; V.leds={};
  V.bottleLiquids=[]; V.wasteLiquid=null; V.cell=null; V.colAxis=null; V.segDefs=[];
}
let CAM_BASE_R=17.4;
function resize3D(){
  if(!V.renderer) return;
  const stage=$('stage');
  const w=stage.clientWidth, h=stage.clientHeight;
  V.renderer.setSize(w,h,false);
  if(V.composer){
    const pr=V.renderer.getPixelRatio();
    V.composer.setPixelRatio(pr); V.composer.setSize(w,h);
  }
  const aspect=w/Math.max(1,h);
  V.cam.aspect=aspect;
  V.cam.updateProjectionMatrix();
  /* Dar/dikey ekranlarda sistemin tamamı kadrajda kalsın diye kamera geri çekilir */
  const fit=clamp(1+(1.35-aspect)*0.75,1,2.1);
  CAM.home.r=CAM_BASE_R*fit;
  if(!CAM.userZoom) CAM.rGoal=CAM.home.r;
}
function syncQualityButton(){
  const b=$('btnQuality'); if(!b) return;
  b.classList.toggle('active',V.quality==='high');
  b.lastChild.textContent=V.quality==='high'?'Kalite: Yüksek':'Kalite: Standart';
}

/* ---------- three.js yükleme (assets/hplc-sim/three-boot.mjs) ---------- */
function boot3D(){
  init3D().catch(err=>{ console.error(err); fail3D(err); });
}
function fail3D(err){
  const el=$('loadState');
  el.replaceChildren();
  const p=document.createElement('p');
  const b=document.createElement('b'); b.textContent='3D görünüm yüklenemedi.';
  p.append(b, document.createElement('br'),
    'Tarayıcınız ES modülleri/import map desteklemiyor olabilir veya 3B dosyaları alınamadı.',
    document.createElement('br'),
    'Kontrol paneli, gradient programı, analiz simülasyonu ve kromatogram tam olarak çalışmaya devam eder.');
  if(err){ const c=document.createElement('code'); c.textContent=String(err.message||err); p.append(document.createElement('br'),c); }
  el.append(p);
  el.style.background='rgba(5,8,12,.92)';
}
function waitThree(){
  if(window.THREE && window.THREE.WebGLRenderer){ boot3D(); return; }
  window.addEventListener('three-ready',boot3D,{once:true});
  window.addEventListener('three-failed',e=>fail3D(e.detail),{once:true});
  setTimeout(()=>{ if(!window.THREE) fail3D(new Error('three.js 20 s içinde yüklenemedi')); },20000);
}

/* ---------- Başlangıç ---------- */
initUI();
requestAnimationFrame(frame);
waitThree();
