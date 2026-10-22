'use strict';
/* ==========================================================================
   3b) BLENDER glTF MODELİ — assets/models/hplc-system.glb
   Model tools/blender/build_hplc.py betiğiyle üretilir (gerçek ölçek, metre).
   Betik ile bu yükleyici arasındaki düğüm adlandırma sözleşmesi:
     Mod_<modül>          : modül kök düğümü; extras.moduleId seçim kimliğidir
     Screen_* / Label_*   : canvas dokusu bağlanan düzlemler; extras.px_w/px_h piksel boyutu
     LED_<ad>             : kendine ait emisif malzemeli LED
     Pivot_*              : hareketli parçaların pivotu (piston, iğne, valf, sıvı seviyeleri)
     Column_In/Column_Out : kolon ekseni uçları; extras.col_r kolon iç yarıçapı (m)
     Det_Cell             : akış hücresi ışın merkezi; extras.beam_len (m)
     FlowPaths            : extras.paths = akış hatlarının JSON tanımı (metre, Y yukarı)
   Malzeme adı "Glass*" → saydam cam, "Liquid*" → sıvı; çizim sırası buna göre ayarlanır.
   Ölçek: model 10 ile çarpılır (1 birim = 10 cm).
   ========================================================================== */

const GLTF_SCALE = 10;

function loadGLTFRig(url, onProgress){
  return new Promise((resolve,reject)=>{
    const loader=new THREE.GLTFLoader();
    loader.setMeshoptDecoder(THREE.MeshoptDecoder);
    loader.load(url, gltf=>{
      try{ buildGLTFRig(gltf.scene); resolve(); }
      catch(err){ reject(err); }
    }, ev=>{ if(onProgress && ev.lengthComputable) onProgress(ev.loaded/ev.total); }, reject);
  });
}

function buildGLTFRig(root){
  V.rig='gltf';
  V.particleR=0.024;
  root.scale.setScalar(GLTF_SCALE);
  V.scene.add(root);
  root.updateMatrixWorld(true);

  const byName={};
  root.traverse(o=>{ if(o.name) byName[o.name]=o; });
  const need=n=>{ const o=byName[n]; if(!o) throw new Error('glTF düğümü eksik: '+n); return o; };

  /* --- Malzemeler: cam, sıvı, kolon kesiti; gölgeler --- */
  root.traverse(o=>{
    if(!o.isMesh) return;
    const mn=(o.material&&o.material.name)||'';
    if(/^Glass/.test(mn)){
      o.material.transparent=true; o.material.depthWrite=false; o.renderOrder=2;
      /* Ortam yansıması camda zayıflatılır: aksi halde parlak IBL camı sütlü gösterir ve
         iç bölme (kolon, vialler, lamba) seçilemez hale gelir. */
      o.material.envMapIntensity=0.3;
      o.castShadow=false; o.receiveShadow=false;
    } else if(/^Liquid/.test(mn)){
      o.material.transparent=true; o.material.depthWrite=false; o.renderOrder=1;
      o.castShadow=false; o.receiveShadow=false; o.userData.solid=true;
    } else if(/Cutaway/.test(mn)){
      /* Kolon gövdesi kasıtlı olarak yarı saydam ("kesit"): içerideki bant ayrışması görülsün */
      o.material.transparent=true; o.material.opacity=0.38; o.material.depthWrite=false;
      o.renderOrder=4; o.castShadow=false; o.userData.solid=true;
    } else {
      o.castShadow=true; o.receiveShadow=true;
    }
    if(/^(LED_|Emit)/.test(mn) || /^(Screen_|Label_)/.test(o.name)) o.userData.noHL=true;
  });

  /* --- Dinamik ekranlar ve etiketler --- */
  const scr=(node,key)=>{
    const o=need(node), mesh=o.isMesh?o:o.getObjectByProperty('isMesh',true);
    const ud=o.userData||{};
    V.screens[key]=screenOnMesh(mesh, ud.px_w||256, ud.px_h||128);
  };
  scr('Screen_pump','pump'); scr('Screen_oven','oven'); scr('Screen_det','det');
  scr('Label_column','colLabel'); scr('Label_A','bottleA'); scr('Label_B','bottleB'); scr('Label_waste','waste');

  /* --- LED'ler (malzeme kopyası: her LED bağımsız yanıp söner) --- */
  const led=(node,key)=>{
    const o=need(node), mesh=o.isMesh?o:o.getObjectByProperty('isMesh',true);
    mesh.material=mesh.material.clone(); mesh.userData.noHL=true;
    V.leds[key]=mesh.material;
  };
  led('LED_pump','pump'); led('LED_oven','oven'); led('LED_det','det'); led('LED_as','as'); led('LED_deg','deg');

  /* --- Hareketli parçalar --- */
  const piv=n=>need('Pivot_'+n);
  V.pistons=['piston_L','piston_R'].map(n=>{ const o=piv(n);
    return {obj:o, base:o.position.clone(), dir:new THREE.Vector3(0,0,1), amp:0.006}; });
  const nd=piv('needle');
  V.needle={obj:nd, base:nd.position.clone(), dir:new THREE.Vector3(0,-1,0), amp:0.034};
  const vv=piv('valve');
  V.injValve={obj:vv, base:vv.quaternion.clone(), axis:new THREE.Vector3(0,0,1), angle:Math.PI/3};
  V.bottleLiquids=['liquid_A','liquid_B'].map(n=>{ const o=piv(n); return {obj:o, base:o.scale.clone()}; });
  const wl=piv('liquid_waste');
  V.wasteLiquid={obj:wl, base:wl.scale.clone(), min:0.25, max:0.85};

  /* --- Kolon ekseni ve akış hücresi (dünya koordinatı) --- */
  const wp=n=>need(n).getWorldPosition(new THREE.Vector3());
  V.colAxis={p0:wp('Column_In'), p1:wp('Column_Out'), r:(need('Column_In').userData.col_r||0.0036)*GLTF_SCALE};
  const cellN=need('Det_Cell');
  V.cell={pos:wp('Det_Cell'), dir:new THREE.Vector3(1,0,0),
          len:(cellN.userData.beam_len||0.05)*GLTF_SCALE, r:0.0022*GLTF_SCALE};

  /* --- Akış hatları: extras.paths (metre) → dünya koordinatı --- */
  const fp=need('FlowPaths');
  let paths=fp.userData.paths;
  if(typeof paths==='string') paths=JSON.parse(paths);
  if(!Array.isArray(paths)) throw new Error('FlowPaths.paths geçersiz');
  const m=root.matrixWorld, tmp=new THREE.Vector3();
  V.segDefs=paths.map(p=>({
    id:p.id, phase:p.phase, kind:p.kind, r:(p.r||0)*GLTF_SCALE, color:p.color,
    pts:(p.pts||[]).map(q=>{ tmp.set(q[0],q[1],q[2]).applyMatrix4(m); return [tmp.x,tmp.y,tmp.z]; })
  }));

  /* --- İç bölme aydınlatması: cam kapakların arkası karanlık kalmasın --- */
  for(const [n,col,int] of [['Lamp_as',0xdfeaff,0.9],['Lamp_oven',0xffd2a8,0.8],['Lamp_det',0xd8c8ff,0.7]]){
    const l=new THREE.PointLight(col,int,2.6,1.6);
    l.position.copy(wp(n)); V.scene.add(l);
  }

  /* --- Modül kaydı --- */
  const mods=['degasser','pump','autosampler','oven','column','detector','bottles','waste'];
  for(const id of mods) registerModule(id, need('Mod_'+id), {focusScale:id==='column'?1.25:1});
}
