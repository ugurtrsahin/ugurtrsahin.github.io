'use strict';
/* ==========================================================================
   3a) YEDEK CİHAZ MODELİ — Three.js primitifleriyle prosedürel HPLC yığını
   Blender glTF modeli (assets/models/hplc-system.glb) yüklenemediğinde kullanılır.
   Ölçek bu modelde 1 birim ≈ 5 cm'dir (görünürlük için oranlar bilinçli olarak
   büyütülmüştür); kamera ve etiketler modül kutularından otomatik türetildiği için
   iki modelin ölçeklerinin aynı olması gerekmez. Rig sözleşmesi: scene-core.js.
   ========================================================================== */

/* Yığın geometrisi (birim) */
const STACK = { w:4.2, d:3.0, x:0, z:0 };
const LAYOUT = {
  degasser:    {y:0.15, h:0.75},
  pump:        {y:0.95, h:1.50},
  autosampler: {y:2.50, h:1.70},
  oven:        {y:4.25, h:1.60},
  detector:    {y:5.90, h:1.50}
};
const COL_Y = 5.02, COL_X0 = -1.45, COL_X1 = 1.25, COL_Z = 0.55;

/* Modül gövdesi: metalik kasa + ön bezel + havalandırma + ayaklar
   opts.opening verilirse gövde kapalı kutu yerine önü açık kabuk olarak kurulur;
   böylece fırın içindeki kolon, otosampler vialleri ve dedektör akış hücresi
   gerçekten görünür (cam pencere arkasından). */
function buildChassis(id,name,h,opts){
  opts=opts||{};
  const g=new THREE.Group();
  const W=STACK.w, D=STACK.d, op=opts.opening;
  const bodyC=opts.bodyColor||0x9aa1a8, faceC=opts.faceColor||0x1c2127;

  const addMesh=(geo,mat,x,y,z)=>{
    const m=new THREE.Mesh(geo,mat);
    m.position.set(x,y,z);
    m.castShadow=true; m.receiveShadow=true; m.userData.hl=true;
    g.add(m); return m;
  };

  if(!op){
    /* Kapalı kasa (degazör, pompa) */
    addMesh(roundedBoxGeom(W,h,D,0.08,0.035), metal(bodyC,0.45,0.35),0,0,0);
    const fp=new THREE.Mesh(roundedBoxGeom(W-0.16,h-0.14,0.10,0.05,0.02), plastic(faceC,0.5));
    fp.position.z=D/2-0.01; fp.castShadow=true; fp.userData.hl=true; g.add(fp);
  } else {
    /* Önü açık kabuk: arka, yanlar, tavan, taban + pencere çerçevesi */
    const t=0.13, mb=metal(bodyC,0.45,0.35);
    addMesh(new THREE.BoxGeometry(W,h,t), mb, 0,0,-D/2+t/2);              // arka
    addMesh(new THREE.BoxGeometry(t,h,D), mb, -W/2+t/2,0,0);              // sol
    addMesh(new THREE.BoxGeometry(t,h,D), mb,  W/2-t/2,0,0);              // sağ
    addMesh(new THREE.BoxGeometry(W,t,D), mb, 0, h/2-t/2,0);              // tavan
    addMesh(new THREE.BoxGeometry(W,t,D), mb, 0,-h/2+t/2,0);              // taban
    /* İç yüzey (koyu mat) — derinlik hissi için */
    const inner=new THREE.Mesh(new THREE.BoxGeometry(W-2*t,h-2*t,0.02), plastic(0x0f1318,0.95));
    inner.position.z=-D/2+t+0.01; g.add(inner);

    const tf=0.15, mf=plastic(faceC,0.5), zf=D/2-tf/2;
    const barX=(x0,x1,y0,y1)=>{
      if(x1-x0<=0.001||y1-y0<=0.001) return;
      addMesh(new THREE.BoxGeometry(x1-x0,y1-y0,tf), mf, (x0+x1)/2,(y0+y1)/2, zf);
    };
    barX(-W/2, op.x0, -h/2, h/2);            // pencerenin solu
    barX(op.x1, W/2, -h/2, h/2);             // pencerenin sağı
    barX(op.x0, op.x1, -h/2, op.y0);         // pencerenin altı
    barX(op.x0, op.x1, op.y1, h/2);          // pencerenin üstü

    /* Dumanlı cam pencere */
    const glass=new THREE.Mesh(new THREE.BoxGeometry(op.x1-op.x0,op.y1-op.y0,0.03),
      new THREE.MeshStandardMaterial({color:op.tint||0x9fd8e8,transparent:true,depthWrite:false,
        opacity:op.opacity!==undefined?op.opacity:0.13,roughness:0.05,metalness:0.0}));
    glass.position.set((op.x0+op.x1)/2,(op.y0+op.y1)/2, D/2+0.01);
    glass.renderOrder=2;
    g.add(glass);
    /* Pencere iç aydınlatması — bölme içindeki parçalar seçilebilsin */
    const lamp=new THREE.PointLight(op.lampColor||0xbcd4e8, op.lamp!==undefined?op.lamp:0.7, 5.0, 1.2);
    lamp.position.set((op.x0+op.x1)/2,(op.y0+op.y1)/2, D/2-0.5);
    g.add(lamp);
  }

  /* Marka şeridi */
  const strip=new THREE.Mesh(new THREE.BoxGeometry(W-1.5,0.025,0.02), glow(0x1a9a92,0.45));
  strip.position.set(0,-h/2+0.16,D/2+0.05); strip.userData.noHL=true;
  g.add(strip);

  /* Yan havalandırma dilimleri */
  const ventMat=plastic(0x2a3036,0.9);
  for(let sgn=-1;sgn<=1;sgn+=2){
    for(let i=0;i<Math.max(3,Math.floor(h*4));i++){
      const v=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.035,D*0.55), ventMat);
      v.position.set(sgn*(W/2+0.002), -h/2+0.22+i*0.11, 0);
      g.add(v);
    }
  }
  /* Ayak/ara plakalar */
  const foot=new THREE.Mesh(new THREE.BoxGeometry(W*0.9,0.05,D*0.85), plastic(0x101318,0.8));
  foot.position.y=-h/2-0.025; g.add(foot);
  return g;
}

