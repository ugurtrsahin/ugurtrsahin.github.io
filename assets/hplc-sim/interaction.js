'use strict';
/* ==========================================================================
   4) ETKİLEŞİM — kamera, seçim, etiketler, 3B animasyon döngüsü
   ========================================================================== */

const CAM = {
  target:null, targetGoal:null,
  r:17.4, rGoal:17.4, theta:0.596, thetaGoal:0.596, phi:1.339, phiGoal:1.339,
  home:{r:17.4,theta:0.596,phi:1.339,target:null},
  dragging:false, mode:'orbit', lastX:0, lastY:0, moved:0, pointers:new Map(), pinch:0
};
/* THREE asenkron yüklendiği için vektörler sahne kurulurken oluşturulur;
   ana görünüm (CAM.home) rig tamamlanırken cihaz kutusundan hesaplanır (finalizeRig). */
const CAM_MIN_R=1.2, CAM_MAX_R=70;
function camInit(){
  const t=CAM.home.target||new THREE.Vector3(0,4.4,0);
  CAM.home.target=t.clone();
  CAM.target=t.clone(); CAM.targetGoal=t.clone();
  CAM.r=CAM.rGoal=CAM.home.r; CAM.theta=CAM.thetaGoal=CAM.home.theta; CAM.phi=CAM.phiGoal=CAM.home.phi;
}

function camApply(){
  const sp=Math.sin(CAM.phi), cp=Math.cos(CAM.phi);
  V.cam.position.set(
    CAM.target.x + CAM.r*sp*Math.sin(CAM.theta),
    CAM.target.y + CAM.r*cp,
    CAM.target.z + CAM.r*sp*Math.cos(CAM.theta));
  V.cam.lookAt(CAM.target);
}
function camUpdate(dt){
  const k=1-Math.pow(0.0025, Math.min(dt,0.1));   // kare hızından bağımsız yumuşatma
  CAM.r     += (CAM.rGoal-CAM.r)*k;
  CAM.theta += (CAM.thetaGoal-CAM.theta)*k;
  CAM.phi   += (CAM.phiGoal-CAM.phi)*k;
  CAM.target.lerp(CAM.targetGoal,k);
  camApply();
}
function camFocus(pos,target){
  CAM.userZoom=true;
  const off=new THREE.Vector3().subVectors(pos,target);
  CAM.rGoal=clamp(off.length(),CAM_MIN_R,CAM_MAX_R);
  CAM.phiGoal=clamp(Math.acos(off.y/off.length()),0.12,1.55);
  CAM.thetaGoal=Math.atan2(off.x,off.z);
  CAM.targetGoal.copy(target);
}
function camHome(){ CAM.userZoom=false; CAM.rGoal=CAM.home.r; CAM.thetaGoal=CAM.home.theta; CAM.phiGoal=CAM.home.phi; CAM.targetGoal.copy(CAM.home.target); }

