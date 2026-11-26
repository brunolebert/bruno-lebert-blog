(function(){
"use strict";
if(window.CIMContextLayersV2Ready)return;
window.CIMContextLayersV2Ready=true;

const ROOT="runtime/couverture-prix-territoires.geojson";
const CATEGORIES=[
 ["HLM · logements sociaux","hlm",[
  '["residential"="social_housing"]',
  '["social_housing"="yes"]',
  '["building"="social_housing"]'
 ]],
 ["Lieux de culte","culte",[
  '["amenity"="place_of_worship"]'
 ]],
 ["Services publics","public",[
  '["amenity"~"townhall|post_office|library|courthouse|social_facility|public_building"]',
  '["office"="government"]'
 ]],
 ["Parcs et jardins","parcs",[
  '["leisure"~"park|garden|playground"]'
 ]],
 ["Vétérinaires","veterinaires",[
  '["amenity"="veterinary"]'
 ]],
 ["Écoles et enseignement","ecoles",[
  '["amenity"~"school|kindergarten|college|university"]'
 ]],
 ["Hôpitaux et cliniques","hopitaux",[
  '["amenity"~"hospital|clinic"]'
 ]],
 ["Médecins et pharmacies","sante",[
  '["amenity"~"doctors|dentist|pharmacy"]',
  '["healthcare"~"doctor|physiotherapist|midwife"]'
 ]],
 ["Transports publics","transports",[
  '["highway"="bus_stop"]',
  '["railway"~"station|halt|tram_stop|subway_entrance"]',
  '["amenity"="bus_station"]'
 ]],
 ["Sécurité et secours","securite",[
  '["amenity"~"police|fire_station"]'
 ]],
 ["Culture et patrimoine","culture",[
  '["tourism"~"museum|gallery|attraction"]',
  '["amenity"~"theatre|arts_centre"]'
 ]],
 ["Sports et loisirs","sports",[
  '["leisure"~"sports_centre|pitch|swimming_pool|fitness_centre"]'
 ]]
];

let layerPrix=null,layerPoi=null;
let prixEnabled=true;
let active=new Set();
let version=0;
let statusNode=null;
let menuReady=false;

function euros(n){
 return Math.round(n).toLocaleString("fr-FR")+" €/m²";
}
function color(p){
 if(p===null||!Number.isFinite(p)||p<=0)return "#9ca3af";
 if(p<2000)return "#fee4a8";
 if(p<3000)return "#ffc56b";
 if(p<4000)return "#f99351";
 if(p<5500)return "#e95743";
 return "#ae2648";
}

function init(){
 const map=window.CIMMap;
 const L=window.L;
 const menu=document.getElementById("cimLayersMenu");
 if(!map||!L||!menu||menuReady)return;
 menuReady=true;

 const existing=document.getElementById("cimPublicLayers");
 if(existing)existing.remove();

 const group=document.createElement("section");
 group.id="cimPublicLayers";
 group.style.cssText=
  "border-top:1px solid #dce4ee;padding-top:9px;margin-top:9px";

 const heading=document.createElement("strong");
 heading.textContent="Équipements et environnement";
 heading.style.cssText="display:block;margin-bottom:8px;font-size:12px";
 group.append(heading);

 const inputs=new Map();

 for(const [label,id] of CATEGORIES){
  const row=document.createElement("label");
  row.style.cssText=
   "display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer";
  const box=document.createElement("input");
  box.type="checkbox";
  box.checked=false;
  box.dataset.cimCategory=id;
  box.style.cssText="width:16px;height:16px;flex:none";
  const text=document.createElement("span");
  text.textContent=label;
  row.append(box,text);
  group.append(row);
  inputs.set(id,box);
  box.addEventListener("change",()=>{
   if(box.checked)active.add(id);
   else active.delete(id);
   refreshPoi();
  });
 }

 statusNode=document.createElement("div");
 statusNode.setAttribute("role","status");
 statusNode.style.cssText=
  "font-size:11px;color:#64748b;margin-top:9px;line-height:1.4";
 statusNode.textContent="Choisir une ou plusieurs catégories";
 group.append(statusNode);
 menu.append(group);


 const area=document.querySelector(".map-wrap");
 if(!area)throw Error("Zone cartographique introuvable");

 const overlay=document.createElement("aside");
 overlay.id="cimLegendUnified2026";
 overlay.setAttribute("aria-label","Légende cartographique");
 overlay.style.cssText=[
  "position:absolute",
  "left:12px",
  "bottom:18px",
  "z-index:1100",
  "background:rgba(255,255,255,.98)",
  "border:2px solid #0A3A8F",
  "box-shadow:0 3px 16px #0003",
  "border-radius:11px",
  "padding:11px 13px",
  "font:12px/1.45 system-ui",
  "color:#172b48",
  "max-width:260px",
  "max-height:65%",
  "overflow:auto"
 ].join(";");

 const header=document.createElement("strong");
 header.textContent="Légende de la carte";
 header.style.cssText="display:block;font-size:14px;margin-bottom:8px";
 overlay.append(header);

 const label=document.createElement("label");
 label.style.cssText=
  "display:flex;gap:9px;align-items:center;cursor:pointer;"+
  "font-weight:750;margin-bottom:7px";
 const box=document.createElement("input");
 box.id="cimPriceToggle";
 box.type="checkbox";
 box.checked=true;
 box.style.cssText=
  "width:20px;height:20px;accent-color:#0A3A8F;flex:none";
 const caption=document.createElement("span");
 caption.textContent="Afficher les prix territoriaux";
 label.append(box,caption);
 overlay.append(label);

 const hint=document.createElement("div");
 hint.id="cimPriceToggleHint";
 hint.style.cssText="font-size:11px;color:#64748b;margin-bottom:8px";
 overlay.append(hint);

 function section(title,items){
  const container=document.createElement("section");
  container.style.cssText=
   "border-top:1px solid #dbe3ed;padding-top:8px;margin-top:8px";
  const heading=document.createElement("strong");
  heading.textContent=title;
  heading.style.cssText="display:block;margin-bottom:5px";
  container.append(heading);
  for(const [name,shade] of items){
   const row=document.createElement("div");
   row.style.cssText="display:flex;align-items:center;gap:7px;margin:3px 0";
   const swatch=document.createElement("span");
   swatch.style.cssText=
    "width:13px;height:13px;flex:none;"+
    "background:"+shade+";border:1px solid #7d8795;border-radius:3px";
   const text=document.createElement("span");
   text.textContent=name;
   row.append(swatch,text);
   container.append(row);
  }
  return container;
 }

 const comparableLegend=section("Points des comparables · €/m²",[
  ["Inférieur au 1er quartile","#377eb8"],
  ["Du 1er quartile à la médiane","#55a868"],
  ["De la médiane au 3e quartile","#e39c37"],
  ["Supérieur au 3e quartile","#c44e52"]
 ]);
 overlay.append(comparableLegend);

 const priceLegend=section("Prix médians territoriaux · €/m²",[
  ["Moins de 2 000 €","#fee4a8"],
  ["2 000 à 2 999 €","#ffc56b"],
  ["3 000 à 3 999 €","#f99351"],
  ["4 000 à 5 499 €","#e95743"],
  ["5 500 € et plus","#ae2648"],
  ["Données insuffisantes","#9ca3af"]
 ]);
 overlay.append(priceLegend);

 const note=document.createElement("small");
 note.textContent=
  "Les couleurs du fond de carte ne représentent pas des prix.";
 note.style.cssText="display:block;margin-top:8px;color:#64748b";
 overlay.append(note);

 area.append(overlay);
 L.DomEvent.disableClickPropagation(overlay);
 L.DomEvent.disableScrollPropagation(overlay);

 box.addEventListener("change",()=>{
  prixEnabled=box.checked;
  priceVisibility();
 });

 function priceVisibility(){
  const territorialZoom=map.getZoom()<=12;
  const show=prixEnabled&&territorialZoom;
  const hint=document.getElementById("cimPriceToggleHint");
  if(hint)hint.textContent=!prixEnabled
    ?"Couche des prix désactivée"
    :territorialZoom
     ?"Prix territoriaux affichés sur la carte"
     :"Dézoomer pour voir les aplats de prix territoriaux";
  const legend=document.getElementById("cimLegendUnified2026");
  if(legend)legend.style.display="block";
  if(!layerPrix)return;
  if(show&&!map.hasLayer(layerPrix))layerPrix.addTo(map);
  else if(!show&&map.hasLayer(layerPrix))map.removeLayer(layerPrix);
 }

 fetch(ROOT).then(r=>{
  if(!r.ok)throw Error("Carte des prix indisponible");
  return r.json();
 }).then(data=>{
  if(data.type!=="FeatureCollection"||
     !Array.isArray(data.features)||
     data.features.length<100)
   throw Error("Contours territoriaux incomplets");
  layerPrix=L.geoJSON(data,{
   interactive:true,
   style:f=>({
    color:"#64748b",weight:.7,
    fillColor:color(f.properties.prix_m2==null?null:Number(f.properties.prix_m2)),
    fillOpacity:.45
   }),
   onEachFeature:(f,layer)=>{
    const p=f.properties;
    const price=p.prix_m2==null?null:Number(p.prix_m2);
    layer.bindTooltip(
     "Territoire "+p.code+" · "+
     ((price!==null&&Number.isFinite(price)&&price>0)?euros(price):"prix indisponible")+
     " · "+p.observations+" observations"
    );
   }
  });
  priceVisibility();
 }).catch(error=>{
  console.warn("CIM carte des prix",error);
 });

 function filterQuery(bounds){
  const bbox="("+[
   bounds.getSouth(),bounds.getWest(),
   bounds.getNorth(),bounds.getEast()
  ].join(",")+")";
  const statements=[];
  for(const [label,id,tags] of CATEGORIES){
   if(!active.has(id))continue;
   for(const tag of tags)statements.push("nwr"+tag+bbox+";");
  }
  return "[out:json][timeout:25];("+
   statements.join("")+");out center 1000;";
 }

 function describe(item){
  const tags=item.tags||{};
  return String(
   tags.name||tags["name:fr"]||
   tags.operator||
   tags.amenity||tags.leisure||
   tags.tourism||"Équipement identifié"
  );
 }

 function refreshPoi(){
  const token=++version;
  if(layerPoi){
   map.removeLayer(layerPoi);
   layerPoi=null;
  }
  if(!active.size){
   statusNode.textContent="Choisir une ou plusieurs catégories";
   return;
  }
  const b=map.getBounds();
  if(map.getZoom()<13||
     b.getEast()-b.getWest()>.13||
     b.getNorth()-b.getSouth()>.13){
   statusNode.textContent="Zoomer sur un quartier pour voir les équipements";
   return;
  }

  statusNode.textContent="Recherche des équipements…";
  const body=new URLSearchParams({data:filterQuery(b)});
  fetch("https://overpass-api.de/api/interpreter",{
   method:"POST",body,
   headers:{"Content-Type":"application/x-www-form-urlencoded"}
  })
  .then(r=>{
   if(!r.ok)throw Error("Service OSM HTTP "+r.status);
   return r.json();
  })
  .then(data=>{
   if(token!==version)return;
   const layer=L.layerGroup();
   let count=0;
   for(const item of data.elements||[]){
    const lat=Number(item.lat??item.center?.lat);
    const lon=Number(item.lon??item.center?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    const marker=L.circleMarker([lat,lon],{
     radius:5,color:"#4c1d95",weight:1.5,
     fillColor:"#a78bfa",fillOpacity:.9
    });
    marker.bindTooltip(describe(item));
    marker.addTo(layer);
    count++;
   }
   layerPoi=layer;
   layerPoi.addTo(map);
   statusNode.textContent=count+
    " équipements répertoriés dans la zone · source OSM";
  })
  .catch(error=>{
   if(token===version){
    statusNode.textContent=
     "Service géographique indisponible : réessayer";
    console.warn("CIM équipements",error);
   }
  });
 }

 map.on("zoomend",()=>{
  priceVisibility();
  if(active.size)refreshPoi();
 });
 map.on("moveend",()=>{
  if(active.size)refreshPoi();
 });
 priceVisibility();
}

window.addEventListener("cim:ready",init);
if(document.readyState==="loading")
 document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();