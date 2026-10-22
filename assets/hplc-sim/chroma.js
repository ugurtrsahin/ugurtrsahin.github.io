'use strict';
/* ==========================================================================
   5) KROMATOGRAM — Canvas 2D üzerinde gerçek zamanlı çizim, zoom/pan, tooltip
   ========================================================================== */
const CH = { cv:null, ctx:null, w:0, h:0, dpr:1,
             pad:{l:52,r:46,t:16,b:30}, hover:null, drag:false, dragX:0, dragT:0 };

function initChroma(){
  CH.cv=document.getElementById('chromaCanvas');
  CH.ctx=CH.cv.getContext('2d');
  resizeChroma();
  const tip=document.getElementById('chromaTip');

  CH.cv.addEventListener('mousemove',e=>{
    const r=CH.cv.getBoundingClientRect();
    const px=e.clientX-r.left, py=e.clientY-r.top;
    if(CH.drag){
      const span=S.view.t1-S.view.t0;
      const dt=(px-CH.dragX)/plotW()*span;
      S.view.t0=CH.dragT-dt; S.view.t1=S.view.t0+span;
      clampView(); return;
    }
    const t=pxToTime(px);
    CH.hover={px,py,t};
    updateTooltip(tip,px,py,t);
  });
  CH.cv.addEventListener('mouseleave',()=>{CH.hover=null;tip.style.opacity=0;});
  CH.cv.addEventListener('mousedown',e=>{
    const r=CH.cv.getBoundingClientRect();
    CH.drag=true; CH.dragX=e.clientX-r.left; CH.dragT=S.view.t0; CH.cv.style.cursor='grabbing';
  });
  window.addEventListener('mouseup',()=>{CH.drag=false;if(CH.cv)CH.cv.style.cursor='crosshair';});
  CH.cv.addEventListener('wheel',e=>{
    e.preventDefault();
    const r=CH.cv.getBoundingClientRect();
    const t=pxToTime(e.clientX-r.left);
    const f=Math.exp(e.deltaY*0.0014);
    S.view.t0=t-(t-S.view.t0)*f;
    S.view.t1=t+(S.view.t1-t)*f;
    clampView();
  },{passive:false});
  window.addEventListener('resize',resizeChroma);
}
function plotW(){ return CH.w-CH.pad.l-CH.pad.r; }
function plotH(){ return CH.h-CH.pad.t-CH.pad.b; }
function timeToPx(t){ return CH.pad.l + (t-S.view.t0)/(S.view.t1-S.view.t0)*plotW(); }
function pxToTime(px){ return S.view.t0 + (px-CH.pad.l)/plotW()*(S.view.t1-S.view.t0); }
function valToPy(v){ return CH.pad.t + (1-(v-S.view.y0)/(S.view.y1-S.view.y0))*plotH(); }
function clampView(){
  const maxT=Math.max(S.run,0.5);
  if(S.view.t1-S.view.t0<0.05){ const c=(S.view.t0+S.view.t1)/2; S.view.t0=c-0.025; S.view.t1=c+0.025; }
  if(S.view.t1-S.view.t0>maxT*1.5){ S.view.t0=0; S.view.t1=maxT; }
  if(S.view.t0<-0.15){ const d=-0.15-S.view.t0; S.view.t0+=d; S.view.t1+=d; }
  if(S.view.t1>maxT*1.5){ const d=S.view.t1-maxT*1.5; S.view.t0-=d; S.view.t1-=d; }
}
function resizeChroma(){
  if(!CH.cv) return;
  const rect=CH.cv.getBoundingClientRect();
  CH.dpr=Math.min(2,window.devicePixelRatio||1);
  CH.w=Math.max(200,rect.width); CH.h=Math.max(120,rect.height);
  CH.cv.width=Math.round(CH.w*CH.dpr); CH.cv.height=Math.round(CH.h*CH.dpr);
  CH.ctx.setTransform(CH.dpr,0,0,CH.dpr,0,0);
}

function revealedIndex(){
  const res=S.result; if(!res) return -1;
  if(S.phase==='idle') return -1;
  return clamp(Math.floor(S.t/res.dtGrid),0,res.n-1);
}