/* ---------- Girdi olayları ---------- */
function bindCameraEvents(canvas){
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);
    CAM.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(CAM.pointers.size===1){
      CAM.dragging=true; CAM.moved=0; CAM.lastX=e.clientX; CAM.lastY=e.clientY;
      CAM.mode=(e.button===2||e.button===1||e.shiftKey)?'pan':'orbit';
      canvas.classList.add('dragging');
    } else if(CAM.pointers.size===2){
      CAM.pinch=pointerDist();
    }
  });

  canvas.addEventListener('pointermove',e=>{
    if(CAM.pointers.has(e.pointerId)) CAM.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(CAM.pointers.size===2){                      /* iki parmak: yakınlaştır + kaydır */
      const d=pointerDist();
      if(CAM.pinch>0){ CAM.userZoom=true; CAM.rGoal=clamp(CAM.rGoal*(CAM.pinch/d),CAM_MIN_R,CAM_MAX_R); }
      CAM.pinch=d;
      return;
    }
    if(CAM.dragging){
      const dx=e.clientX-CAM.lastX, dy=e.clientY-CAM.lastY;
      CAM.lastX=e.clientX; CAM.lastY=e.clientY;
      CAM.moved+=Math.abs(dx)+Math.abs(dy);
      if(CAM.mode==='orbit'){
        CAM.thetaGoal-=dx*0.006;
        CAM.phiGoal=clamp(CAM.phiGoal-dy*0.005,0.12,1.55);
      }else{
        /* Kaydırma: kamera sağ vektörü boyunca yatay, dünya yukarısı boyunca dikey */
        const sc=CAM.r*0.0016;
        const right=new THREE.Vector3().setFromMatrixColumn(V.cam.matrix,0);
        CAM.targetGoal.addScaledVector(right,-dx*sc);
        CAM.targetGoal.y += dy*sc;
      }
    } else {
      hoverTest(e);
    }
  });

  const endPointer=e=>{
    canvas.classList.remove('dragging');
    if(CAM.pointers.size<=1 && CAM.dragging && CAM.moved<6) clickTest(e);
    CAM.pointers.delete(e.pointerId);
    if(CAM.pointers.size<2) CAM.pinch=0;
    if(CAM.pointers.size===0) CAM.dragging=false;
  };
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',e=>{CAM.pointers.delete(e.pointerId);CAM.dragging=false;canvas.classList.remove('dragging');});
  canvas.addEventListener('pointerleave',()=>{ if(!CAM.dragging){ S.hovered=null; applyHighlight(); }});

  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    CAM.userZoom=true;
    CAM.rGoal=clamp(CAM.rGoal*Math.exp(e.deltaY*0.0011),CAM_MIN_R,CAM_MAX_R);
  },{passive:false});

  function pointerDist(){
    const v=[...CAM.pointers.values()];
    if(v.length<2) return 0;
    return Math.hypot(v[0].x-v[1].x, v[0].y-v[1].y);
  }
}

/* ---------- Raycast ile modül seçimi ---------- */
function pickAt(ev){
  const canvas=V.renderer.domElement, rect=canvas.getBoundingClientRect();
  const nx=((ev.clientX-rect.left)/rect.width)*2-1;
  const ny=-((ev.clientY-rect.top)/rect.height)*2+1;
  V.ray.setFromCamera({x:nx,y:ny}, V.cam);
  const hits=V.ray.intersectObjects(V.scene.children,true);
  /* Saydam cam yüzeyler (kapak, pencere, şişe) seçimde "geçirgen" sayılır; böylece fırın
     camının arkasındaki kolon veya otosampler içindeki parçalar doğrudan seçilebilir.
     Arkada seçilebilir bir şey yoksa camın ait olduğu modül döner. */
  let glassHit=null;
  for(const h of hits){
    const o0=h.object;
    if(!o0.visible || o0.userData.noPick) continue;
    let o=o0, id=null;
    while(o){ if(o.userData && o.userData.moduleId){ id=o.userData.moduleId; break; } o=o.parent; }
    if(!id) continue;
    const m=o0.material;
    if(m && m.transparent && m.opacity<0.4 && !o0.userData.solid){ if(!glassHit) glassHit=id; continue; }
    return id;
  }
  return glassHit;
}
let hoverRAF=0;
function hoverTest(ev){
  if(hoverRAF) return;
  hoverRAF=requestAnimationFrame(()=>{
    hoverRAF=0;
    const id=pickAt(ev);
    if(id!==S.hovered){
      S.hovered=id;
      V.renderer.domElement.classList.toggle('pickable',!!id);
      applyHighlight();
    }
  });
}
function clickTest(ev){
  const id=pickAt(ev);
  if(id){ selectModule(id,true); }
}

