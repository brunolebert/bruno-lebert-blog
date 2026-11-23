(function(){
"use strict";
const URL="runtime/atlas-prix/communes-prioritaires.geojson";
const colors=["#15966C","#65C044","#F0DB35","#F39A35","#DC514D"];
const limits=[3000,4000,5000,6500];
const fmt=n=>Math.round(n).toLocaleString("fr-FR")+" €/m²";
let started=false;

function init(){
 if(started||!window.CIMMap||!window.L)return;
 started=true;
 const map=window.CIMMap;
 const control=L.control({position:"bottomright"});
 let layer=null,geo=null,selected=null;

 const box=L.DomUtil.create("div","cim-territorial-control");
 box.style.cssText="background:#fff;border:1px solid #cbd6e2;box-shadow:0 2px 12px #0002;border-radius:9px;padding:10px 12px;font:12px/1.4 system-ui;color:#173451;max-width:260px";

 const heading=document.createElement("strong");
 heading.textContent="Atlas immobilier · autres communes";
 heading.style.cssText="display:block;margin-bottom:7px";

 const enable=document.createElement("input");
 enable.type="checkbox";
 enable.checked=true;
 const toggle=document.createElement("label");
 toggle.style.cssText="display:flex;gap:7px;align-items:center";
 toggle.append(enable,document.createTextNode("Afficher les communes"));

 const kind=document.createElement("select");
 kind.setAttribute("aria-label","Type de bien");
 kind.style.cssText="width:100%;margin:8px 0;padding:6px;border:1px solid #cbd6e2;border-radius:5px";
 for(const [value,label] of [["appartement","Appartements"],["maison","Maisons"]]){
  const option=document.createElement("option");
  option.value=value;option.textContent=label;kind.append(option);
 }

 const legend=document.createElement("div");
 legend.style.cssText="display:flex;gap:2px;margin:5px 0";
 colors.forEach(color=>{
  const cell=document.createElement("span");
  cell.style.cssText="flex:1;height:10px;background:"+color;
  legend.append(cell);
 });

 const scale=document.createElement("div");
 scale.textContent="≤ 3 000 · 4 000 · 5 000 · 6 500 · > 6 500 €/m²";
 scale.style.cssText="font-size:10px;color:#596b7c";

 const status=document.createElement("div");
 status.style.cssText="margin-top:8px";
 status.textContent="Chargement des données…";

 const detail=document.createElement("div");
 detail.style.cssText="margin-top:6px;font-weight:600";

 const note=document.createElement("small");
 note.style.cssText="display:block;margin-top:8px;color:#596b7c";
 note.textContent="Médianes indicatives communales, 2022–2026. Ni estimation à l'adresse ni mesure de tension.";

 box.append(heading,toggle,kind,legend,scale,status,detail,note);
 L.DomEvent.disableClickPropagation(box);
 L.DomEvent.disableScrollPropagation(box);
 control.onAdd=()=>box;
 control.addTo(map);

 function measure(p){
  return kind.value==="appartement"
   ?p.appartement_mediane_m2:p.maison_mediane_m2;
 }
 function count(p){
  return kind.value==="appartement"
   ?p.appartement_observations:p.maison_observations;
 }
 function label(p){
  const n=measure(p),c=count(p);
  return p.nom+" · "+(n==null
   ?"Données insuffisantes ("+c+" observations)"
   :fmt(n)+" · "+c+" observations indicatives");
 }
 function color(n){
  if(n==null||!Number.isFinite(Number(n)))return "#a6adb4";
  const i=limits.findIndex(t=>Number(n)<=t);
  return colors[i<0?4:i];
 }
 function style(f){
  const n=measure(f.properties);
  return {color:"#fff",weight:1.2,opacity:.85,
   fillColor:color(n),fillOpacity:n==null?.12:.42};
 }
 function render(){
  if(!geo)return;
  if(layer)map.removeLayer(layer);
  layer=L.geoJSON(geo,{
   style,
   onEachFeature:(f,polygon)=>{
    polygon.bindTooltip(label(f.properties),{sticky:true});
    polygon.on("click",()=>{
     selected=f;
     detail.textContent=label(f.properties);
     if(map.getZoom()<11)
      map.fitBounds(polygon.getBounds(),{maxZoom:12,padding:[25,25]});
    });
   }
  });
  if(enable.checked)layer.addTo(map);
  status.textContent=geo.features.length+" communes · "+
   kind.options[kind.selectedIndex].text;
  detail.textContent=selected?label(selected.properties):
   "Sélectionner une commune sur la carte.";
  window.CIMAtlasTerritorialLayer=layer;
 }
 kind.addEventListener("change",render);
 enable.addEventListener("change",()=>{
  if(!layer)return;
  if(enable.checked)layer.addTo(map);
  else map.removeLayer(layer);
 });

 fetch(URL).then(r=>{
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.json();
 }).then(data=>{
  if(data.type!=="FeatureCollection"||
   !Array.isArray(data.features)||data.features.length!==5||
   new Set(data.features.map(f=>f.properties?.code_insee)).size!==5)
   throw Error("Données territoriales non conformes");
  geo=data;render();
 }).catch(e=>{
  console.error("Atlas territorial",e);
  status.textContent="Atlas indisponible : "+e.message;
 });
}
if(window.CIMMap)init();
else window.addEventListener("cim:ready",init,{once:true});
})();
