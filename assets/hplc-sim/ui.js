'use strict';
/* ==========================================================================
   6) KULLANICI ARAYÜZÜ — kontrol paneli, durum LED'leri, tablolar, ana döngü
   ========================================================================== */
const $=id=>document.getElementById(id);

/* ---------- Sekmeler ---------- */
function showTab(name){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active',p.id==='pane-'+name));
}

/* ---------- Modül bilgi kartı ---------- */
function renderInfo(id){
  const m=MODULES[id]; if(!m) return;
  const specs=m.specs.map(s=>'<dt>'+s[0]+'</dt><dd>'+s[1]+'</dd>').join('');
  const prin=m.principle.map(p=>'<li>'+p+'</li>').join('');
  $('infoBody').innerHTML=
    '<div class="info-card">'+
      '<div class="kicker">'+m.kicker+'</div>'+
      '<h2>'+m.title+'</h2>'+
      '<p>'+m.desc+'</p>'+
      '<h4>Çalışma Prensibi</h4><ul>'+prin+'</ul>'+
      '<h4>Teknik Parametreler</h4><dl class="speclist">'+specs+'</dl>'+
      (id==='column'? '<div class="note">3B görünümde kolon gövdesi bilinçli olarak <b>yarı saydam (kesit)</b> '+
        'modellenmiştir; gerçek kolon gövdesi opaktır ve iç kısmı görülemez.<br>Seçili kolon: <b>'+COLUMNS[S.col].label+
        '</b> — hesaplanan ölü zaman t<sub>0</sub> = '+fmt(colGeom().t0,2)+' dk, V<sub>M</sub> = '+
        fmt(colGeom().Vm,2)+' mL.</div>' : '')+
    '</div>';
}

/* ---------- Durum LED'leri ---------- */
function setLeds(){
  const st={hazir:false,pompa:false,enjeksiyon:false,analiz:false,tamam:false};
  const blink={};
  if(S.phase==='idle'){ st.hazir=true; if(S.flowMode){st.pompa=true;blink.pompa=true;} }
  else if(S.phase==='running'){
    st.pompa=true;
    if(S.t<0.2){ st.enjeksiyon=true; blink.enjeksiyon=true; }
    else { st.analiz=true; blink.analiz=true; }
  }
  else if(S.phase==='paused'){ st.hazir=true; }
  else if(S.phase==='done'){ st.tamam=true; st.hazir=true; }
  document.querySelectorAll('.led').forEach(el=>{
    const k=el.dataset.led;
    el.classList.toggle('on',!!st[k]);
    el.classList.toggle('blink',!!blink[k]);
  });
}

/* ---------- Göstergeler ---------- */
function updateGauges(){
  const running=(S.phase==='running');
  const phi=running?phiProgram(S.t):(S.mode==='iso'?S.isoB/100:phiProgram(0));
  const f=(running||S.flowMode)?S.flow:0;
  $('gFlow').innerHTML=fmt(f,2)+'<small>mL/dk</small>';
  $('gFlowBar').style.width=(f/3*100)+'%';
  const p=(running||S.flowMode)?pressureBar(phi):0;
  $('gPress').innerHTML=Math.round(p)+'<small>bar</small>';
  const pmax=(COLUMNS[S.col].dp<2)?1000:400;
  $('gPressBar').style.width=clamp(p/pmax*100,0,100)+'%';
  $('gaugePress').classList.toggle('hi',p>pmax*0.9);
  $('gTime').innerHTML=fmt(S.t,2)+'<small>dk</small>';
  $('gTimeBar').style.width=clamp(S.t/S.run*100,0,100)+'%';
  $('chipB').textContent=Math.round(phi*100);
  $('chipWl').textContent=S.wl;
  $('chipT0').textContent=fmt(colGeom().t0,2);
}