/* ---------- Görsel vurgulama ---------- */
function applyHighlight(){
  for(const id in V.modules){
    const m=V.modules[id];
    if(!m.group) continue;
    const st=(S.selected===id)?2:(S.hovered===id?1:0);
    if(m.outline) m.outline.visible=(st>0);
    m.group.traverse(o=>{
      if(o.isMesh && o.userData.hl && !o.userData.noHL && o.material && o.material.emissive){
        o.material.emissive.setHex(st===2?0x0a3a3c:(st===1?0x06222a:(o.userData.baseEmissive||0)));
        o.material.emissiveIntensity=st?0.35:1.0;
      }
    });
  }
  /* Kapiler hatlar ayrı ele alınır */
  const tst=(S.selected==='tubing')?2:(S.hovered==='tubing'?1:0);
  for(const seg of V.segments){
    if(!seg.mat) continue;
    if(seg.mat.emissive) seg.mat.emissive.setHex(tst===2?0x0f6f68:(tst===1?0x0a4a45:0x000000));
  }
  /* Etiket durumları */
  for(const l of V.labels){
    l.el.classList.toggle('active', S.selected===l.id || S.hovered===l.id);
    l.el.classList.toggle('dim', S.eduMode && S.eduIdx>=0 && EDU_STEPS[S.eduIdx].m!==l.id);
  }
}

/* ---------- Etiket katmanı (çapalar: buildLabelAnchors, scene-core.js) ---------- */
function buildLabels(){
  const layer=document.getElementById('labelLayer');
  layer.replaceChildren();
  V.labels=V.labelAnchors.map(a=>{
    const el=document.createElement('div');
    el.className='mlabel'; el.textContent=a.text;
    el.style.pointerEvents='auto'; el.style.cursor='pointer';
    el.addEventListener('click',()=>selectModule(a.id,true));
    layer.appendChild(el);
    return {id:a.id, el, v:a.p.clone()};
  });
}
let _pv=null;
function updateLabels(){
  if(!_pv) _pv=new THREE.Vector3();
  const canvas=V.renderer.domElement;
  const w=canvas.clientWidth, h=canvas.clientHeight;
  for(const l of V.labels){
    if(!S.showLabels){ l.el.style.display='none'; continue; }
    _pv.copy(l.v).project(V.cam);
    if(_pv.z>1){ l.el.style.display='none'; continue; }
    l.el.style.display='block';
    l.el.style.left=((_pv.x*0.5+0.5)*w)+'px';
    l.el.style.top =((-_pv.y*0.5+0.5)*h)+'px';
  }
}

/* ---------- Modül seçimi ---------- */
function selectModule(id, focus){
  S.selected=id;
  renderInfo(id);
  showTab('info');
  if(focus && V.modules[id]) camFocus(V.modules[id].focus.pos, V.modules[id].focus.target);
  applyHighlight();
}

/* ==========================================================================
   3B ANİMASYON — akış partikülleri, analit bantları, cihaz göstergeleri
   ========================================================================== */
const FLOWV = 0.42;            // birim/s — görsel akış hızı ölçeği (1 mL/dk için)
let _v3=null, _q=null, _m4=null, _axisQ=null;
let screenClock=0;