function drawChroma(){
  const c=CH.ctx; if(!c) return;
  const res=S.result, W=CH.w, H=CH.h;
  c.clearRect(0,0,W,H);

  /* Otomatik Y ölçekleme */
  const idx=revealedIndex();
  if(S.view.autoY){
    let mx=10, mn=0;
    if(res && idx>=0){
      const i0=clamp(Math.floor(S.view.t0/res.dtGrid),0,res.n-1);
      const i1=clamp(Math.ceil(S.view.t1/res.dtGrid),0,idx);
      for(let i=i0;i<=i1;i++){ if(res.total[i]>mx) mx=res.total[i]; if(res.total[i]<mn) mn=res.total[i]; }
    }
    const target1=mx*1.15+4, target0=mn-4;
    S.view.y1+= (target1-S.view.y1)*0.12;
    S.view.y0+= (target0-S.view.y0)*0.12;
  }

  /* Çerçeve ve ızgara */
  c.fillStyle='#0a1119'; c.fillRect(CH.pad.l,CH.pad.t,plotW(),plotH());
  c.strokeStyle='#1b2836'; c.lineWidth=1;
  const span=S.view.t1-S.view.t0;
  const stepT=niceStep(span/7);
  c.font='10px ui-monospace,monospace'; c.textAlign='center'; c.textBaseline='top';
  for(let t=Math.ceil(S.view.t0/stepT)*stepT; t<=S.view.t1; t+=stepT){
    const x=timeToPx(t);
    c.beginPath(); c.moveTo(x,CH.pad.t); c.lineTo(x,CH.pad.t+plotH()); c.stroke();
    c.fillStyle='#5f7185'; c.fillText(fmt(t, stepT<1?1:0), x, CH.pad.t+plotH()+6);
  }
  const stepY=niceStep((S.view.y1-S.view.y0)/5);
  c.textAlign='right'; c.textBaseline='middle';
  for(let v=Math.ceil(S.view.y0/stepY)*stepY; v<=S.view.y1; v+=stepY){
    const y=valToPy(v);
    if(y<CH.pad.t-1||y>CH.pad.t+plotH()+1) continue;
    c.strokeStyle='#16212e'; c.beginPath(); c.moveTo(CH.pad.l,y); c.lineTo(CH.pad.l+plotW(),y); c.stroke();
    c.fillStyle='#5f7185'; c.fillText(fmt(v,0),CH.pad.l-7,y);
  }
  c.strokeStyle='#2f4055'; c.strokeRect(CH.pad.l,CH.pad.t,plotW(),plotH());

  /* Eksen başlıkları */
  c.fillStyle='#8fa3b8'; c.font='10.5px system-ui,sans-serif';
  c.textAlign='center'; c.textBaseline='bottom';
  c.fillText('Zaman (dk)', CH.pad.l+plotW()/2, H-2);
  c.save(); c.translate(11,CH.pad.t+plotH()/2); c.rotate(-Math.PI/2);
  c.fillText('Sinyal (mAU)',0,0); c.restore();

  /* Gradient profili (sağ eksen) */
  c.save();
  c.beginPath(); c.rect(CH.pad.l,CH.pad.t,plotW(),plotH()); c.clip();
  c.strokeStyle='rgba(160,107,255,.55)'; c.setLineDash([5,4]); c.lineWidth=1.4;
  c.beginPath();
  for(let i=0;i<=90;i++){
    const t=S.view.t0+span*i/90;
    const y=CH.pad.t+plotH()*(1-phiProgram(t));
    i===0?c.moveTo(timeToPx(t),y):c.lineTo(timeToPx(t),y);
  }
  c.stroke(); c.setLineDash([]);
  c.restore();
  c.fillStyle='rgba(160,107,255,.85)'; c.font='10px ui-monospace,monospace';
  c.textAlign='left'; c.textBaseline='middle';
  c.fillText('100%B',CH.pad.l+plotW()+5,CH.pad.t+4);
  c.fillText('0%B',CH.pad.l+plotW()+5,CH.pad.t+plotH()-4);

  /* Sinyal izi */
  if(res && idx>0){
    c.save();
    c.beginPath(); c.rect(CH.pad.l,CH.pad.t,plotW(),plotH()); c.clip();
    const i0=clamp(Math.floor(S.view.t0/res.dtGrid),0,res.n-1);
    const i1=clamp(Math.ceil(S.view.t1/res.dtGrid),0,idx);
    const stepI=Math.max(1,Math.floor((i1-i0)/(plotW()*2)));
    c.strokeStyle='#2ee0d3'; c.lineWidth=1.5; c.lineJoin='round';
    c.beginPath();
    let started=false;
    for(let i=i0;i<=i1;i+=stepI){
      const x=timeToPx(res.time[i]), y=valToPy(res.total[i]);
      if(!started){ c.moveTo(x,y); started=true; } else c.lineTo(x,y);
    }
    c.stroke();
    /* Analiz sürerken izin ucunda parlak nokta */
    if(S.phase==='running'){
      const x=timeToPx(res.time[idx]), y=valToPy(res.total[idx]);
      c.fillStyle='#2ee0d3'; c.beginPath(); c.arc(x,y,3.2,0,7); c.fill();
      c.strokeStyle='rgba(46,224,211,.35)'; c.lineWidth=1;
      c.beginPath(); c.moveTo(x,CH.pad.t); c.lineTo(x,CH.pad.t+plotH()); c.stroke();
    }
    /* Pik etiketleri — yakın pikler için kademeli yerleşim (çakışma önleme) */
    c.font='10.5px system-ui,sans-serif'; c.textAlign='center'; c.textBaseline='bottom';
    let lastX=-1e9, lastY=1e9;
    for(const p of res.eluting){
      if(p.tR>res.time[idx]) continue;
      const x=timeToPx(p.tR);
      if(x<CH.pad.l-30||x>CH.pad.l+plotW()+30) continue;
      const apex=p.height+res.base[clamp(Math.round(p.tR/res.dtGrid),0,res.n-1)];
      const yTop=Math.max(CH.pad.t+48, valToPy(apex));
      let yLab=yTop-16;
      if(x-lastX<62) yLab=Math.min(yLab,lastY-23);      // komşu etiketin üstüne kaydır
      yLab=Math.max(yLab,CH.pad.t+14);
      lastX=x; lastY=yLab;
      c.strokeStyle=p.a.color; c.globalAlpha=.55; c.lineWidth=1;
      c.beginPath(); c.moveTo(x,yTop-4); c.lineTo(x,yLab+3); c.stroke(); c.globalAlpha=1;
      c.fillStyle=p.a.color;
      c.fillText(p.a.name, x, yLab);
      c.fillStyle='#7f93a8'; c.font='9.5px ui-monospace,monospace';
      c.fillText(fmt(p.tR,2)+' dk', x, yLab-11);
      c.font='10.5px system-ui,sans-serif';
    }
    c.restore();
  } else {
    c.fillStyle='#3d4c5d'; c.font='12px system-ui,sans-serif';
    c.textAlign='center'; c.textBaseline='middle';
    c.fillText('Kromatogram için "Başlat" düğmesine basın', CH.pad.l+plotW()/2, CH.pad.t+plotH()/2);
  }

  /* İmleç çizgisi */
  if(CH.hover && !CH.drag){
    c.strokeStyle='rgba(143,163,184,.35)'; c.setLineDash([3,3]); c.lineWidth=1;
    c.beginPath(); c.moveTo(CH.hover.px,CH.pad.t); c.lineTo(CH.hover.px,CH.pad.t+plotH()); c.stroke();
    c.setLineDash([]);
  }
}
function niceStep(raw){
  const p=Math.pow(10,Math.floor(Math.log10(Math.max(1e-6,raw))));
  const n=raw/p;
  return (n<1.5?1:n<3?2:n<7?5:10)*p;
}

