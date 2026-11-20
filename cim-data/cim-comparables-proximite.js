
(function(){
"use strict";
const ROOT="runtime/comparables-spatial/";
const indexPromise=fetch(ROOT+"index.json").then(r=>{
  if(!r.ok)throw Error("Index HTTP "+r.status);
  return r.json();
});
const cache=new Map();
let generation=0, radius=50, selectedKey=null;
let layer=null, circle=null, selectedGroup=null;
let visibleGroups=[], currentMatches=[];

const panel=document.createElement("section");
panel.id="cimNearbyComparables";
panel.style.cssText="padding:13px;margin:0 0 14px;border:1px solid #d4dfeb;border-radius:10px;background:#f8fbff;font:13px/1.4 system-ui;color:#172b48";
const title=document.createElement("strong");
title.textContent="Comparables à proximité";
title.style.cssText="display:block;font-size:15px;margin-bottom:9px";
const controls=document.createElement("div");
controls.style.cssText="display:flex;gap:8px;margin-bottom:10px";
const status=document.createElement("div");
status.setAttribute("role","status");
status.style.cssText="font-weight:650;margin-bottom:7px";
const selected=document.createElement("div");
const list=document.createElement("div");
list.style.cssText="display:grid;gap:6px;max-height:340px;overflow-y:auto";
const note=document.createElement("small");
note.textContent="Distances approximatives entre coordonnées d'adresse et centroïdes cadastraux. Comparables DVF calculés, pas nécessairement des transactions distinctes.";
note.style.cssText="display:block;color:#637187;margin-top:9px";
panel.append(title,controls,status,selected,list,note);

function price(v){return Math.round(v).toLocaleString("fr-FR")+" €/m²";}
function median(values){
  const a=[...values].sort((x,y)=>x-y);
  if(!a.length)return null;
  const i=Math.floor(a.length/2);
  return a.length%2?a[i]:(a[i-1]+a[i])/2;
}
function quantile(values,q){
  const a=[...values].sort((x,y)=>x-y);
  if(!a.length)return null;
  const p=(a.length-1)*q,l=Math.floor(p),h=Math.ceil(p);
  return a[l]+(a[h]-a[l])*(p-l);
}
function distance(a,b,c,d){
  const rad=Math.PI/180, dy=(d-b)*rad,dx=(c-a)*rad;
  const h=Math.sin(dy/2)**2+
    Math.cos(b*rad)*Math.cos(d*rad)*Math.sin(dx/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function overlaps(b,lon,lat,r){
  const y=r/110900,x=r/(111320*Math.max(.2,Math.cos(lat*Math.PI/180)));
  return Array.isArray(b)&&b[0]<=lon+x&&b[2]>=lon-x&&
         b[1]<=lat+y&&b[3]>=lat-y;
}
function load(code){
  if(!cache.has(code)){
    cache.set(code,fetch(ROOT+code+".json").then(r=>{
      if(!r.ok)throw Error(code+" HTTP "+r.status);
      return r.json();
    }).then(j=>{
      if(!Array.isArray(j.rows))throw Error("Format "+code);
      return j.rows;
    }));
  }
  return cache.get(code);
}
function text(parent,value,css){
  const el=document.createElement("div");
  el.textContent=value;
  if(css)el.style.cssText=css;
  parent.append(el);
  return el;
}
function clear(){
  if(layer)layer.clearLayers();
  if(circle){window.CIMMap?.removeLayer(circle);circle=null;}
  selected.replaceChildren();
  list.replaceChildren();
  visibleGroups=[];
  currentMatches=[];
}
function mountMap(){
  const map=window.CIMMap;
  if(!map||!window.L)return false;
  if(!layer){
    layer=L.layerGroup().addTo(map);
    window.CIMNearbyMapActive=true;
    window.CIMLegacyMarkerLayer?.clearLayers();
    window.CIMLegacyMarkerLayer&&map.removeLayer(window.CIMLegacyMarkerLayer);
  }
  return true;
}
function card(m){
  const el=document.createElement("button");
  el.type="button";
  el.style.cssText="width:100%;text-align:left;background:white;border:1px solid #dce4ee;border-radius:7px;padding:8px;color:#172b48;cursor:pointer";
  text(el,(m.numero+" "+m.voie).trim()+" · "+Math.round(m.d)+" m","font-weight:700");
  text(el,price(m.price)+" · "+m.type+
    (Number(m.surface)>0?" · "+m.surface+" m²":""),
    "font-weight:600;color:#0A3A8F");
  text(el,m.date+" · "+m.code+" · parcelle "+m.parcelle,
    "color:#637187;font-size:11px");
  el.addEventListener("click",()=>{
    chooseGroup(visibleGroups.find(g=>g.items.includes(m)));
  });
  return el;
}
function chooseGroup(group){
  if(!group)return;
  selectedGroup=group.id;
  selected.replaceChildren();
  const head=text(selected,
    group.items.length+" comparable(s) sur cette position",
    "font-weight:700;margin:8px 0");
  for(const m of group.items)selected.append(cardSimple(m));
  selected.style.cssText="margin-bottom:10px;padding:9px;border-left:3px solid #0A3A8F;background:#edf4ff";
  if(group.marker)group.marker.bringToFront();
}
function cardSimple(m){
  const item=document.createElement("div");
  item.style.cssText="margin:5px 0;padding-bottom:5px;border-bottom:1px solid #d4dfeb";
  text(item,(m.numero+" "+m.voie).trim()+" · "+Math.round(m.d)+" m","font-weight:600");
  text(item,price(m.price)+" · "+m.type+
    (m.surface?" · "+m.surface+" m²":""));
  text(item,m.date+" · parcelle "+m.parcelle,"font-size:11px;color:#637187");
  return item;
}
const buttons=[];
for(const value of [50,100]){
  const b=document.createElement("button");
  b.type="button";
  b.textContent=value+" m";
  b.style.cssText="padding:7px 14px;border:1px solid #abc0dc;border-radius:7px;cursor:pointer";
  b.addEventListener("click",()=>{
    radius=value;
    refreshButtons();
    update();
  });
  controls.append(b);buttons.push([value,b]);
}
function refreshButtons(){
  for(const [v,b] of buttons){
    b.style.background=v===radius?"#0A3A8F":"white";
    b.style.color=v===radius?"white":"#0A3A8F";
    b.setAttribute("aria-pressed",String(v===radius));
  }
}
refreshButtons();

async function update(){
  const serial=++generation;
  clear();
  if(!mountMap()){
    status.textContent="Initialisation de la carte…";
    return;
  }
  const data=window.CIMData;
  const address=data?.addresses?.find(a=>String(a.key)===String(selectedKey));
  if(!address){
    status.textContent="Sélectionne une adresse.";
    return;
  }
  const lon=Number(address.longitude),lat=Number(address.latitude);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)){
    status.textContent="Coordonnées indisponibles.";
    return;
  }
  const enabled=document.getElementById("showSales")?.checked!==false;
  if(!enabled){
    status.textContent="Comparables masqués.";
    return;
  }
  status.textContent="Recherche dans un rayon de "+radius+" m…";
  const type=document.getElementById("typeFilter")?.value||"all";
  try{
    const idx=await indexPromise;
    const codes=Object.entries(idx.territories||{})
      .filter(([c,t])=>overlaps(t.bbox,lon,lat,radius))
      .map(([c])=>c);
    const sets=await Promise.all(codes.map(load));
    if(serial!==generation)return;
    const matches=[];
    for(let i=0;i<sets.length;i++){
      for(const r of sets[i]){
        const d=distance(lon,lat,Number(r[0]),Number(r[1]));
        const p=Number(r[8]);
        if(d>radius||!Number.isFinite(p)||p<=0)continue;
        const localType=String(r[5]||"");
        if(type!=="all"&&type!=="simple"&&type!==localType)continue;
        matches.push({
          lon:Number(r[0]),lat:Number(r[1]),d,price:p,
          date:String(r[2]||""),numero:String(r[3]||""),
          voie:String(r[4]||""),type:localType,
          surface:r[6],value:r[7],parcelle:String(r[9]||""),
          code:codes[i]
        });
      }
    }
    matches.sort((a,b)=>a.d-b.d||b.date.localeCompare(a.date));
    currentMatches=matches;
    const med=quantile(matches.map(m=>m.price),.5);
    const q1=quantile(matches.map(m=>m.price),.25);
    const q3=quantile(matches.map(m=>m.price),.75);
    const groups=new Map();
    for(const m of matches){
      const key=m.lon.toFixed(7)+"/"+m.lat.toFixed(7);
      if(!groups.has(key))groups.set(key,{id:key,items:[],lon:m.lon,lat:m.lat});
      groups.get(key).items.push(m);
    }
    visibleGroups=[...groups.values()];
    status.textContent=matches.length+" comparables · "+groups.size+
      " positions · "+radius+" m";
    if(matches.length>=5)text(list,"Médiane locale : "+price(med),
      "font-weight:800;color:#0A3A8F;font-size:16px");
    else text(list,"Échantillon insuffisant pour une médiane fiable.",
      "font-weight:700;color:#93521a");
    if(!matches.length)text(list,"Aucun comparable dans ce rayon.");
    circle=L.circle([lat,lon],{
      radius,color:"#0A3A8F",weight:2,fillOpacity:.025,
      interactive:false,dashArray:"5 5"
    }).addTo(window.CIMMap);
    for(const g of visibleGroups){
      const value=median(g.items.map(m=>m.price));
      const color=value<q1?"#377eb8":
        value<med?"#55a868":value<=q3?"#e39c37":"#c44e52";
      const marker=L.circleMarker([g.lat,g.lon],{
        radius:7+Math.min(7,Math.sqrt(g.items.length)*1.6),
        color:"#fff",weight:2,fillColor:color,fillOpacity:.95
      }).addTo(layer);
      g.marker=marker;
      marker.on("click",()=>chooseGroup(g));
      if(g.items.length>=1){
        const count=L.marker([g.lat,g.lon],{
          interactive:false,
          icon:L.divIcon({
            className:"cim-comparable-count",
            html:'<span style="display:flex;justify-content:center;align-items:center;width:24px;height:24px;font:bold 11px system-ui;color:#fff;text-shadow:0 1px 2px #222">'+g.items.length+"</span>",
            iconSize:[24,24],iconAnchor:[12,12]
          })
        }).addTo(layer);
      }
    }
    for(const m of matches)list.append(card(m));
    const count=document.getElementById("visibleCount");
    if(count)count.textContent=matches.length+" comparables à "+radius+" m";
    window.CIMNearbyVisibleMatches=matches.length;
  }catch(e){
    if(serial!==generation)return;
    console.error("Comparables géographiques",e);
    status.textContent="Chargement impossible : "+e.message;
  }
}
function init(){
  if(!document.getElementById("cimNearbyComparables")){
    const detail=document.getElementById("detail");
    if(detail)detail.insertAdjacentElement("beforebegin",panel);
  }
  selectedKey=window.CIMInitialAddressKey||
    window.CIMData?.reference_194?.address?.key||selectedKey;
  update();
}
window.addEventListener("cim:ready",init);
window.addEventListener("cim:address-selected",e=>{
  selectedKey=e.detail?.key??null;update();
});
for(const id of ["showSales","typeFilter"]){
  document.getElementById(id)?.addEventListener("change",update);
}
if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