function updateFlow3D(dt){
  if(!_v3){ _v3=new THREE.Vector3(); _q=new THREE.Quaternion(); _m4=new THREE.Matrix4(); _axisQ=new THREE.Quaternion(); }
  const running=(S.phase==='running');
  const pumpOn = running || S.flowMode;
  const phi = running ? phiProgram(S.t) : (S.mode==='iso'? S.isoB/100 : phiProgram(0));
  const now=performance.now()*0.001;

  /* Partiküller (segment başına tek InstancedMesh) */
  const v=FLOWV*Math.max(0.15,S.flow);
  const colA=new THREE.Color(0x59a6ff), colB=new THREE.Color(0xb07fff), mix=new THREE.Color();
  mix.copy(colA).lerp(colB,phi);
  const sc=S.flowMode?1.25:1.0;
  for(const seg of V.segments){
    const P=seg.parts, im=P.mesh, n=P.n;
    let shown=n;
    if(seg.phase==='A') shown=Math.round(n*(1-phi));
    if(seg.phase==='B') shown=Math.round(n*phi);
    if(!pumpOn || seg.kind==='col') shown=0;
    for(let i=0;i<shown;i++){
      P.t[i]=(P.t[i] + v*dt/Math.max(0.5,seg.len))%1;
      seg.curve.getPointAt(P.t[i],_v3);
      _m4.makeScale(sc,sc,sc).setPosition(_v3);
      im.setMatrixAt(i,_m4);
      if(seg.phase==='mix') im.setColorAt(i,mix);
    }
    im.count=shown;
    im.instanceMatrix.needsUpdate=true;
    if(im.instanceColor && seg.phase==='mix') im.instanceColor.needsUpdate=true;
    im.material.opacity=S.flowMode?1.0:0.8;
    /* Akış yolu modunda hattın kendisi hafifçe parlar */
    if(seg.mat && seg.mat.emissive && S.selected!=='tubing' && S.hovered!=='tubing'){
      seg.mat.emissive.setHex(S.flowMode?0x0b4652:0x000000);
    }
  }

  /* Pompa pistonları: iki piston ters fazda (180°) çalışır */
  const ph=now*Math.max(0.3,S.flow)*3.2;
  V.pistons.forEach((p,i)=>{
    const off=pumpOn?Math.sin(ph+i*Math.PI)*p.amp:0;
    p.obj.position.copy(p.base).addScaledVector(p.dir,off);
  });
  const L=V.leds;
  if(L.pump) L.pump.emissiveIntensity = pumpOn?(1.6+Math.sin(performance.now()*0.006)*0.5):0.25;
  if(L.oven) L.oven.emissiveIntensity = (S.temp>25)?1.4:0.3;
  if(L.det)  L.det.emissiveIntensity  = running?1.6:0.3;
  if(L.as)   L.as.emissiveIntensity   = running?1.2:0.3;
  if(L.deg)  L.deg.emissiveIntensity  = pumpOn?1.3:0.5;

  /* Enjeksiyon animasyonu: ilk ~0,12 dk içinde iğne iner/çıkar, valf INJECT konumuna döner */
  if(V.needle){
    let f=0;
    if(running && S.t<0.25) f=Math.sin(Math.PI*Math.min(1,S.t/0.12));
    V.needle.obj.position.copy(V.needle.base).addScaledVector(V.needle.dir,V.needle.amp*f);
  }
  if(V.injValve){
    const iv=V.injValve, on=(running && S.t>0.05);
    _axisQ.setFromAxisAngle(iv.axis,on?iv.angle:0);
    iv.obj.quaternion.copy(iv.base).multiply(_axisQ);
  }

  /* Analit bantları — kolon içi göç (kolon ekseni boyunca) */
  const res=S.result, ax=V.colAxis;
  if(res && running && ax){
    const idx=clamp(Math.floor(S.t/res.dtGrid),0,res.n-1);
    const lenScale=ax.len/2.7;                    // bant boyu kolon uzunluğuna oranlanır
    for(let i=0;i<V.bands.length;i++){
      const b=V.bands[i], tr=res.trajectories[i];
      const x=tr.x[idx];
      if(x>=0.999){ b.mesh.visible=false; }
      else{
        b.mesh.visible=true;
        b.mesh.position.lerpVectors(ax.p0,ax.p1,x);
        b.mesh.scale.y=(0.09+0.40*Math.sqrt(x))*lenScale;
        b.mesh.material.opacity=clamp(0.9-0.35*Math.sqrt(x),0.3,0.9);
      }
    }
    /* Kolon sonrası noktalar: elüsyondan sonra dedektöre ve atığa ilerler */
    const segCD=V.segments.find(s=>s.id==='col-det');
    const segDW=V.segments.find(s=>s.id==='det-waste');
    for(let i=0;i<V.dots.length;i++){
      const d=V.dots[i], tr=res.trajectories[i];
      if(S.t<tr.tR || S.t>tr.tR+3){ d.mesh.visible=false; continue; }
      const travelled=(S.t-tr.tR)*60/ (S.speed) * v;    // birim (görsel)
      if(travelled<segCD.len){ segCD.curve.getPointAt(travelled/segCD.len,_v3); }
      else if(travelled<segCD.len+segDW.len){ segDW.curve.getPointAt((travelled-segCD.len)/segDW.len,_v3); }
      else { d.mesh.visible=false; continue; }
      d.mesh.position.copy(_v3); d.mesh.visible=true;
    }
  } else {
    V.bands.forEach(b=>b.mesh.visible=false);
    V.dots.forEach(d=>d.mesh.visible=false);
  }

  /* Dedektör hücresi: anlık sinyale göre parlama */
  let sigNorm=0;
  if(res && (running || S.phase==='done')){
    const idx=clamp(Math.floor(S.t/res.dtGrid),0,res.n-1);
    const mx=Math.max(20,res.maxSignal||100);
    sigNorm=clamp((res.total[idx]-res.base[idx])/mx,0,1);
  }
  if(V.cellGlow) V.cellGlow.intensity=(running?0.4:0.1)+sigNorm*3.0;
  if(V.beam){ V.beam.material.opacity=(pumpOn?0.28:0.12)+sigNorm*0.6; V.beam.scale.set(1+sigNorm*0.5,1,1+sigNorm*0.5); }

  /* Atık hacmi yükselir */
  if(V.wasteLiquid && res){
    const w=V.wasteLiquid, prog=clamp(S.t/Math.max(0.1,S.run),0,1);
    w.obj.scale.y=w.base.y*(w.min+prog*(w.max-w.min));
  }

  /* Şişe sıvı seviyeleri (A ve B tüketimi) */
  if(V.bottleLiquids.length && res){
    const prog=clamp(S.t/Math.max(0.1,S.run),0,1);
    const consA=1-0.25*prog*(1-phi), consB=1-0.25*prog*phi;
    [consA,consB].forEach((c,i)=>{
      const l=V.bottleLiquids[i]; if(!l) return;
      l.obj.scale.y=l.base.y*c;
    });
  }

  /* Cihaz ekranları (5 Hz) */
  screenClock+=dt;
  if(screenClock>0.2){ screenClock=0; updateInstrumentScreens(phi); }
}