/* Port (fitting) — kapiler bağlantı noktası */
function addPort(parent,x,y,z,color){
  const p=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.075,0.14,12), metal(color||0x9aa6b2,0.3,0.95));
  p.rotation.x=Math.PI/2; p.position.set(x,y,z); parent.add(p);
  return p;
}
/* LED (vurgulamadan etkilenmez; emisif şiddeti animasyonla değişir) */
function addLED(parent,x,y,z,color,size){
  const l=new THREE.Mesh(new THREE.SphereGeometry(size||0.045,10,8), glow(color,1.6));
  l.position.set(x,y,z); l.userData.noHL=true; parent.add(l);
  return l;
}
/* Tabanı orijinde olan silindir (sıvı seviyesi y ekseninde ölçeklenir) */
function liquidCyl(r,h,seg,mat){
  const geo=new THREE.CylinderGeometry(r,r,h,seg); geo.translate(0,h/2,0);
  const m=new THREE.Mesh(geo,mat); m.renderOrder=1; return m;
}

/* ---------- Prosedürel rig ---------- */
function buildProceduralRig(){
  const scene=V.scene;
  V.rig='procedural';
  V.particleR=0.055;

  /* --- Degazör --- */
  const deg=buildChassis('degasser','Degazör',LAYOUT.degasser.h);
  deg.position.set(0,LAYOUT.degasser.y+LAYOUT.degasser.h/2,0);
  addPort(deg,-1.5,-0.06,STACK.d/2+0.06,0x8fa0b0);
  addPort(deg,-1.15,-0.06,STACK.d/2+0.06,0x8fa0b0);
  addPort(deg, 1.20,-0.06,STACK.d/2+0.06,0xb0bcc8);
  addLED(deg,1.75,0.16,STACK.d/2+0.06,0x59d97a);
  scene.add(deg);

  /* --- Pompa --- */
  const pump=buildChassis('pump','Pompa',LAYOUT.pump.h);
  pump.position.set(0,LAYOUT.pump.y+LAYOUT.pump.h/2,0);
  const pumpScreen=makeScreen(320,120,1.45,0.55);
  pumpScreen.mesh.position.set(-0.95,0.28,STACK.d/2+0.06); pumpScreen.mesh.userData.noHL=true;
  pump.add(pumpScreen.mesh); V.screens.pump=pumpScreen;
  /* Piston başlıkları (çalışırken hareket eder) */
  V.pistons=[];
  for(let i=0;i<2;i++){
    const head=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.34,16), metal(0xb8c2cc,0.3,0.95));
    head.rotation.x=Math.PI/2; head.position.set(0.75+i*0.5,-0.12,STACK.d/2+0.14);
    pump.add(head);
    V.pistons.push({obj:head, base:head.position.clone(), dir:new THREE.Vector3(0,0,1), amp:0.05});
  }
  addPort(pump,1.75,-0.34,STACK.d/2+0.06,0x9aa6b2);
  addPort(pump,1.90,0.55,STACK.d/2+0.06,0xd0d8e0);
  V.leds.pump=addLED(pump,1.85,0.32,STACK.d/2+0.07,0x4aa3ff).material;
  scene.add(pump);

  /* --- Otosampler --- */
  const as=buildChassis('autosampler','Otosampler',LAYOUT.autosampler.h,{
      opening:{x0:-1.95,x1:0.45,y0:-0.80,y1:0.42,tint:0x9fd8e8,opacity:0.14,lamp:0.75}});
  as.position.set(0,LAYOUT.autosampler.y+LAYOUT.autosampler.h/2,0);
  const tray=new THREE.Mesh(new THREE.BoxGeometry(2.3,0.06,1.1), plastic(0x1b222a,0.8));
  tray.position.set(-0.75,-0.62,0.55); as.add(tray);
  const vialMat=new THREE.MeshStandardMaterial({color:0xbfd5e2,transparent:true,opacity:0.6,roughness:0.1,metalness:0});
  const vialHi=new THREE.MeshStandardMaterial({color:0xffd27f,transparent:true,opacity:0.7,roughness:0.1,metalness:0});
  for(let r=0;r<2;r++) for(let c=0;c<7;c++){
    const vial=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.28,10),(r===0&&c===2)?vialHi:vialMat);
    vial.position.set(-1.70+c*0.32,-0.44,0.25+r*0.42); as.add(vial);
    const capv=new THREE.Mesh(new THREE.CylinderGeometry(0.078,0.078,0.05,10), plastic(0x2b3240,0.6));
    capv.position.set(-1.70+c*0.32,-0.28,0.25+r*0.42); as.add(capv);
  }
  /* Enjeksiyon iğnesi ve altı yollu valf */
  const needle=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.012,0.55,8), metal(0xdde5ec,0.25,1.0));
  needle.position.set(0.05,0.30,0.42); as.add(needle);
  V.needle={obj:needle, base:needle.position.clone(), dir:new THREE.Vector3(0,-1,0), amp:0.55};
  const valve=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.16,18), metal(0x8f9aa6,0.3,0.95));
  valve.rotation.x=Math.PI/2; valve.position.set(1.35,0.35,STACK.d/2+0.03); as.add(valve);
  V.injValve={obj:valve, base:valve.quaternion.clone(), axis:new THREE.Vector3(0,1,0), angle:Math.PI/3};
  V.leds.as=addLED(as,1.85,0.55,STACK.d/2+0.07,0x3a4450).material;
  addPort(as,1.95,-0.44,STACK.d/2+0.06,0x9aa6b2);
  addPort(as,1.95,0.60,STACK.d/2+0.06,0xd0d8e0);
  scene.add(as);

  /* --- Kolon Fırını --- */
  const oven=buildChassis('oven','Kolon Fırını',LAYOUT.oven.h,{
      opening:{x0:-1.90,x1:1.55,y0:-0.55,y1:0.58,tint:0x8fd6e0,opacity:0.10,
               lampColor:0xffc79a,lamp:0.85}});
  oven.position.set(0,LAYOUT.oven.y+LAYOUT.oven.h/2,0);
  const ovenScreen=makeScreen(220,110,0.72,0.36);
  ovenScreen.mesh.position.set(1.68,0.30,STACK.d/2+0.06); ovenScreen.mesh.userData.noHL=true;
  oven.add(ovenScreen.mesh); V.screens.oven=ovenScreen;
  V.leds.oven=addLED(oven,1.68,-0.12,STACK.d/2+0.07,0xff8f4a,0.04).material;
  addPort(oven,1.90,-0.50,STACK.d/2+0.06,0x9aa6b2);
  addPort(oven,1.95,0.62,STACK.d/2+0.06,0xd0d8e0);
  scene.add(oven);

  /* --- Kolon (fırın içinde, ayrı seçilebilir modül) --- */
  const colG=new THREE.Group();
  const colLen=COL_X1-COL_X0;
  /* Gövde kasıtlı olarak yarı saydam ("kesit") modellenir: paslanmaz çelik gövde
     opak olsaydı kolon içindeki bant ayrışması görülemezdi. */
  const colBody=new THREE.Mesh(new THREE.CylinderGeometry(0.155,0.155,colLen,24),
      new THREE.MeshStandardMaterial({color:0xcfd8e0,roughness:0.22,metalness:1.0,
        transparent:true,opacity:0.34,depthWrite:false}));
  colBody.rotation.z=Math.PI/2; colBody.position.set((COL_X0+COL_X1)/2,COL_Y,COL_Z);
  colBody.renderOrder=4; colG.add(colBody);
  for(const ex of [COL_X0,COL_X1]){
    const nut=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.20,0.20,6), metal(0x9aa6b2,0.3,0.95));
    nut.rotation.z=Math.PI/2; nut.position.set(ex,COL_Y,COL_Z); nut.userData.hl=true; colG.add(nut);
  }
  /* Kolon etiketi */
  const lab=makeScreen(512,128,1.25,0.28);
  lab.mesh.position.set((COL_X0+COL_X1)/2,COL_Y+0.115,COL_Z+0.115);
  lab.mesh.rotation.x=-0.55; lab.mesh.userData.noHL=true;
  colG.add(lab.mesh); V.screens.colLabel=lab;
  const colFill=new THREE.Mesh(new THREE.CylinderGeometry(0.108,0.108,colLen-0.02,20),
      new THREE.MeshBasicMaterial({color:0x1b4a63,transparent:true,opacity:0.16,depthWrite:false}));
  colFill.rotation.z=Math.PI/2; colFill.position.set((COL_X0+COL_X1)/2,COL_Y,COL_Z); colG.add(colFill);
  scene.add(colG);
  V.colAxis={p0:new THREE.Vector3(COL_X0,COL_Y,COL_Z), p1:new THREE.Vector3(COL_X1,COL_Y,COL_Z), r:0.125};

  /* --- Dedektör --- */
  const det=buildChassis('detector','Dedektör',LAYOUT.detector.h,{
      opening:{x0:0.45,x1:1.80,y0:-0.30,y1:0.48,tint:0x86c6d8,opacity:0.12,lamp:0.55}});
  det.position.set(0,LAYOUT.detector.y+LAYOUT.detector.h/2,0);
  const detScreen=makeScreen(420,150,1.85,0.66);
  detScreen.mesh.position.set(-0.95,0.18,STACK.d/2+0.06); detScreen.mesh.userData.noHL=true;
  det.add(detScreen.mesh); V.screens.det=detScreen;
  const cell=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.20,0.20), new THREE.MeshStandardMaterial({
      color:0xbfe6f2,transparent:true,opacity:0.45,roughness:0.05,metalness:0.1}));
  cell.position.set(1.15,0.10,0.75); det.add(cell);
  const lamp=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.34,14), glow(0xb08cff,0.8));
  lamp.rotation.z=Math.PI/2; lamp.position.set(0.52,0.10,0.75); lamp.userData.noHL=true; det.add(lamp);
  V.leds.det=addLED(det,1.85,0.48,STACK.d/2+0.07,0x3a4450).material;
  addPort(det,1.90,-0.42,STACK.d/2+0.06,0x9aa6b2);
  addPort(det,-1.90,-0.42,STACK.d/2+0.06,0xd0d8e0);
  scene.add(det);
  det.updateMatrixWorld(true);
  V.cell={pos:det.localToWorld(new THREE.Vector3(1.15,0.10,0.75)), dir:new THREE.Vector3(1,0,0), len:0.95, r:0.035};

  /* --- Üst tepsi + solvent şişeleri --- */
  const bottles=new THREE.Group();
  const trayTop=new THREE.Mesh(roundedBoxGeom(STACK.w+0.5,0.12,STACK.d+0.4,0.05,0.02), metal(0x8d949b,0.5,0.4));
  trayTop.position.set(0,7.46,0); trayTop.castShadow=true; trayTop.receiveShadow=true; trayTop.userData.hl=true;
  bottles.add(trayTop);
  const bottleDefs=[{x:-1.15,c:0x2f6fd0,lab:'A'},{x:0.15,c:0x7a4fd0,lab:'B'}];
  V.bottleLiquids=[];
  bottleDefs.forEach(bd=>{
    const gm=new THREE.MeshStandardMaterial({color:0xcfe6f0,transparent:true,opacity:0.22,roughness:0.05,
        metalness:0.0,side:THREE.DoubleSide,depthWrite:false});
    const glass=new THREE.Mesh(new THREE.CylinderGeometry(0.52,0.52,1.75,22,1,true),gm);
    glass.position.set(bd.x,7.52+0.875,-0.15); glass.renderOrder=2; bottles.add(glass);
    const bottom=new THREE.Mesh(new THREE.CylinderGeometry(0.52,0.52,0.05,22), gm);
    bottom.position.set(bd.x,7.545,-0.15); bottles.add(bottom);
    const liq=liquidCyl(0.485,1.25,22,new THREE.MeshStandardMaterial({color:bd.c,transparent:true,opacity:0.55,roughness:0.15,metalness:0.0}));
    liq.position.set(bd.x,7.55,-0.15); bottles.add(liq);
    V.bottleLiquids.push({obj:liq, base:liq.scale.clone()});
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.20,0.30,0.30,18), gm);
    neck.position.set(bd.x,9.34,-0.15); neck.renderOrder=2; bottles.add(neck);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.21,0.21,0.16,18), plastic(0x2c5aa8,0.5));
    cap.position.set(bd.x,9.55,-0.15); bottles.add(cap);
    const lbl=makeScreen(256,128,0.78,0.42);
    lbl.mesh.position.set(bd.x,8.5,0.39); lbl.mesh.userData.noHL=true; bottles.add(lbl.mesh);
    V.screens['bottle'+bd.lab]=lbl;
  });
  scene.add(bottles);

  /* --- Atık haznesi --- */
  const waste=new THREE.Group();
  const wm=new THREE.MeshStandardMaterial({color:0xd8cfae,transparent:true,opacity:0.22,roughness:0.15,side:THREE.DoubleSide,depthWrite:false});
  const wGlass=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,2.2,24,1,true),wm);
  wGlass.position.set(-5.3,1.1,0.6); wGlass.renderOrder=2; waste.add(wGlass);
  const wBottom=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,0.06,24), wm);
  wBottom.position.set(-5.3,0.03,0.6); waste.add(wBottom);
  const wLiq=liquidCyl(0.80,1.6,24,new THREE.MeshStandardMaterial({color:0x3f7f86,transparent:true,opacity:0.55,roughness:0.25}));
  wLiq.position.set(-5.3,0.06,0.6); waste.add(wLiq);
  V.wasteLiquid={obj:wLiq, base:wLiq.scale.clone(), min:0.31, max:1.0};
  const wNeck=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.5,0.32,18), wm);
  wNeck.position.set(-5.3,2.32,0.6); waste.add(wNeck);
  const wCap=new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.36,0.18,18), plastic(0x39404a,0.65));
  wCap.position.set(-5.3,2.54,0.6); waste.add(wCap);
  const wLbl=makeScreen(256,128,1.0,0.5);
  wLbl.mesh.position.set(-5.3,1.35,1.46); wLbl.mesh.userData.noHL=true; waste.add(wLbl.mesh); V.screens.waste=wLbl;
  scene.add(waste);

  scene.traverse(o=>{ if(o.isMesh && !o.material.transparent){ o.castShadow=true; o.receiveShadow=true; } });

  /* ================= KAPİLER HATLAR ================= */
  const D2=STACK.d/2;
  V.segDefs=[
    { id:'A', phase:'A', color:0x2f6fd0, r:0.045, kind:'lp', pts:[
      [-1.15,9.62,-0.15],[-1.15,9.95,0.15],[-2.05,9.6,0.5],[-2.62,8.4,0.85],
      [-2.62,5.0,1.05],[-2.62,1.9,1.30],[-2.25,0.62,1.55],[-1.5,0.55,D2+0.10]] },
    { id:'B', phase:'B', color:0x7a4fd0, r:0.045, kind:'lp', pts:[
      [0.15,9.62,-0.15],[0.15,10.0,0.2],[-0.85,9.75,0.62],[-2.30,8.2,1.0],
      [-2.30,5.0,1.22],[-2.30,1.9,1.44],[-1.95,0.58,1.62],[-1.15,0.55,D2+0.10]] },
    { id:'deg-pump', color:0xb9c4cf, r:0.038, kind:'hp', pts:[
      [1.20,0.55,D2+0.10],[1.95,0.62,1.85],[2.35,1.05,1.75],[2.10,1.40,1.68],[1.75,1.36,D2+0.10]] },
    { id:'pump-as', color:0xb9c4cf, r:0.038, kind:'hp', pts:[
      [1.90,2.25,D2+0.10],[2.45,2.45,1.80],[2.55,2.90,1.75],[2.20,3.08,1.68],[1.95,3.06,D2+0.10]] },
    { id:'as-col', color:0xb9c4cf, r:0.038, kind:'hp', pts:[
      [1.95,4.10,D2+0.10],[2.55,4.35,1.80],[2.60,4.95,1.70],[2.10,5.12,1.60],[1.90,4.87,D2+0.05],
      [1.30,4.62,0.90],[0.10,4.52,0.35],[-1.70,4.62,0.18],[-1.62,4.95,COL_Z]] },
    { id:'column', kind:'col' },
    { id:'col-det', color:0xb9c4cf, r:0.035, kind:'hp', pts:[
      [COL_X1,COL_Y,COL_Z],[1.85,5.18,0.45],[2.05,5.62,1.10],[1.95,5.75,D2+0.05],
      [2.60,6.05,1.75],[2.35,6.35,1.70],[1.90,6.38,D2+0.10],[1.15,6.55,0.95],[0.60,6.50,0.55],[0,6.50,0.40]] },
    { id:'det-waste', color:0x8f9aa6, r:0.042, kind:'lp', pts:[
      [0,6.50,0.40],[-0.9,6.42,0.70],[-1.90,6.38,D2+0.10],[-2.95,6.0,1.55],
      [-3.75,4.2,1.30],[-4.45,2.4,1.05],[-5.05,1.9,0.75],[-5.30,1.72,0.60]] }
  ];

  registerModule('degasser',deg);
  registerModule('pump',pump);
  registerModule('autosampler',as);
  registerModule('oven',oven);
  registerModule('column',colG,{focusScale:1.1});
  registerModule('detector',det);
  registerModule('bottles',bottles);
  registerModule('waste',waste);
}
