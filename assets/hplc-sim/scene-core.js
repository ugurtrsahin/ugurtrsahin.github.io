'use strict';
/* ==========================================================================
   3) 3B ÇEKİRDEK — renderer, renk yönetimi, ortam aydınlatması (IBL), ortam
   gölgelemesi (GTAO) ve iki cihaz modelinin (Blender glTF modeli veya yedek
   prosedürel model) ortak kullandığı yapı taşları.

   "Rig" sözleşmesi: cihaz modelini kuran fonksiyon aşağıdaki V alanlarını doldurur;
   animasyon ve etkileşim kodu yalnızca bu alanları kullanır, hangi modelin
   yüklendiğini bilmez.
     V.modules[id]   : {group, outline, focus:{pos,target}}   (registerModule)
     V.segDefs       : akış hattı tanımları (dünya koordinatı noktaları)
     V.colAxis       : {p0,p1,r} kolon giriş/çıkış ekseni ve iç yarıçapı
     V.screens[ad]   : {mesh,ctx,tex,w,h} dinamik ekran dokuları
     V.pistons       : [{obj,base,dir,amp}]  pompa pistonları (yerel eksende öteleme)
     V.needle        : {obj,base,dir,amp}    enjeksiyon iğnesi
     V.injValve      : {obj,base,axis}       enjeksiyon valfi rotoru (yerel eksende dönme)
     V.leds          : {pump,oven,det,as}    emisif LED malzemeleri
     V.bottleLiquids : [{obj,base}]  A ve B sıvıları (alt yüzeyden ölçeklenen pivot)
     V.wasteLiquid   : {obj,base,min,max}
     V.cell          : {pos,dir,len}  akış hücresi ışın konumu
   Ölçek: 1 birim = 10 cm (glTF modeli metre cinsindendir ve 10 ile ölçeklenir).
   ========================================================================== */

const V = {
  ok:false, scene:null, cam:null, renderer:null, composer:null, gtao:null, ray:null,
  rig:'', quality:'high',
  modules:{}, segDefs:[], segments:[], bands:[], dots:[], screens:{}, labels:[], labelAnchors:[],
  pistons:[], needle:null, injValve:null, leds:{}, bottleLiquids:[], wasteLiquid:null,
  cell:null, cellGlow:null, beam:null, colAxis:null, particleR:0.022, stackBox:null
};