/* Statik ekran içerikleri (şişe etiketleri, kolon etiketi, atık) */
function drawStaticScreens(){
  const panel=(s,title,sub,accent)=>{
    const c=s.ctx,w=s.w,h=s.h;
    c.fillStyle='#f2f4f5'; c.fillRect(0,0,w,h);
    c.fillStyle=accent; c.fillRect(0,0,w,Math.round(h*0.16));
    c.fillStyle='#14202b'; c.font='bold '+Math.round(h*0.34)+'px system-ui,sans-serif';
    c.textAlign='center'; c.textBaseline='alphabetic'; c.fillText(title,w/2,h*0.56);
    c.fillStyle='#4b5b6b'; c.font=Math.round(h*0.15)+'px system-ui,sans-serif';
    c.fillText(sub,w/2,h*0.80);
    s.tex.needsUpdate=true;
  };
  if(V.screens.bottleA) panel(V.screens.bottleA,'A',AQUEOUS[S.solvA].label,'#3f8cff');
  if(V.screens.bottleB) panel(V.screens.bottleB,'B',SOLVENTS[S.solvB].label,'#a06bff');
  if(V.screens.waste)   panel(V.screens.waste,'ATIK','Organik solvent atığı','#e0a030');
  if(V.screens.colLabel){
    const s=V.screens.colLabel,c=s.ctx;
    c.fillStyle='#e6edf4'; c.fillRect(0,0,s.w,s.h);
    c.fillStyle='#101820'; c.font='bold '+Math.round(s.h*0.30)+'px system-ui,sans-serif'; c.textAlign='left';
    c.textBaseline='alphabetic';
    c.fillText(COLUMNS[S.col].label,s.w*0.03,s.h*0.42);
    c.fillStyle='#4b5b6b'; c.font=Math.round(s.h*0.20)+'px system-ui,sans-serif';
    c.fillText('Ters faz analitik kolon',s.w*0.03,s.h*0.75);
    c.fillStyle='#25d0c4'; c.fillRect(0,s.h*0.92,s.w,s.h*0.08);
    s.tex.needsUpdate=true;
  }
}