/* ---------- Gradient tablosu ---------- */
function renderGradTable(){
  const tb=$('gradTable').querySelector('tbody');
  tb.innerHTML='';
  S.grad.forEach((row,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td><input type="number" step="0.1" min="0" value="'+row.t+'" data-i="'+i+'" data-k="t"></td>'+
                 '<td><input type="number" step="1" min="0" max="100" value="'+row.b+'" data-i="'+i+'" data-k="b"></td>'+
                 '<td><button class="rowdel" data-del="'+i+'" title="Basamağı sil">×</button></td>';
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('change',e=>{
      const i=+e.target.dataset.i, k=e.target.dataset.k;
      let v=parseFloat(e.target.value); if(isNaN(v)) v=0;
      if(k==='b') v=clamp(v,0,100); else v=Math.max(0,v);
      S.grad[i][k]=v;
      S.grad.sort((a,b)=>a.t-b.t);
      renderGradTable(); drawGradPreview();
    });
  });
  tb.querySelectorAll('.rowdel').forEach(b=>{
    b.addEventListener('click',e=>{
      if(S.grad.length<=2) return;
      S.grad.splice(+e.target.dataset.del,1);
      renderGradTable(); drawGradPreview();
    });
  });
  drawGradPreview();
}
function drawGradPreview(){
  const cv=$('gradPreview'), c=cv.getContext('2d');
  const W=cv.width,H=cv.height;
  c.clearRect(0,0,W,H);
  c.fillStyle='#0a1119'; c.fillRect(0,0,W,H);
  const pad=22, maxT=Math.max(S.run,S.grad[S.grad.length-1].t||1);
  c.strokeStyle='#1b2836'; c.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=pad+(H-2*pad)*i/4;
    c.beginPath(); c.moveTo(pad,y); c.lineTo(W-pad,y); c.stroke();
  }
  c.strokeStyle='#a06bff'; c.lineWidth=3; c.beginPath();
  for(let i=0;i<=140;i++){
    const t=maxT*i/140, x=pad+(W-2*pad)*(t/maxT), y=pad+(H-2*pad)*(1-phiProgram(t));
    i===0?c.moveTo(x,y):c.lineTo(x,y);
  }
  c.stroke();
  c.fillStyle='#5f7185'; c.font='18px ui-monospace,monospace';
  c.textAlign='left'; c.fillText('%B',6,pad+6);
  c.textAlign='right'; c.fillText(fmt(maxT,0)+' dk',W-6,H-6);
}

/* ---------- Sonuç tablosu ---------- */
function renderResults(){
  const tb=$('resTable').querySelector('tbody');
  const res=S.result;
  if(!res){ tb.innerHTML=''; return; }
  const idx=revealedIndex();
  const tNow=(idx>=0)?res.time[idx]:0;
  let html='';
  for(const p of res.eluting){
    if(p.tR>tNow) continue;
    html+='<tr>'+
      '<td><span class="swatch" style="background:'+p.a.color+'"></span>'+p.a.name+'</td>'+
      '<td>'+fmt(p.tR,2)+'</td><td>'+fmt(p.kObs,2)+'</td><td>'+Math.round(p.Nobs).toLocaleString('tr-TR')+'</td>'+
      '<td>'+fmt(p.area,0)+'</td><td>'+fmt(p.height,1)+'</td>'+
      '<td>'+(p.Rs?fmt(p.Rs,2):'—')+'</td></tr>';
  }
  const missing=res.peaks.filter(p=>!p.eluted);
  tb.innerHTML=html||'<tr><td colspan="7" style="text-align:center;color:#5f7185">Henüz pik elüe olmadı</td></tr>';
  let hint='Alan mAU·s, yükseklik mAU. N* ve R<sub>s</sub> yarı yükseklik genişliğinden (EP yöntemi) hesaplanır. '+
    (S.mode==='grad'
      ? '<b>Gradient modunda N* yalnızca görünür bir değerdir</b>: bant sıkışması nedeniyle izokratik verimin çok üzerinde çıkar ve sistem uygunluğu ölçütü olarak kullanılamaz.'
      : 'İzokratik modda N gerçek kolon verimini temsil eder.');
  if(missing.length) hint+=' <b style="color:#ffb347">Uyarı:</b> '+missing.map(p=>p.a.name).join(', ')+
      ' seçilen koşullarda analiz süresi içinde elüe olmadı (elüsyon gücü yetersiz veya süre kısa).';
  $('resHint').innerHTML=hint;

  /* Sistem uygunluğu özeti */
  const g=colGeom();
  $('suT0').textContent=fmt(g.t0,2)+' dk';
  $('suVm').textContent=fmt(g.Vm,2)+' mL';
  $('suU').textContent=fmt(g.u,3)+' cm/s';
  $('suN').textContent=Math.round(res.N).toLocaleString('tr-TR');
  const rss=res.eluting.filter(p=>p.Rs!=null).map(p=>p.Rs);
  $('suRs').textContent=rss.length?fmt(Math.min.apply(null,rss),2):'—';
  $('suP').textContent=Math.round(res.pMax)+' bar';
}

