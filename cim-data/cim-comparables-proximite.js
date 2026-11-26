
(function(){
"use strict";
const ROOT="runtime/comparables-spatial/";
const indexPromise=fetch(ROOT+"index.json").then(r=>{
  if(!r.ok)throw Error("Index HTTP "+r.status);
  return r.json();
});

const cache=new Map();
// CIM_PUB03X13_PIECES
// CIM_DATA_PIECES_TOUS_TERRITOIRES
const allPiecesCache=new Map();
function loadPiecesAny(code){
  if(!allPiecesCache.has(code)){
    const pending=fetch(ROOT+code+"-pieces.json")
      .then(response=>{
        if(!response.ok)
          throw Error("Pièces DVF "+code+" : HTTP "+response.status);
        return response.json();
      })
      .then(data=>{
        if(data.code!==code||!Array.isArray(data.pieces))
          throw Error("Pièces DVF "+code+" : index incompatible");
        return data.pieces;
      })
      .catch(error=>{
        allPiecesCache.delete(code);
        throw error;
      });
    allPiecesCache.set(code,pending);
  }
  return allPiecesCache.get(code);
}

let pieces13205Promise=null;
function loadPieces13205(){
 if(!pieces13205Promise){
  pieces13205Promise=fetch(ROOT+"13205-pieces.json")
   .then(r=>{
    if(!r.ok)throw Error("Index pièces indisponible");
    return r.json();
   })
   .then(d=>{
    if(!Array.isArray(d.pieces)||d.pieces.length!==5204)
     throw Error("Index pièces incompatible");
    return d.pieces;
   })
   .catch(e=>{pieces13205Promise=null;throw e;});
 }
 return pieces13205Promise;
}

let generation=0, radius=100, selectedKey=null;
let layer=null, circle=null, selectedGroup=null;
let visibleGroups=[], currentMatches=[];

const panel=document.createElement("section");
panel.id="cimNearbyComparables";
panel.style.cssText="padding:13px;margin:0 0 14px;border:1px solid #d4dfeb;border-radius:10px;background:#f8fbff;font:13px/1.4 system-ui;color:#172b48";
const title=document.createElement("strong");
title.textContent="Comparables à proximité";
title.style.cssText="display:block;font-size:15px;margin-bottom:9px";
const controls=document.createElement("div");
controls.style.cssText="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px";

const filters=document.createElement("div");
filters.style.cssText="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:10px";
function field(label,el){
 const wrap=document.createElement("label");
 wrap.style.cssText="display:grid;gap:3px;font-size:11px;font-weight:600";
 const span=document.createElement("span");span.textContent=label;
 el.style.cssText="width:100%;min-width:0;box-sizing:border-box;padding:7px;border:1px solid #abc0dc;border-radius:6px;background:white";
 wrap.append(span,el);filters.append(wrap);
 return el;
}
function selection(items){
 const el=document.createElement("select");
 for(const [v,t] of items){
  const option=document.createElement("option");
  option.value=v;option.textContent=t;el.append(option);
 }
 return el;
}
const kind=field("Type de bien",selection([
 ["all","Tous les biens"],["Appartement","Appartement"],["Maison","Maison"]
]));
kind.id="cimMainType";
const period=field("Période",selection([
 ["all","Toutes les années"],["1","1 an"],["3","3 ans"],["5","5 ans"]
]));
function numeric(id){
 const el=document.createElement("input");
 el.type="number";el.min="0";el.placeholder="Libre";el.id=id;
 return el;
}
const surfaceMin=field("Surface min. m²",numeric("cimSurfaceMin"));
const surfaceMax=field("Surface max. m²",numeric("cimSurfaceMax"));
const priceMin=field("Prix min. €",numeric("cimPrixMin"));
const priceMax=field("Prix max. €",numeric("cimPrixMax"));
const filterHelp=document.createElement("small");
filterHelp.style.cssText="display:block;color:#637187;margin-bottom:8px";
filterHelp.textContent="Pièces : à raccorder aux transactions DVF détaillées. Prix et €/m² issus des comparables calculés.";

const status=document.createElement("div");
status.setAttribute("role","status");
status.style.cssText="font-weight:650;margin-bottom:7px";
const selected=document.createElement("div");
const list=document.createElement("div");
list.style.cssText="display:grid;gap:6px;max-height:340px;overflow-y:auto";
const note=document.createElement("small");
note.textContent="Distances approximatives entre coordonnées d'adresse et centroïdes cadastraux. Comparables DVF calculés, pas nécessairement des transactions distinctes.";
note.style.cssText="display:block;color:#637187;margin-top:9px";
const medianBox=document.createElement("section");
medianBox.id="cimNearbyMedian";
medianBox.style.cssText=[
  "background:#e8f0ff",
  "border:2px solid #0A3A8F",
  "border-radius:11px",
  "padding:14px 15px",
  "margin:10px 0 13px",
  "text-align:center"
].join(";");
panel.append(title,controls,filters,status,medianBox,selected,list);


// CIM_PUB03X09_FILTERS — panneau unique et filtres DVF disponibles.
let activePieces=new Set();
const filterTrigger=document.createElement("button");
filterTrigger.type="button";
filterTrigger.textContent="☷ Filtres";
filterTrigger.style.cssText="display:block;width:100%;padding:11px;margin:0 0 10px;background:#1685ed;color:white;border:0;border-radius:8px;font:700 15px system-ui;cursor:pointer";
panel.insertBefore(filterTrigger,controls);
filters.style.display="none";
filterHelp.textContent="Critères appliqués aux comparables calculés. Les pièces nécessitent des données détaillées vérifiées.";

const filterOverlay=document.createElement("div");
filterOverlay.id="cimFilterOverlay";
filterOverlay.hidden=true;
filterOverlay.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(12,30,52,.38);overflow:auto;padding:15px;box-sizing:border-box";
const filterDialog=document.createElement("section");
filterDialog.setAttribute("role","dialog");
filterDialog.setAttribute("aria-modal","true");
filterDialog.setAttribute("aria-label","Filtres immobiliers");
filterDialog.style.cssText="max-width:590px;margin:30px auto;background:#fff;border-radius:13px;padding:24px;color:#243047;box-shadow:0 16px 60px #0003;font:15px/1.5 system-ui";
filterDialog.innerHTML=`
<div style="display:flex;justify-content:space-between;align-items:center">
 <strong style="font-size:24px">Filtres</strong>
 <button type="button" data-filter-close aria-label="Fermer" style="font-size:25px;background:none;border:0;cursor:pointer">×</button>
</div>
<h3>Type de bien</h3>
<div style="display:flex;flex-wrap:wrap;gap:20px">
 <label><input type="checkbox" data-filter-type="Maison" checked> Maison</label>
 <label><input type="checkbox" data-filter-type="Appartement" checked> Appartement</label>
</div>
<hr style="margin:23px 0;border:0;border-top:1px solid #ddd">
<h3>Nombre de pièces</h3>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
 <label><input type="checkbox" data-filter-pieces="1"> Studio</label>
 <label><input type="checkbox" data-filter-pieces="2"> 2 pièces</label>
 <label><input type="checkbox" data-filter-pieces="3"> 3 pièces</label>
 <label><input type="checkbox" data-filter-pieces="4"> 4 pièces</label>
 <label><input type="checkbox" data-filter-pieces="5+"> 5 pièces et +</label>
</div>

<hr style="margin:23px 0;border:0;border-top:1px solid #ddd">
<h3>Prix de vente</h3>
<div data-filter-price-label style="margin-bottom:8px"></div>
<label style="display:block">Minimum
 <input data-filter-price-min type="range" min="0" max="2000000" step="10000" value="0" style="display:block;width:100%">
</label>
<label style="display:block">Maximum
 <input data-filter-price-max type="range" min="0" max="2000000" step="10000" value="2000000" style="display:block;width:100%">
</label>
<hr style="margin:23px 0;border:0;border-top:1px solid #ddd">
<h3>Surface</h3>
<div data-filter-surface-label style="margin-bottom:8px"></div>
<label style="display:block">Minimum
 <input data-filter-surface-min type="range" min="0" max="500" step="5" value="0" style="display:block;width:100%">
</label>
<label style="display:block">Maximum
 <input data-filter-surface-max type="range" min="0" max="500" step="5" value="500" style="display:block;width:100%">
</label>
<div style="display:flex;justify-content:space-between;gap:12px;margin-top:25px">
 <button type="button" data-filter-reset style="padding:12px;border:1px solid #b9c8db;border-radius:8px;background:white;cursor:pointer">Effacer</button>
 <button type="button" data-filter-apply style="padding:12px 22px;border:0;border-radius:8px;background:#1685ed;color:white;font-weight:700;cursor:pointer">Appliquer</button>
</div>`;
filterOverlay.append(filterDialog);

const filterQ=selector=>filterDialog.querySelector(selector);
const priceLow=filterQ("[data-filter-price-min]");
const priceHigh=filterQ("[data-filter-price-max]");
const areaLow=filterQ("[data-filter-surface-min]");
const areaHigh=filterQ("[data-filter-surface-max]");
const money=v=>Number(v).toLocaleString("fr-FR")+" €";
function renderFilterLabels(){
 filterQ("[data-filter-price-label]").textContent=
  (Number(priceLow.value)===0?"Prix minimum libre":money(priceLow.value))+
  " — "+(Number(priceHigh.value)===2000000?"Prix maximum libre":money(priceHigh.value));
 filterQ("[data-filter-surface-label]").textContent=
  (Number(areaLow.value)===0?"Surface minimum libre":areaLow.value+" m²")+
  " — "+(Number(areaHigh.value)===500?"Surface maximum libre":areaHigh.value+" m²");
}
function filterRange(a,b,changed){
 if(Number(a.value)>Number(b.value)){
  if(changed===a)b.value=a.value;else a.value=b.value;
 }
 renderFilterLabels();
}
priceLow.addEventListener("input",()=>filterRange(priceLow,priceHigh,priceLow));
priceHigh.addEventListener("input",()=>filterRange(priceLow,priceHigh,priceHigh));
areaLow.addEventListener("input",()=>filterRange(areaLow,areaHigh,areaLow));
areaHigh.addEventListener("input",()=>filterRange(areaLow,areaHigh,areaHigh));

function closeFilter(){
 filterOverlay.hidden=true;
 filterTrigger.focus();
}
filterTrigger.addEventListener("click",()=>{
 const current=kind.value;
 for(const box of filterDialog.querySelectorAll("[data-filter-type]")){
  box.checked=current==="all"||box.dataset.filterType===current;
 }
 for(const box of filterDialog.querySelectorAll("[data-filter-pieces]"))
  box.checked=activePieces.has(box.dataset.filterPieces);
 priceLow.value=priceMin.value||0;
 priceHigh.value=priceMax.value||2000000;
 areaLow.value=surfaceMin.value||0;
 areaHigh.value=surfaceMax.value||500;
 renderFilterLabels();
 filterOverlay.hidden=false;
 filterQ("[data-filter-close]").focus();
});
filterQ("[data-filter-close]").addEventListener("click",closeFilter);
filterOverlay.addEventListener("click",e=>{
 if(e.target===filterOverlay)closeFilter();
});
filterOverlay.addEventListener("keydown",e=>{
 if(e.key==="Escape")closeFilter();
});
filterQ("[data-filter-reset]").addEventListener("click",()=>{
 for(const box of filterDialog.querySelectorAll("[data-filter-type]"))box.checked=true;
 for(const box of filterDialog.querySelectorAll("[data-filter-pieces]"))
  box.checked=false;
 priceLow.value=0;priceHigh.value=2000000;
 areaLow.value=0;areaHigh.value=500;
 renderFilterLabels();
});
filterQ("[data-filter-apply]").addEventListener("click",()=>{
 const checked=[...filterDialog.querySelectorAll("[data-filter-type]:checked")]
  .map(box=>box.dataset.filterType);
 if(!checked.length){
  filterQ("[data-filter-price-label]").textContent="Sélectionnez au moins un type de bien.";
  return;
 }
 kind.value=checked.length===2?"all":checked[0];
 activePieces=new Set(
  [...filterDialog.querySelectorAll("[data-filter-pieces]:checked")]
   .map(box=>box.dataset.filterPieces)
 );
 priceMin.value=Number(priceLow.value)===0?"":priceLow.value;
 priceMax.value=Number(priceHigh.value)===2000000?"":priceHigh.value;
 surfaceMin.value=Number(areaLow.value)===0?"":areaLow.value;
 surfaceMax.value=Number(areaHigh.value)===500?"":areaHigh.value;
 const legacy=document.getElementById("typeFilter");
 if(legacy)legacy.value=kind.value;
 update();
 closeFilter();
});
if(document.body)document.body.append(filterOverlay);
else document.addEventListener("DOMContentLoaded",()=>document.body.append(filterOverlay),{once:true});

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
  selectedGroup=null;
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
  text(el,(Number(m.value)>0?Math.round(Number(m.value)).toLocaleString("fr-FR")+" € · ":"")+
    price(m.price)+" · "+m.type+
    (Number(m.surface)>0?" · "+m.surface+" m²":""),
    "font-weight:600;color:#0A3A8F");
  text(el,m.date+" · "+m.code+" · parcelle "+m.parcelle,
    "color:#637187;font-size:11px");
  el.addEventListener("click",()=>{
    chooseSale(m,visibleGroups.find(g=>g.items.includes(m)));
  });
  return el;
}
function placeSelection(){
  const right=document.querySelector(".right");
  const headNode=right?.querySelector(".right-head");
  if(headNode&&selected.parentElement!==right)
    headNode.insertAdjacentElement("afterend",selected);
  selected.style.cssText=
    "margin-bottom:10px;padding:9px;border-left:3px solid #0A3A8F;background:#edf4ff";
}
function comparableContext(){
  const right=document.querySelector(".right");
  const eyebrow=right?.querySelector(".right-head .eyebrow");
  if(eyebrow)eyebrow.textContent="Adresse étudiée · comparables";
  const heading=document.getElementById("detailTitle");
  const searched=document.getElementById("search")?.value?.trim();
  if(heading&&searched)heading.textContent=searched;
  const subtitle=document.getElementById("detailSubtitle");
  if(subtitle)subtitle.textContent=
    "Vente comparable sélectionnée ci-dessous";
  document.getElementById("detail")?.replaceChildren();
}
function chooseSale(m,group){
  if(!m||!group)return;
  selectedGroup=group.id;
  comparableContext();
  selected.replaceChildren();
  placeSelection();
  text(selected,"Vente comparable sélectionnée",
    "font-weight:800;margin:8px 0");
  text(selected,(m.numero+" "+m.voie).trim()+" · "+Math.round(m.d)+" m",
    "font-weight:700;margin:4px 0");
  text(selected,
    (Number(m.value)>0
      ?Math.round(Number(m.value)).toLocaleString("fr-FR")+" € · ":"")+
    price(m.price)+" · "+m.type+
    (Number(m.surface)>0?" · "+m.surface+" m²":""),
    "font-weight:700;color:#0A3A8F");
  text(selected,"Date : "+m.date+
    " · Code : "+m.code+" · Parcelle : "+m.parcelle,
    "font-size:11px;color:#637187;margin-top:5px");
  text(selected,"Transaction comparable : ce prix ne constitue pas une estimation du bien étudié.",
    "font-size:11px;color:#637187;margin-top:6px");
  if(group.marker)group.marker.bringToFront();
}
function chooseGroup(group){
  if(!group)return;
  if(group.items.length===1){
    chooseSale(group.items[0],group);
    return;
  }
  selectedGroup=group.id;
  comparableContext();
  selected.replaceChildren();
  placeSelection();
  text(selected,group.items.length+
    " ventes sur cette position — choisissez une transaction",
    "font-weight:700;margin:8px 0");
  for(const m of group.items)selected.append(cardSimple(m,group));
  if(group.marker)group.marker.bringToFront();
}
function cardSimple(m,group){
  const item=document.createElement("button");
  item.type="button";
  item.style.cssText=
    "display:block;width:100%;text-align:left;background:white;color:#172b48;cursor:pointer;margin:5px 0;padding:7px;border:1px solid #d4dfeb;border-radius:5px";
  text(item,(m.numero+" "+m.voie).trim()+" · "+Math.round(m.d)+" m",
    "font-weight:600");
  text(item,(Number(m.value)>0
    ?Math.round(Number(m.value)).toLocaleString("fr-FR")+" € · ":"")+
    price(m.price)+" · "+m.type+
    (Number(m.surface)>0?" · "+m.surface+" m²":""));
  text(item,m.date+" · parcelle "+m.parcelle,
    "font-size:11px;color:#637187");
  item.addEventListener("click",()=>chooseSale(m,group));
  return item;
}
const buttons=[];
for(const value of [50,100,250,500,1000,2000]){
  const b=document.createElement("button");
  b.type="button";
  b.textContent=value>=1000?(value/1000)+" km":value+" m";
  b.style.cssText="padding:7px 3px;border:1px solid #abc0dc;border-radius:7px;cursor:pointer;font:12px system-ui";
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
  medianBox.replaceChildren();

  if(window.CIMSelectedTerritory){
    window.CIMNearbyVisibleMatches=0;
    status.textContent="Sélectionnez une adresse.";
    const count=document.getElementById("visibleCount");
    if(count)count.textContent="Vue territoriale";
    return;
  }
  if(!mountMap()){
    status.textContent="Initialisation de la carte…";
    return;
  }
  const data=window.CIMData;
  const external=window.CIMExternalAddress;
  const address=(
    external && String(external.key)===String(selectedKey)
  ) ? external :
    data?.addresses?.find(a=>String(a.key)===String(selectedKey));
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
  const type=kind.value;
  function bound(el){return el.value===""?null:Number(el.value);}
  const minS=bound(surfaceMin),maxS=bound(surfaceMax);
  const minP=bound(priceMin),maxP=bound(priceMax);
  const years=period.value==="all"?null:Number(period.value);
  const currentYear=new Date().getFullYear();
  if([minS,maxS,minP,maxP].some(v=>v!==null&&(!Number.isFinite(v)||v<0))||
     (minS!==null&&maxS!==null&&minS>maxS)||
     (minP!==null&&maxP!==null&&minP>maxP)){
    status.textContent="Bornes de surface ou de prix invalides.";
    return;
  }
  try{
    const idx=await indexPromise;
    const codes=Object.entries(idx.territories||{})
      .filter(([c,t])=>overlaps(t.bbox,lon,lat,radius))
      .map(([c])=>c);
    const sets=await Promise.all(codes.map(load));
    const piecesByCode=activePieces.size
     ?await Promise.all(codes.map(code=>
       loadPiecesAny(code)))
     :codes.map(()=>null);
    if(serial!==generation)return;
    const matches=[];
    for(let i=0;i<sets.length;i++){
      for(let ri=0;ri<sets[i].length;ri++){
        const r=sets[i][ri];
        const nbPieces=piecesByCode[i]?.[ri]??null;
        if(activePieces.size){
         if(!Number.isInteger(nbPieces)||nbPieces<1)continue;
         const category=nbPieces>=5?"5+":String(nbPieces);
         if(!activePieces.has(category))continue;
        }
        const d=distance(lon,lat,Number(r[0]),Number(r[1]));
        const p=Number(r[8]);
        if(d>radius||!Number.isFinite(p)||p<=0)continue;
        const localType=String(r[5]||"");
        if(type!=="all"&&type!==localType)continue;
        const surface=Number(r[6]),sale=Number(r[7]);
        const year=Number(String(r[2]||"").slice(0,4));
        if(minS!==null&&(!Number.isFinite(surface)||surface<minS))continue;
        if(maxS!==null&&(!Number.isFinite(surface)||surface>maxS))continue;
        if(minP!==null&&(!Number.isFinite(sale)||sale<=0||sale<minP))continue;
        if(maxP!==null&&(!Number.isFinite(sale)||sale<=0||sale>maxP))continue;
        if(years!==null&&(!Number.isFinite(year)||year<currentYear-years+1))continue;
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
      const key=m.parcelle && m.parcelle.trim() ? m.code+"/"+m.parcelle.trim() : m.lon.toFixed(7)+"/"+m.lat.toFixed(7);
      if(!groups.has(key))groups.set(key,{id:key,items:[],lon:m.lon,lat:m.lat});
      groups.get(key).items.push(m);
    }
    visibleGroups=[...groups.values()];
    status.textContent=matches.length+" comparables · "+groups.size+
      " positions · "+radius+" m";
    medianBox.replaceChildren();
    text(medianBox,"MÉDIANE · "+(type==="all"?"TOUS BIENS":type.toUpperCase())+
      " · "+(radius>=1000?(radius/1000)+" KM":radius+" M"),
      "font-size:11px;font-weight:800;letter-spacing:1px;color:#395781");
    if(matches.length>=5){
      text(medianBox,price(med),
        "font-size:30px;font-weight:900;color:#0A3A8F;line-height:1.3;margin:5px 0");
      text(medianBox,matches.length+" comparables calculés · "+
        groups.size+" positions cadastrales",
        "font-size:12px;font-weight:650;color:#334866");
      text(medianBox,"Indicateur de marché, pas estimation du bien",
        "font-size:11px;color:#617089;margin-top:7px");
    }else{
      text(medianBox,"Données insuffisantes",
        "font-size:19px;font-weight:800;color:#93521a;margin:6px 0");
      text(medianBox,matches.length+" comparables · "+
        groups.size+" positions",
        "font-size:12px;color:#617089");
    }
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
    const left=document.querySelector(".left");
    if(left)left.prepend(panel);
  }
  selectedKey=window.CIMInitialAddressKey||
    window.CIMData?.reference_194?.address?.key||selectedKey;
  update();
}
window.addEventListener("cim:territory-selected",()=>{
  ++generation;
  selectedKey=null;
  clear();
  medianBox.replaceChildren();
  status.textContent="Sélectionnez une adresse.";
  window.CIMNearbyVisibleMatches=0;
  const count=document.getElementById("visibleCount");
  if(count)count.textContent="Vue territoriale";
});

window.addEventListener("cim:parcel-map-selected",()=>{
  selectedGroup=null;
  selected.replaceChildren();
  if(selected.parentElement!==panel)panel.insertBefore(selected,list);
});
window.addEventListener("cim:ready",init);
window.addEventListener("cim:address-selected",e=>{
  selectedKey=e.detail?.key??null;update();
});
for(const control of [kind,period,surfaceMin,surfaceMax,priceMin,priceMax]){
 control.addEventListener("change",update);
}
const legacyType=document.getElementById("typeFilter");
if(legacyType){
 legacyType.value="all";
 legacyType.addEventListener("change",()=>{
  kind.value=["Appartement","Maison"].includes(legacyType.value)
   ?legacyType.value:"all";
  update();
 });
 kind.addEventListener("change",()=>{legacyType.value=kind.value;});
}
document.getElementById("showSales")?.addEventListener("change",update);
if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