/* ---------- Sahne, kamera, renderer ---------- */
function createStage(canvas){
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x070b10);
  scene.fog=new THREE.Fog(0x070b10, 34, 80);

  const cam=new THREE.PerspectiveCamera(40, 1, 0.05, 200);

  const renderer=new THREE.WebGLRenderer({canvas:canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  /* Renk yönetimi: malzeme renkleri sRGB olarak yazılır, hesaplar lineer uzayda yapılır,
     çıkış sRGB'ye kodlanır. Ton eşleme (Khronos PBR Neutral) taban renklerini mümkün
     olduğunca korurken parlak vurguları sıkıştırır; ürün görselleştirmesinde tercih edilir. */
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NeutralToneMapping;
  renderer.toneMappingExposure=1.0;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;   // r18x: yumuşak PCF, shadow.radius ile

  /* Ortam aydınlatması (IBL): metalik yüzeyler rengini yansıttıkları çevreden alır.
     Ortam haritası olmadan %85–100 metalik yüzeyler neredeyse siyah görünür. */
  const pmrem=new THREE.PMREMGenerator(renderer);
  const room=new THREE.RoomEnvironment();
  scene.environment=pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity=0.85;
  pmrem.dispose();

  /* Doğrudan ışıklar: anahtar (gölgeli), dolgu ve arka kenar ışığı */
  scene.add(new THREE.HemisphereLight(0xbcd4ec, 0x0a0e13, 0.35));
  const key=new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(10,18,12); key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.near=2; key.shadow.camera.far=60;
  key.shadow.camera.left=-11; key.shadow.camera.right=11;
  key.shadow.camera.top=15; key.shadow.camera.bottom=-5;
  key.shadow.bias=-0.0004; key.shadow.normalBias=0.02;
  key.shadow.radius=3;
  scene.add(key);
  const fill=new THREE.DirectionalLight(0x9cc4ff, 0.55); fill.position.set(-13,7,9); scene.add(fill);
  const rim =new THREE.DirectionalLight(0x25d0c4, 0.9);  rim.position.set(-7,8,-13); scene.add(rim);

  /* Zemin ve laboratuvar tezgâhı (üst yüzey y = 0) */
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(90,90),
      new THREE.MeshStandardMaterial({color:0x0b1016, roughness:0.95, metalness:0}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-9.0; floor.receiveShadow=true; scene.add(floor);
  const benchTop=new THREE.Mesh(roundedBoxGeom(17,0.4,9.2,0.06,0.03),
      new THREE.MeshStandardMaterial({color:0x20262d, roughness:0.62, metalness:0.0}));
  benchTop.position.set(-0.8,-0.2,0); benchTop.receiveShadow=true; benchTop.castShadow=true; scene.add(benchTop);
  const benchEdge=new THREE.Mesh(new THREE.BoxGeometry(17,0.035,0.05), glow(0x15556b,0.35));
  benchEdge.position.set(-0.8,-0.03,4.62); scene.add(benchEdge);
  const cabinet=new THREE.Mesh(new THREE.BoxGeometry(16.4,8.6,8.4),
      new THREE.MeshStandardMaterial({color:0x10151b, roughness:0.85, metalness:0}));
  cabinet.position.set(-0.8,-4.7,-0.2); cabinet.receiveShadow=true; scene.add(cabinet);

  V.scene=scene; V.cam=cam; V.renderer=renderer;
  V.ray=new THREE.Raycaster();
  setupComposer();
  return V;
}

/* ---------- Son işleme: çok örneklemeli hedef + GTAO + çıkış (ton eşleme, sRGB) ---------- */
function setupComposer(){
  const r=V.renderer;
  const rt=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType, samples:4});
  const comp=new THREE.EffectComposer(r, rt);
  comp.addPass(new THREE.RenderPass(V.scene, V.cam));
  const gtao=new THREE.GTAOPass(V.scene, V.cam, 1, 1);
  gtao.updateGtaoMaterial({radius:0.35, distanceExponent:1.4, thickness:1.2, scale:1.15, samples:16});
  gtao.updatePdMaterial({lumaPhi:10, depthPhi:2, normalPhi:3, radius:5, rings:2, samples:16});
  gtao.blendIntensity=0.9;
  /* Saydam yüzeyler (cam kapak, şişe, vial) normal/derinlik geçişine katılmaz; aksi halde
     camın arkasındaki iç bölmede AO hesaplanamaz ve camın kendisi gölgelenir. */
  gtao._overrideVisibility=function(){
    const cache=this._visibilityCache;
    this.scene.traverse(o=>{
      if(!o.visible) return;
      if(o.isPoints||o.isLine||o.isLine2||(o.isMesh&&o.material&&o.material.transparent)){
        o.visible=false; cache.push(o);
      }
    });
  };
  comp.addPass(gtao);
  comp.addPass(new THREE.OutputPass());
  V.composer=comp; V.gtao=gtao;
}

/* Kalite profili: 'high' = GTAO + çok örneklemeli son işleme; 'std' = doğrudan çizim.
   Dokunmatik/küçük ekranlı cihazlarda varsayılan 'std'dir (GPU bütçesi). */
function setQuality(q){
  V.quality=q;
  if(V.renderer){
    V.renderer.setPixelRatio(Math.min(q==='high'?2:1.5, window.devicePixelRatio||1));
    V.renderer.shadowMap.needsUpdate=true;
  }
  resize3D();
}
function render3D(){
  if(V.quality==='high' && V.composer) V.composer.render();
  else V.renderer.render(V.scene, V.cam);
}

/* ---------- Malzeme ve geometri yardımcıları ---------- */
function roundedBoxGeom(w,h,d,r,b){
  b=b||0.03; r=Math.min(r, w/2-0.001, h/2-0.001);
  const s=new THREE.Shape(), x=-w/2, y=-h/2;
  s.moveTo(x+r,y);
  s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(0.01,d-2*b),bevelEnabled:true,
        bevelSize:b,bevelThickness:b,bevelSegments:2,curveSegments:5});
  g.center(); g.computeVertexNormals();
  return g;
}
function metal(color,rough,metal_){ return new THREE.MeshStandardMaterial({color:color,roughness:rough!==undefined?rough:0.42,metalness:metal_!==undefined?metal_:0.85}); }
function plastic(color,rough){ return new THREE.MeshStandardMaterial({color:color,roughness:rough!==undefined?rough:0.6,metalness:0.0}); }
function glow(color,intensity){ return new THREE.MeshStandardMaterial({color:0x0a0f14,emissive:color,emissiveIntensity:intensity||1.4,roughness:0.4,metalness:0}); }

/* Dinamik ekran (canvas doku) — yeni düzlem oluşturur */
function makeScreen(wpx,hpx,wu,hu){
  const cv=document.createElement('canvas'); cv.width=wpx; cv.height=hpx;
  const ctx=cv.getContext('2d');
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=4;
  const mat=new THREE.MeshBasicMaterial({map:tex, toneMapped:false});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(wu,hu),mat);
  return {mesh,ctx,tex,w:wpx,h:hpx};
}
/* Var olan bir modele (glTF) canvas dokusu bağlar. glTF UV kuralı (v=0 üstte) nedeniyle
   flipY kapatılır. */