/* ---------- Eğitim modu ---------- */
function renderEdu(){
  const box=$('eduList');
  box.innerHTML='';
  EDU_STEPS.forEach((st,i)=>{
    const d=document.createElement('div');
    d.className='edu-step'+(i===S.eduIdx?' active':'')+(i<S.eduIdx?' done':'');
    d.innerHTML='<div class="n">'+(i+1)+'</div><div><div class="t">'+st.t+'</div><div class="d">'+st.d+'</div></div>';
    d.addEventListener('click',()=>gotoEdu(i));
    box.appendChild(d);
    if(i===S.eduIdx) setTimeout(()=>d.scrollIntoView({block:'nearest',behavior:'smooth'}),30);
  });
}
function gotoEdu(i){
  S.eduMode=true; S.eduIdx=clamp(i,0,EDU_STEPS.length-1);
  const step=EDU_STEPS[S.eduIdx];
  S.selected=step.m;
  renderInfo(step.m);
  if(V.ok && V.modules[step.m]) camFocus(V.modules[step.m].focus.pos, V.modules[step.m].focus.target);
  $('btnEdu').classList.add('active');
  renderEdu(); if(V.ok) applyHighlight();
  showTab('edu');
}

/* ---------- Analiz kontrolü ---------- */
function startRun(){
  if(S.phase==='paused'){                    /* duraklatılmışsa devam et */
    S.phase='running'; setLeds(); updateRunNote(); syncButtons(); return;
  }
  S.result=computeRun();
  let mx=1; for(let i=0;i<S.result.n;i++) mx=Math.max(mx,S.result.total[i]-S.result.base[i]);
  S.result.maxSignal=mx;
  S.t=0; S.phase='running';
  S.view.t0=0; S.view.t1=S.run; S.view.y0=-5; S.view.y1=60;
  setLeds(); updateRunNote(); syncButtons(); renderResults();
  if(V.ok) drawStaticScreens();
}
function stopRun(){
  if(S.phase!=='running') return;
  S.phase='paused'; setLeds(); updateRunNote(); syncButtons();
}
function resetAll(){
  S.phase='idle'; S.t=0; S.result=null;
  S.view.t0=0; S.view.t1=S.run; S.view.y0=-5; S.view.y1=60;
  S.eduMode=false; S.eduIdx=-1; S.selected=null;
  $('btnEdu').classList.remove('active');
  $('infoBody').innerHTML='<div class="info-empty">3D görünümde bir modüle tıklayın.<br>'+
    'Modülün görevi, çalışma prensibi ve tipik teknik parametreleri burada görüntülenecektir.</div>';
  renderEdu(); renderResults(); setLeds(); updateRunNote(); syncButtons();
  if(V.ok){ applyHighlight(); camHome(); drawStaticScreens(); }
}
function finishRun(){
  S.phase='done'; S.t=S.run;
  setLeds(); updateRunNote(); syncButtons(); renderResults();
}
function syncButtons(){
  $('btnStart').textContent=(S.phase==='paused')?'▶ Devam Et':'▶ Başlat';
  $('btnStart').disabled=(S.phase==='running');
  $('btnStop').disabled=(S.phase!=='running');
  const lock=(S.phase==='running');
  ['inFlow','inTemp','inInj','inWl','inRun','inMode','inB','inCol','inSolvA','inSolvB','btnAddRow']
    .forEach(id=>{ const el=$(id); if(el) el.disabled=lock; });
  $('gradTable').querySelectorAll('input,button').forEach(el=>el.disabled=lock);
}
function updateRunNote(){
  const n=$('runNote'), g=colGeom();
  if(S.phase==='running'){
    n.innerHTML='<b>Analiz sürüyor.</b> Pompa aktif, mobil faz kolondan geçiyor. '+
      'Anlık %B: '+Math.round(phiProgram(S.t)*100)+' · Basınç: '+Math.round(pressureBar(phiProgram(S.t)))+' bar · '+
      't<sub>0</sub> = '+fmt(g.t0,2)+' dk';
  } else if(S.phase==='paused'){
    n.innerHTML='<b>Analiz duraklatıldı.</b> Devam etmek için <b>Devam Et</b>, baştan başlamak için <b>Reset</b>.';
  } else if(S.phase==='done'){
    const res=S.result;
    const rss=res?res.eluting.filter(p=>p.Rs!=null).map(p=>p.Rs):[];
    n.innerHTML='<b>Analiz tamamlandı.</b> '+(res?res.eluting.length:0)+' pik elüe oldu'+
      (rss.length?(', en küçük çözünürlük R<sub>s</sub> = '+fmt(Math.min.apply(null,rss),2)):'')+
      '. Ayrıntılar için <b>Sonuçlar</b> sekmesine bakın.';
  } else {
    n.innerHTML='Sistem hazır. Parametreleri ayarlayıp <b>Başlat</b>\'a basın; pompa devreye girecek, '+
      'enjeksiyon gerçekleşecek ve kromatogram gerçek zamanlı oluşacaktır.';
  }
}

