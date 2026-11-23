(()=>{
"use strict";
const ROOT="runtime/qpv/";
const SPATIAL_INDEX="cim-index-spatial.json";
const ID="cimLayersManager";
let layer=null;
let loading=null;
let generation=0;
let active=false;
let indexPromise=null;
const fileCache=new Map();

function ready(){
  return Boolean(window.CIMMap&&window.L);
}

function intersects(a,b){
  return a[0]<=b[2]&&a[2]>=b[0]&&
         a[1]<=b[3]&&a[3]>=b[1];
}

function viewport(){
  const bounds=window.CIMMap.getBounds();
  return [
    bounds.getWest(),bounds.getSouth(),
    bounds.getEast(),bounds.getNorth()
  ];
}

function getIndex(){
  if(!indexPromise){
    indexPromise=fetch(ROOT+SPATIAL_INDEX).then(response=>{
      if(!response.ok)throw Error("Index QPV indisponible");
      return response.json();
    }).catch(error=>{
      indexPromise=null;
      throw error;
    });
  }
  return indexPromise;
}

function getFile(file){
  if(!/^part-[0-9]+\.json$/.test(file))
    return Promise.reject(Error("Fichier QPV invalide"));
  if(!fileCache.has(file)){
    const promise=fetch(ROOT+file).then(response=>{
      if(!response.ok)throw Error("Fichier QPV indisponible");
      return response.json();
    }).catch(error=>{
      fileCache.delete(file);
      throw error;
    });
    fileCache.set(file,promise);
  }
  return fileCache.get(file);
}

async function load(){
  const manifest=await getIndex();
  if(!Array.isArray(manifest.files))
    throw Error("Index QPV invalide");

  const area=viewport();
  const selected=manifest.files.filter(item=>
    intersects(item.bounds,area)
  );
  const parts=await Promise.all(
    selected.map(item=>getFile(item.file))
  );

  const collection=[];
  const seen=new Set();

  for(const obj of parts){
    const fields=obj.fields||[];
    const code=fields.indexOf("code_qp");
    const name=fields.indexOf("nom_qp");
    const geom=fields.indexOf("geometry_geojson");
    const west=fields.indexOf("min_lon");
    const south=fields.indexOf("min_lat");
    const east=fields.indexOf("max_lon");
    const north=fields.indexOf("max_lat");

    if([code,name,geom,west,south,east,north].some(i=>i<0))
      throw Error("Schéma QPV incomplet");

    for(const row of obj.rows||[]){
      const bounds=[
        Number(row[west]),Number(row[south]),
        Number(row[east]),Number(row[north])
      ];
      if(!intersects(bounds,area)||!row[geom])continue;

      const geometry=typeof row[geom]==="string"
        ?JSON.parse(row[geom]):row[geom];
      if(!geometry||!["Polygon","MultiPolygon"].includes(geometry.type))
        continue;

      const key=String(row[code])+"|"+JSON.stringify(geometry);
      if(seen.has(key))continue;
      seen.add(key);

      collection.push({
        type:"Feature",
        geometry,
        properties:{
          code:String(row[code]??""),
          name:String(row[name]??"")
        }
      });
    }
  }
  return collection;
}

function makeLayer(features){
  return window.L.geoJSON({
    type:"FeatureCollection",features
  },{
    style:{
      color:"#b45309",
      weight:2,
      fillColor:"#f59e0b",
      fillOpacity:0.19
    },
    onEachFeature(feature,polygon){
      const p=feature.properties||{};
      const node=document.createElement("div");
      const title=document.createElement("strong");
      title.textContent=p.name||"Quartier prioritaire";
      const code=document.createElement("div");
      code.textContent="Code QPV : "+(p.code||"non renseigné");
      node.append(title,code);
      polygon.bindPopup(node);
    }
  });
}

async function refresh(status){
  if(!active)return;
  const current=++generation;
  status.textContent="Actualisation QPV…";
  try{
    const features=await load();
    if(!active||current!==generation)return;

    const next=makeLayer(features);
    if(layer&&window.CIMMap.hasLayer(layer))
      window.CIMMap.removeLayer(layer);
    layer=next;
    layer.addTo(window.CIMMap);
    status.textContent=features.length+" périmètres affichés";
  }catch(error){
    if(current!==generation||!active)return;
    status.textContent="Actualisation indisponible";
    console.error("CIM QPV",error);
  }
}

function control(){
  if(document.getElementById(ID))return;
  const map=window.CIMMap;
  if(!map)return;

  const container=document.createElement("div");
  container.id=ID;
  container.style.cssText="position:relative;font:13px system-ui,sans-serif";

  const button=document.createElement("button");
  button.type="button";
  button.textContent="☷ Couches ▾";
  button.setAttribute("aria-expanded","false");
  button.setAttribute("aria-controls","cimLayersMenu");
  button.style.cssText="background:white;color:#17365d;border:1px solid #cbd5e1;border-radius:8px;padding:8px 11px;font:600 13px system-ui;box-shadow:0 2px 8px #0002;cursor:pointer";

  const menu=document.createElement("div");
  menu.id="cimLayersMenu";
  menu.hidden=true;
  menu.style.cssText="position:absolute;top:calc(100% + 5px);left:0;width:235px;max-width:calc(100vw - 40px);background:white;color:#1e293b;border:1px solid #cbd5e1;border-radius:9px;padding:12px;box-shadow:0 5px 20px #0003;box-sizing:border-box;z-index:1000";

  const heading=document.createElement("strong");
  heading.textContent="Couches cartographiques";
  heading.style.cssText="display:block;margin-bottom:10px";
  menu.append(heading);

  const label=document.createElement("label");
  label.style.cssText="display:flex;align-items:center;gap:9px;cursor:pointer;line-height:1.4";

  const checkbox=document.createElement("input");
  checkbox.type="checkbox";
  checkbox.style.cssText="flex:none;width:16px;height:16px";
  checkbox.setAttribute("aria-label","Afficher les quartiers prioritaires QPV");

  const text=document.createElement("span");
  text.textContent="Quartiers prioritaires (QPV)";
  label.append(checkbox,text);
  menu.append(label);

  const status=document.createElement("div");
  status.style.cssText="font-size:11px;color:#64748b;margin-top:9px";
  status.textContent="Couche désactivée";
  menu.append(status);

  container.append(button,menu);

  function setOpen(open){
    menu.hidden=!open;
    button.setAttribute("aria-expanded",String(open));
    button.textContent=open?"☷ Couches ▴":"☷ Couches ▾";
  }

  button.addEventListener("click",()=>setOpen(menu.hidden));
  document.addEventListener("pointerdown",event=>{
    if(!container.contains(event.target))setOpen(false);
  });
  container.addEventListener("keydown",event=>{
    if(event.key==="Escape"){
      setOpen(false);
      button.focus();
    }
  });

  const leafletControl=window.L.control({position:"topleft"});
  leafletControl.onAdd=()=>container;
  leafletControl.addTo(map);
  window.L.DomEvent.disableClickPropagation(container);
  window.L.DomEvent.disableScrollPropagation(container);

  checkbox.addEventListener("change",()=>{
    active=checkbox.checked;
    if(!active){
      generation++;
      if(layer&&map.hasLayer(layer))map.removeLayer(layer);
      status.textContent="Couche désactivée";
      return;
    }
    refresh(status);
  });

  map.on("moveend",()=>{
    if(active)refresh(status);
  });
}

function init(){
  if(ready())control();
}
window.addEventListener("cim:ready",init);
if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",init,{once:true});
else
  init();
})();
