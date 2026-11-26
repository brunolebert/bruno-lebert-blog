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

 const legend=L.control({position:"bottomleft"});
 legend.onAdd=()=>{
  const el=L.DomUtil.create("div","cim-prix-legend");
  el.style.cssText=
   "background:#ffffffeb;border:1px solid #cbd5e1;"+
   "border-radius:8px;padding:9px 11px;"+
   "font:11px/1.5 system-ui;box-shadow:0 2px 8px #0002";
  const title=document.createElement("strong");
  title.textContent="Prix médians indicatifs · €/m²";
  el.append(title);
  for(const [label,shade] of [
   ["Moins de 2 000","#fee4a8"],
   ["2 000 – 2 999","#ffc56b"],
   ["3 000 – 3 999","#f99351"],
   ["4 000 – 5 499","#e95743"],
   ["5 500 et plus","#ae2648"],
   ["Données insuffisantes","#9ca3af"]
  ]){
   const row=document.createElement("div");
   row.style.cssText="display:flex;align-items:center;gap:6px";
   const swatch=document.createElement("span");
   swatch.style.cssText=
    "display:inline-block;width:11px;height:11px;"+
    "background:"+shade+";border:1px solid #999;flex:none";
   const t=document.createElement("span");
   t.textContent=label;
   row.append(swatch,t);
   el.append(row);
  }
  return el;
 };
 legend.addTo(map);
 const legendEl=document.querySelector(".cim-prix-legend");

 function priceVisibility(){
  const show=map.getZoom()<=12;
  if(legendEl)legendEl.hidden=!show;
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