/* Cihaz üzerindeki dinamik ekranlar */
function updateInstrumentScreens(phi){
  const running=(S.phase==='running');
  const p=V.screens.pump;
  if(p){
    const c=p.ctx;
    c.fillStyle='#06120f'; c.fillRect(0,0,p.w,p.h);
    c.strokeStyle='#12352f'; c.lineWidth=2; c.strokeRect(1,1,p.w-2,p.h-2);
    c.fillStyle='#2ee0d3'; c.font='bold 34px ui-monospace,monospace'; c.textAlign='left';
    c.fillText((running||S.flowMode?S.flow.toFixed(3):'0.000'),14,44);
    c.fillStyle='#6f8f8b'; c.font='16px ui-monospace,monospace';
    c.fillText('mL/min',150,44);
    c.fillStyle='#7fd6ff'; c.font='bold 22px ui-monospace,monospace';
    c.fillText(Math.round((running||S.flowMode?pressureBar(phi):0))+' bar',14,84);
    c.fillStyle='#b08cff'; c.fillText('%B '+Math.round(phi*100),150,84);
    c.fillStyle=running?'#59d97a':'#3a4450';
    c.fillRect(p.w-26,12,14,14);
    p.tex.needsUpdate=true;
  }
  const o=V.screens.oven;
  if(o){
    const c=o.ctx;
    c.fillStyle='#150c06'; c.fillRect(0,0,o.w,o.h);
    c.strokeStyle='#3a2412'; c.lineWidth=2; c.strokeRect(1,1,o.w-2,o.h-2);
    c.fillStyle='#ff9f5a'; c.font='bold 40px ui-monospace,monospace'; c.textAlign='center';
    c.fillText(S.temp.toFixed(0)+'°C',o.w/2,58);
    c.fillStyle='#8a6a52'; c.font='16px ui-monospace,monospace';
    c.fillText('KOLON SICAKLIĞI',o.w/2,88);
    o.tex.needsUpdate=true;
  }
  const d=V.screens.det;
  if(d){
    const c=d.ctx, res=S.result;
    c.fillStyle='#050d12'; c.fillRect(0,0,d.w,d.h);
    c.strokeStyle='#123040'; c.lineWidth=2; c.strokeRect(1,1,d.w-2,d.h-2);
    c.fillStyle='#4aa3ff'; c.font='15px ui-monospace,monospace'; c.textAlign='left';
    c.fillText(S.wl+' nm',10,20);
    c.textAlign='right'; c.fillText(fmt(S.t,2)+' dk',d.w-10,20);
    if(res){
      const idx=clamp(Math.floor(S.t/res.dtGrid),0,res.n-1);
      const from=Math.max(0,idx-500);
      let mx=1; for(let i=from;i<=idx;i++) mx=Math.max(mx,res.total[i]);
      c.strokeStyle='#2ee0d3'; c.lineWidth=2; c.beginPath();
      for(let i=from;i<=idx;i++){
        const x=10+((i-from)/Math.max(1,(idx-from)))*(d.w-20);
        const y=d.h-14-(res.total[i]/mx)*(d.h-46);
        i===from?c.moveTo(x,y):c.lineTo(x,y);
      }
      c.stroke();
    }
    d.tex.needsUpdate=true;
  }
}