/* Tooltip: pik üzerinde Rt/alan/yükseklik, boşlukta imleç okuması */
function updateTooltip(tip,px,py,t){
  const res=S.result;
  if(!res || revealedIndex()<0){ tip.style.opacity=0; return; }
  let best=null,bestD=1e9;
  for(const p of res.eluting){
    if(p.tR>res.time[revealedIndex()]) continue;
    const d=Math.abs(timeToPx(p.tR)-px);
    if(d<bestD){bestD=d;best=p;}
  }
  let html;
  if(best && bestD<26){
    html='<div class="tt">'+best.a.name+'</div>'+
      '<span>t<sub>R</sub></span> '+fmt(best.tR,3)+' dk<br>'+
      '<span>Alan</span> '+fmt(best.area,1)+' mAU·s<br>'+
      '<span>Yükseklik</span> '+fmt(best.height,1)+' mAU<br>'+
      '<span>k</span> '+fmt(best.kObs,2)+' &nbsp; <span>N</span> '+Math.round(best.Nobs)+'<br>'+
      '<span>w<sub>50</sub></span> '+fmt(best.w50*60,1)+' s &nbsp; <span>A<sub>s</sub></span> '+fmt(best.As,2)+
      (best.Rs?('<br><span>R<sub>s</sub></span> '+fmt(best.Rs,2)+' (önceki pike göre)'):'');
  }else{
    const i=clamp(Math.round(t/res.dtGrid),0,revealedIndex());
    if(t<0||t>res.time[revealedIndex()]){ tip.style.opacity=0; return; }
    html='<span>Zaman</span> '+fmt(t,3)+' dk<br><span>Sinyal</span> '+fmt(res.total[i],2)+' mAU'+
         '<br><span>%B</span> '+Math.round(phiProgram(t)*100);
  }
  tip.innerHTML=html;
  tip.style.opacity=1;
  const tw=tip.offsetWidth, th=tip.offsetHeight;
  let x=px+14, y=py-th-10;
  if(x+tw>CH.w-6) x=px-tw-14;
  if(y<4) y=py+16;
  tip.style.left=x+'px'; tip.style.top=y+'px';
}
