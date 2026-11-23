(()=>{
"use strict";
const ROOT="runtime/qpv/";
const SPATIAL_INDEX="cim-index-spatial.json";
const ID="cimLayersManager";
let layer=null;
let loading=null;

function ready(){
  return Boolean(window.CIMMap&&window.L);
}

async function load(){
  const response=await fetch(ROOT+SPATIAL_INDEX);
  if(!response.ok)throw Error("Manifeste QPV indisponible");
  const manifest=await response.json();
  if(!Array.isArray(manifest.files)||!manifest.files.length)
    throw Error("Manifeste QPV vide");

  const collection=[];
  const bounds=window.CIMMap.getBounds();
  const viewport=[
    bounds.getWest(),bounds.getSouth(),
    bounds.getEast(),bounds.getNorth()
  ];
  const intersects=(a,b)=>
    a[0]<=b[2]&&a[2]>=b[0]&&
    a[1]<=b[3]&&a[3]>=b[1];
  const selected=manifest.files.filter(item=>
    intersects(item.bounds,viewport));
  for(const item of selected){
    const file=item.file;
    if(!/^part-[0-9]+\.json$/.test(file))
      throw Error("Nom de fichier QPV invalide");
    const r=await fetch(ROOT+file);
    if(!r.ok)throw Error("Fichier QPV indisponible : "+file);
    const obj=await r.json();
    const fields=obj.fields||[];
    const code=fields.indexOf("code_qp");
    const name=fields.indexOf("nom_qp");
    const geom=fields.indexOf("geometry_geojson");
    if(code<0||name<0||geom<0)
      throw Error("Schéma QPV incomplet");
    for(const row of obj.rows||[]){
      const raw=row[geom];
      if(!raw)continue;
      const geometry=typeof raw==="string"?JSON.parse(raw):raw;
      if(!geometry||!["Polygon","MultiPolygon"].includes(geometry.type))
        continue;
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

function control(){
  if(document.getElementById(ID))return;
  const map=window.CIMMap;
  if(!map)return;

  const container=document.createElement("div");
  container.id=ID;
  container.style.cssText=[
    "background:#fff","padding:8px 12px",
    "border:1px solid #cbd5e1","border-radius:8px",
    "box-shadow:0 2px 8px #0002","font:13px system-ui",
    "max-width:190px"
  ].join(";");

  const heading=document.createElement("strong");
  heading.textContent="Couches cartographiques";
  container.append(heading);
  const label=document.createElement("label");
  label.style.cssText="display:flex;align-items:center;gap:7px;cursor:pointer";
  const checkbox=document.createElement("input");
  checkbox.type="checkbox";
  checkbox.setAttribute("aria-label","Afficher les quartiers prioritaires QPV");
  const text=document.createElement("span");
  text.textContent="Quartiers prioritaires (QPV)";
  label.append(checkbox,text);
  label.style.marginTop="7px";
  container.append(label);

  const status=document.createElement("div");
  status.style.cssText="font-size:11px;color:#64748b;margin-top:3px";
  status.textContent="Couche désactivée";
  container.append(status);

  const leafletControl=window.L.control({position:"bottomleft"});
  leafletControl.onAdd=()=>container;
  leafletControl.addTo(map);
  window.L.DomEvent.disableClickPropagation(container);
  window.L.DomEvent.disableScrollPropagation(container);

  checkbox.addEventListener("change",async()=>{
    if(!checkbox.checked){
      if(layer&&map.hasLayer(layer))map.removeLayer(layer);
      status.textContent="Couche désactivée";
      return;
    }
    checkbox.disabled=true;
    status.textContent="Chargement des périmètres…";
    try{
      if(!layer){
        if(!loading)loading=load();
        const features=await loading;
        layer=window.L.geoJSON({
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
      if(checkbox.checked){
        layer.addTo(map);
        status.textContent=layer.getLayers().length+
          " périmètres chargés";
      }
    }catch(error){
      checkbox.checked=false;
      loading=null;
      status.textContent="Chargement indisponible";
      console.error("CIM QPV",error);
    }finally{
      checkbox.disabled=false;
    }
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
