
(function(){
"use strict";

const ROOT="runtime/comparables-spatial/";
const indexPromise=fetch(ROOT+"index.json").then(r=>{
  if(!r.ok)throw new Error("Index spatial HTTP "+r.status);
  return r.json();
});
const cache=new Map();
let generation=0;
let radius=50;
let selectedKey=null;

function euro(n){
  return Math.round(n).toLocaleString("fr-FR")+" €";
}
function distance(a,b,c,d){
  const rad=Math.PI/180;
  const lat=(d-b)*rad, lon=(c-a)*rad;
  const h=Math.sin(lat/2)**2+
    Math.cos(b*rad)*Math.cos(d*rad)*Math.sin(lon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function median(values){
  if(!values.length)return null;
  const arr=[...values].sort((a,b)=>a-b);
  const i=Math.floor(arr.length/2);
  return arr.length%2?arr[i]:(arr[i-1]+arr[i])/2;
}
function overlaps(bbox,lon,lat,metres){
  if(!Array.isArray(bbox)||bbox.length!==4)return false;
  const y=metres/110900;
  const x=metres/(111320*Math.max(.2,Math.cos(lat*Math.PI/180)));
  return bbox[0]<=lon+x&&bbox[2]>=lon-x&&
         bbox[1]<=lat+y&&bbox[3]>=lat-y;
}
function loadTerritory(code){
  if(!cache.has(code)){
    const promise=fetch(ROOT+code+".json").then(r=>{
      if(!r.ok)throw new Error(code+" HTTP "+r.status);
      return r.json();
    }).then(j=>{
      if(!Array.isArray(j.rows))throw new Error("Format "+code);
      return j.rows;
    });
    cache.set(code,promise);
  }
  return cache.get(code);
}
const panel=document.createElement("section");
panel.id="cimNearbyComparables";
panel.style.cssText=[
  "padding:13px 15px","margin:0 0 14px",
  "border:1px solid #d4dfeb","border-radius:10px",
  "background:#f8fbff","font:13px/1.45 system-ui",
  "color:#172b48"
].join(";");

const heading=document.createElement("strong");
heading.textContent="Comparables à proximité";
heading.style.cssText="display:block;font-size:15px;margin-bottom:8px";

const controls=document.createElement("div");
controls.style.cssText="display:flex;gap:7px;margin-bottom:8px";
const buttons=[];
for(const value of [50,100]){
  const button=document.createElement("button");
  button.type="button";
  button.textContent=value+" m";
  button.dataset.radius=String(value);
  button.style.cssText="padding:6px 13px;border:1px solid #a8bdd5;border-radius:7px;background:white;color:#0A3A8F;cursor:pointer";
  button.addEventListener("click",()=>{
    radius=value;
    refreshButtons();
    update();
  });
  controls.append(button);
  buttons.push(button);
}
function refreshButtons(){
  for(const b of buttons){
    const on=Number(b.dataset.radius)===radius;
    b.style.background=on?"#0A3A8F":"white";
    b.style.color=on?"white":"#0A3A8F";
  }
}
refreshButtons();

const status=document.createElement("div");
status.setAttribute("role","status");
status.style.cssText="font-weight:600;margin:7px 0";
const description=document.createElement("div");
description.style.cssText="font-size:11px;color:#5d6c80;margin-bottom:8px";
description.textContent="Toutes voies confondues. Distance approximative depuis le centroïde de la parcelle. Comparables calculés à partir des DVF, non assimilables à des ventes distinctes.";
const list=document.createElement("div");
list.style.cssText="display:grid;gap:6px;max-height:300px;overflow-y:auto";
panel.append(heading,controls,status,description,list);

function addText(parent,content,style){
  const el=document.createElement("div");
  el.textContent=content;
  if(style)el.style.cssText=style;
  parent.append(el);
}
async function update(){
  const serial=++generation;
  const data=window.CIMData;
  const address=data?.addresses?.find(a=>String(a.key)===String(selectedKey));
  list.replaceChildren();
  if(!address){
    status.textContent="Sélectionne une adresse pour consulter son marché proche.";
    return;
  }
  const lon=Number(address.longitude), lat=Number(address.latitude);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)){
    status.textContent="Coordonnées de cette adresse indisponibles.";
    return;
  }
  status.textContent="Recherche des comparables sur "+radius+" m…";
  try{
    const idx=await indexPromise;
    const territories=Object.entries(idx.territories||{})
      .filter(([code,item])=>overlaps(item.bbox,lon,lat,radius))
      .map(([code])=>code);
    const sets=await Promise.all(territories.map(loadTerritory));
    if(serial!==generation)return;
    const matches=[];
    for(let i=0;i<sets.length;i++){
      const code=territories[i];
      for(const row of sets[i]){
        const d=distance(lon,lat,Number(row[0]),Number(row[1]));
        if(d>radius)continue;
        const price=Number(row[8]);
        if(!Number.isFinite(price)||price<=0)continue;
        matches.push({
          code,d,price,date:String(row[2]||""),
          numero:String(row[3]||""),
          voie:String(row[4]||""),
          type:String(row[5]||""),
          surface:row[6],value:row[7],
          parcelle:String(row[9]||""),
          quality:String(row[10]||"")
        });
      }
    }
    matches.sort((a,b)=>a.d-b.d||b.date.localeCompare(a.date));
    const properties=new Set(matches.map(m=>m.parcelle).filter(Boolean));
    const med=median(matches.map(m=>m.price));
    status.textContent=matches.length+" comparables à "+radius+
      " m · "+properties.size+" parcelles distinctes";
    if(matches.length>=5){
      addText(list,"Médiane locale : "+euro(med)+"/m²",
        "font-weight:800;color:#0A3A8F;font-size:16px");
    }else{
      addText(list,"Échantillon insuffisant pour présenter une médiane locale fiable.",
        "font-weight:600;color:#8c4c15");
    }
    if(!matches.length){
      addText(list,"Aucune observation dans ce rayon. Essaie 100 m.");
      return;
    }
    const shown=matches.slice(0,20);
    for(const m of shown){
      const card=document.createElement("div");
      card.style.cssText="padding:8px;border:1px solid #e0e6ef;border-radius:7px;background:white";
      addText(card,(m.numero+" "+m.voie).trim()+" · "+Math.round(m.d)+" m",
        "font-weight:700");
      addText(card,euro(m.price)+"/m² · "+m.type+
        (Number(m.surface)>0?" · "+m.surface+" m²":""),
        "color:#0A3A8F");
      addText(card,m.date+" · "+m.code+" · Parcelle "+m.parcelle,
        "font-size:11px;color:#637187");
      list.append(card);
    }
    if(matches.length>shown.length){
      addText(list,(matches.length-shown.length)+" autres comparables dans le rayon.",
        "font-size:11px;color:#5d6c80");
    }
  }catch(error){
    if(serial!==generation)return;
    console.error("CIM Data proximité",error);
    status.textContent="Comparables indisponibles : "+error.message;
  }
}
function mount(){
  const detail=document.getElementById("detail");
  if(!detail){status.textContent="Panneau immobilier indisponible";return;}
  detail.insertAdjacentElement("beforebegin",panel);
  selectedKey=window.CIMInitialAddressKey||
    window.CIMData?.reference_194?.address?.key||null;
  update();
}
window.addEventListener("cim:address-selected",e=>{
  selectedKey=e.detail?.key??null;
  update();
});
if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",mount,{once:true});
else mount();
})();