/* ---------- Kaydırıcı bağlama ---------- */
function bindRange(id,key,fmtFn,after){
  const el=$(id);
  const upd=()=>{
    const v=parseFloat(el.value);
    S[key]=v;
    const lab=$('v'+id.slice(2));
    if(lab) lab.innerHTML=fmtFn(v);
    el.style.setProperty('--fill', ((v-el.min)/(el.max-el.min)*100)+'%');
    if(after) after(v);
  };
  el.addEventListener('input',upd);
  upd();
}

function initUI(){
  bindRange('inFlow','flow',v=>fmt(v,2)+' <small>mL/dk</small>');
  bindRange('inTemp','temp',v=>fmt(v,0)+' <small>°C</small>');
  bindRange('inInj','inj', v=>fmt(v,0)+' <small>µL</small>');
  bindRange('inWl','wl',   v=>fmt(v,0)+' <small>nm</small>');
  bindRange('inRun','run', v=>fmt(v,0)+' <small>dk</small>', v=>{
      if(S.phase==='idle'){ S.view.t0=0; S.view.t1=v; } drawGradPreview();
  });
  bindRange('inB','isoB',  v=>fmt(100-v,0)+' / '+fmt(v,0)+' <small>A/B</small>', ()=>drawGradPreview());
  bindRange('inSpeed','speed',v=>'×'+fmt(v,0));

  $('inMode').addEventListener('change',e=>{
    S.mode=e.target.value;
    $('isoWrap').hidden=(S.mode!=='iso');
    $('gradWrap').hidden=(S.mode!=='grad');
    drawGradPreview();
  });
  $('inCol').addEventListener('change',e=>{ S.col=e.target.value; if(V.ok) drawStaticScreens(); if(S.selected) renderInfo(S.selected); });
  $('inSolvA').addEventListener('change',e=>{ S.solvA=e.target.value; if(V.ok) drawStaticScreens(); });
  $('inSolvB').addEventListener('change',e=>{ S.solvB=e.target.value; if(V.ok) drawStaticScreens(); });
  $('btnAddRow').addEventListener('click',()=>{
    const last=S.grad[S.grad.length-1];
    S.grad.push({t:+(last.t+2).toFixed(2), b:last.b});
    renderGradTable();
  });

  $('btnStart').addEventListener('click',startRun);
  $('btnStop').addEventListener('click',stopRun);
  $('btnReset').addEventListener('click',resetAll);

  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));

  $('btnFlow').addEventListener('click',e=>{
    S.flowMode=!S.flowMode;
    e.currentTarget.classList.toggle('active',S.flowMode);
    setLeds();
  });
  $('btnEdu').addEventListener('click',e=>{
    S.eduMode=!S.eduMode;
    e.currentTarget.classList.toggle('active',S.eduMode);
    if(S.eduMode) gotoEdu(0);
    else { S.eduIdx=-1; renderEdu(); if(V.ok) applyHighlight(); }
  });
  $('btnLabels').addEventListener('click',e=>{
    S.showLabels=!S.showLabels;
    e.currentTarget.classList.toggle('active',S.showLabels);
  });
  $('btnLabels').classList.add('active');
  $('btnView').addEventListener('click',()=>{ if(V.ok) camHome(); });
  $('btnQuality').addEventListener('click',()=>{ if(!V.ok) return; setQuality(V.quality==='high'?'std':'high'); syncQualityButton(); });
  $('btnEduPrev').addEventListener('click',()=>gotoEdu(S.eduIdx-1));
  $('btnEduNext').addEventListener('click',()=>gotoEdu(S.eduIdx+1));

  $('btnZoomIn').addEventListener('click',()=>{ const c=(S.view.t0+S.view.t1)/2,s=(S.view.t1-S.view.t0)*0.35;
      S.view.t0=c-s; S.view.t1=c+s; clampView(); });
  $('btnZoomOut').addEventListener('click',()=>{ const c=(S.view.t0+S.view.t1)/2,s=(S.view.t1-S.view.t0)*0.75;
      S.view.t0=c-s; S.view.t1=c+s; clampView(); });
  $('btnFit').addEventListener('click',()=>{ S.view.t0=0; S.view.t1=S.run; });
  $('btnAuto').addEventListener('click',e=>{
    S.view.autoY=!S.view.autoY;
    e.currentTarget.classList.toggle('active',S.view.autoY);
  });

  $('isoWrap').hidden=true; $('gradWrap').hidden=false;
  renderGradTable(); renderEdu(); setLeds(); syncButtons(); updateRunNote();
  initChroma();
}