function screenOnMesh(mesh,wpx,hpx){
  const cv=document.createElement('canvas'); cv.width=wpx; cv.height=hpx;
  const ctx=cv.getContext('2d');
  const tex=new THREE.CanvasTexture(cv); tex.colorSpace=THREE.SRGBColorSpace;
  tex.flipY=false; tex.anisotropy=4;
  mesh.material=new THREE.MeshBasicMaterial({map:tex, toneMapped:false});
  mesh.userData.hl=false;
  return {mesh,ctx,tex,w:wpx,h:hpx};
}

/* ---------- Modül kaydı: seçilebilirlik, malzeme ayrıştırma, çerçeve, kamera odağı ---------- */
function registerModule(id, group, opts){
  opts=opts||{};
  group.userData.moduleId=id;
  /* Vurgulama emisif renk değiştirdiği için paylaşılan malzemeler modül başına kopyalanır;
     aksi halde bir modülün vurgusu aynı malzemeyi kullanan tüm modüllere yayılır. */
  const cache=new Map();
  group.traverse(o=>{
    if(!o.isMesh || !o.material || o.userData.noHL) return;
    const m=o.material;
    if(!cache.has(m)) cache.set(m, m.clone());
    o.material=cache.get(m);
    if(o.material.emissive && !o.material.transparent && o.userData.hl!==false) o.userData.hl=true;
    o.userData.baseEmissive=o.material.emissive?o.material.emissive.getHex():0;
  });
  group.updateWorldMatrix(true,true);
  const box=new THREE.Box3().setFromObject(group, true);
  const size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const pad=opts.pad||0.08;
  const outline=new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x+pad,size.y+pad,size.z+pad)),
    new THREE.LineBasicMaterial({color:0x25d0c4, transparent:true, opacity:0.9}));
  outline.position.copy(center); outline.visible=false; outline.userData.noHL=true;
  V.scene.add(outline);
  V.modules[id]={group, outline, box, focus:focusFor(box, opts.focusScale||1)};
  return V.modules[id];
}
/* Kutuyu kadraja sığdıran odak: hedef kutu merkezi, yön ana görünüm yönü */
function focusFor(box, scale){
  const center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  const rad=Math.max(0.35, size.length()/2);
  const fov=(V.cam?V.cam.fov:40)*Math.PI/180;
  const dist=rad/Math.sin(fov/2)*0.92*scale;
  const th=0.52, ph=1.22;
  const dir=new THREE.Vector3(Math.sin(ph)*Math.sin(th), Math.cos(ph), Math.sin(ph)*Math.cos(th));
  return {pos:center.clone().addScaledVector(dir,dist), target:center};
}

/* ---------- Kapiler hatlar ve akış partikülleri ---------- */
function makeTube(pts,radius,color,opacity){
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
  curve.curveType='catmullrom'; curve.tension=0.45;
  const geo=new THREE.TubeGeometry(curve, Math.max(32,pts.length*18), radius, 10, false);
  const mat=new THREE.MeshStandardMaterial({color:color,roughness:0.3,metalness:0.6,
      transparent:opacity!==undefined&&opacity<1,opacity:opacity===undefined?1:opacity});
  const mesh=new THREE.Mesh(geo,mat);
  mesh.castShadow=true; mesh.userData.moduleId='tubing'; mesh.userData.hl=true;
  return {curve,mesh,mat,len:curve.getLength()};
}
/* V.segDefs'ten tüpleri ve örnekli (instanced) partikülleri kurar.
   Partiküller segment başına tek çizim çağrısıdır (InstancedMesh). */
function buildFlowLines(){
  V.segments=[];
  const pGeo=new THREE.SphereGeometry(V.particleR,10,8);
  for(const sd of V.segDefs){
    let seg;
    if(sd.kind==='col'){
      const curve=new THREE.LineCurve3(V.colAxis.p0.clone(), V.colAxis.p1.clone());
      seg={id:sd.id,phase:'mix',curve,len:curve.getLength(),kind:'col',mesh:null,mat:null};
    } else {
      const t=makeTube(sd.pts,sd.r,sd.color, sd.kind==='lp'?0.96:1.0);
      V.scene.add(t.mesh);
      seg={id:sd.id,phase:sd.phase||'mix',curve:t.curve,len:t.len,kind:sd.kind,mesh:t.mesh,mat:t.mat};
    }
    const count=Math.max(4,Math.round(seg.len*2.4));
    const im=new THREE.InstancedMesh(pGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.9,toneMapped:false}),count);
    im.count=0; im.frustumCulled=false; im.userData.noHL=true;
    const col=new THREE.Color(seg.phase==='A'?0x59a6ff:seg.phase==='B'?0xb07fff:0x2ee0d3);
    for(let i=0;i<count;i++) im.setColorAt(i,col);
    V.scene.add(im);
    seg.parts={mesh:im, n:count, t:Array.from({length:count},(_,i)=>i/count)};
    V.segments.push(seg);
  }
}

