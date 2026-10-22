/* ==========================================================================
   three.js ÖNYÜKLEYİCİ (ES modülü)
   three.js r150'den beri yalnızca ES modülü olarak dağıtılıyor. Simülatörün geri
   kalanı klasik betiklerden oluştuğu için kütüphane ve kullanılan eklentiler burada
   dinamik olarak içe aktarılır ve tek bir global ad alanında (window.THREE)
   toplanır. Dinamik import kullanılmasının nedeni hata yakalamaktır: statik bir
   import başarısız olursa modül hiç çalışmaz ve kullanıcıya bilgi verilemez.
   Başarıda 'three-ready', başarısızlıkta 'three-failed' olayı yayınlanır.
   ========================================================================== */
const parts = [
  import('three'),
  import('three/addons/loaders/GLTFLoader.js'),
  import('three/addons/libs/meshopt_decoder.module.js'),
  import('three/addons/environments/RoomEnvironment.js'),
  import('three/addons/postprocessing/EffectComposer.js'),
  import('three/addons/postprocessing/RenderPass.js'),
  import('three/addons/postprocessing/GTAOPass.js'),
  import('three/addons/postprocessing/OutputPass.js')
];

Promise.all(parts).then(([core, gltf, meshopt, room, composer, renderPass, gtao, output]) => {
  window.THREE = Object.assign({}, core, {
    GLTFLoader: gltf.GLTFLoader,
    MeshoptDecoder: meshopt.MeshoptDecoder,
    RoomEnvironment: room.RoomEnvironment,
    EffectComposer: composer.EffectComposer,
    RenderPass: renderPass.RenderPass,
    GTAOPass: gtao.GTAOPass,
    OutputPass: output.OutputPass
  });
  window.dispatchEvent(new Event('three-ready'));
}).catch(err => {
  window.dispatchEvent(new CustomEvent('three-failed', { detail: err }));
});