/* ---------- Kolon içi analit bantları ve kolon sonrası noktalar ---------- */
function buildBandsAndDots(){
  const ax=V.colAxis, dir=new THREE.Vector3().subVectors(ax.p1,ax.p0);
  ax.len=dir.length(); dir.normalize(); ax.dir=dir;
  const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  V.bands=[]; V.dots=[];
  for(const a of ANALYTES){
    const band=new THREE.Mesh(new THREE.CylinderGeometry(ax.r,ax.r,1,20),
      new THREE.MeshBasicMaterial({color:new THREE.Color(a.color),transparent:true,opacity:0.9,depthWrite:false,toneMapped:false}));
    band.quaternion.copy(q); band.visible=false; band.renderOrder=3; band.userData.noHL=true;
    V.scene.add(band); V.bands.push({mesh:band,a:a});
    const d=new THREE.Mesh(new THREE.SphereGeometry(V.particleR*1.9,12,10),
      new THREE.MeshBasicMaterial({color:new THREE.Color(a.color),transparent:true,opacity:0.95,toneMapped:false}));
    d.visible=false; d.userData.noHL=true; V.scene.add(d);
    V.dots.push({mesh:d,a:a});
  }
  /* Akış hücresi: anlık sinyale göre parlayan ışın ve nokta ışık */
  if(V.cell){
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(V.cell.r||0.03,V.cell.r||0.03,V.cell.len,12),
      new THREE.MeshBasicMaterial({color:0xbfa8ff,transparent:true,opacity:0.35,depthWrite:false,toneMapped:false}));
    beam.position.copy(V.cell.pos);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),V.cell.dir.clone().normalize());
    beam.userData.noHL=true;
    V.scene.add(beam); V.beam=beam;
    V.cellGlow=new THREE.PointLight(0x9f7dff,0.0,3.0,1.5);
    V.cellGlow.position.copy(V.cell.pos).add(new THREE.Vector3(0,0,0.15));
    V.scene.add(V.cellGlow);
  }
}

/* ---------- Etiket çapaları: modül kutularından otomatik ---------- */
function buildLabelAnchors(){
  const ids=['degasser','pump','autosampler','oven','detector'];
  const stack=new THREE.Box3();
  ids.forEach(id=>{ if(V.modules[id]) stack.union(V.modules[id].box); });
  V.stackBox=stack;
  const text={bottles:'Mobil Faz',detector:'Dedektör',oven:'Kolon Fırını',column:'Kolon',
              autosampler:'Otosampler',pump:'Pompa',degasser:'Degazör',waste:'Atık'};
  V.labelAnchors=[];
  for(const id in text){
    const m=V.modules[id]; if(!m) continue;
    const c=m.box.getCenter(new THREE.Vector3());
    let p;
    if(ids.includes(id))      p=new THREE.Vector3(stack.max.x+0.75, c.y, stack.max.z-0.4);
    else if(id==='column')    p=new THREE.Vector3(stack.min.x-0.75, c.y, stack.max.z-0.4);
    else                      p=new THREE.Vector3(c.x, m.box.max.y+0.35, c.z);
    V.labelAnchors.push({id, text:text[id], p});
  }
}

/* ---------- Rig tamamlama: tüm ortak parçalar ---------- */
function finalizeRig(){
  buildFlowLines();
  buildBandsAndDots();
  buildLabelAnchors();
  /* Kapiler hatlar tek bir sanal modül olarak seçilir */
  const tb=new THREE.Box3();
  V.segments.forEach(s=>{ if(s.mesh) tb.expandByObject(s.mesh); });
  V.modules.tubing={group:null, outline:null, box:tb, focus:focusFor(tb,0.8)};
  /* Ana kamera görünümü: tüm cihaz kutusu */
  const all=new THREE.Box3();
  for(const id in V.modules) if(V.modules[id].group) all.union(V.modules[id].box);
  const c=all.getCenter(new THREE.Vector3()), sz=all.getSize(new THREE.Vector3());
  const r=Math.max(sz.y*1.05, sz.x*0.95)/Math.tan((V.cam.fov*Math.PI/180)/2)*0.62;
  CAM.home={r, theta:0.60, phi:1.33, target:c.clone()};
  CAM_BASE_R=r;
  camInit();
}
