
(function(){
"use strict";

const colors = ["#208f78","#65bf54","#e9e751","#ffad32","#e64b43"];
const money = n => Number.isFinite(n)
  ? Math.round(n).toLocaleString("fr-FR")+" €/m²" : "—";

function median(values){
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const middle = Math.floor(sorted.length/2);
  return sorted.length%2
    ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}

function start(){
  if(window.CIMPriceLayerStarted) return;
  window.CIMPriceLayerStarted = true;

  const map = window.CIMMap;
  const data = window.CIMData;
  if(!map || !data || !window.L) return;

  const groups = new Map();
  for(const record of data.mutations){
    const key = String(record.parcelles?.[0] || "").trim();
    const value = Number(record.ratio_m2);
    if(!key || !Number.isFinite(value) || value<=0) continue;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(value);
  }

  const q1 = Number(data.street.stats.q1_m2);
  const med = Number(data.street.stats.median_m2);
  const q3 = Number(data.street.stats.q3_m2);
  const validScale = [q1,med,q3].every(Number.isFinite);

  function priceColor(value){
    if(!validScale) return "#8c98a4";
    if(value<q1) return colors[0];
    if(value<med) return colors[1];
    if(value<=q3) return colors[2];
    if(value<=q3+(q3-med)) return colors[3];
    return colors[4];
  }

  const polygons = L.featureGroup();
  const control = L.control({position:"bottomleft"});
  control.onAdd = function(){
    const div = L.DomUtil.create("div","cim-parcel-control");
    div.innerHTML = `
      <label class="cim-parcel-label">
        <input type="checkbox" id="cimShowPriceParcels">
        Prix au m² par parcelle
      </label>
      <div class="cim-parcel-gradient"></div>
      <div class="cim-parcel-scale">
        <span>Q1 ${money(q1)}</span>
        <span>Médiane ${money(med)}</span>
        <span>Q3 ${money(q3)}</span>
      </div>
      <div class="cim-parcel-status" id="cimParcelStatus">
        Chargement des géométries…
      </div>
      <div class="cim-parcel-note">
        Comparables calculés associés aux parcelles cadastrales.
        Coloration à partir de 2 comparables par parcelle.
        Ce n'est pas un indicateur de tension du marché.
      </div>`;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    div.querySelector("input").addEventListener("change",event=>{
      if(event.target.checked) polygons.addTo(map);
      else map.removeLayer(polygons);
    });
    return div;
  };
  control.addTo(map);

  async function load(){
    const indexResponse = await fetch("runtime/cadastre/13205/_index.json");
    if(!indexResponse.ok) throw new Error("Index cadastre inaccessible");
    const index = await indexResponse.json();
    if(index.code!=="13205" || !Array.isArray(index.shards))
      throw new Error("Index cadastre inattendu");

    const files = index.shards.map((_,i)=>
      "runtime/cadastre/13205/part-"+String(i).padStart(5,"0")+".json"
    );
    let matched=0, colored=0, geometries=0, missing=0;
    const found = new Set();

    // Petits lots : éviter de lancer simultanément 30 requêtes.
    for(let offset=0;offset<files.length;offset+=5){
      const batch = await Promise.all(files.slice(offset,offset+5).map(
        async path=>{
          const response=await fetch(path);
          if(!response.ok) throw new Error("HTTP "+response.status+" : "+path);
          return response.json();
        }
      ));
      for(const shard of batch){
        const fields=shard.fields;
        if(!Array.isArray(fields)||!Array.isArray(shard.rows))
          throw new Error("Format géométrique inattendu");

        const keyIndex=fields.indexOf("dvf_parcelle_key");
        if(keyIndex<0)
          throw new Error("Champ dvf_parcelle_key absent du cadastre");
        const geometryIndex=fields.indexOf("geometry_geojson")>=0
          ? fields.indexOf("geometry_geojson") : 8;

        for(const row of shard.rows){
          const key=String(row[keyIndex]||"").trim();
          const values=groups.get(key);
          if(!values) continue;
          matched++;
          found.add(key);

          if(values.length<2) continue;
          let geometry;
          try{
            geometry=typeof row[geometryIndex]==="string"
              ? JSON.parse(row[geometryIndex]) : row[geometryIndex];
          }catch(_){missing++;continue;}
          if(!geometry || !geometry.coordinates){missing++;continue;}

          const value=median(values);
          const feature={
            type:"Feature",
            geometry,
            properties:{key,value,count:values.length}
          };
          L.geoJSON(feature,{
            style:{
              color:"#334861",weight:1,opacity:.8,
              fillColor:priceColor(value),fillOpacity:.68
            },
            onEachFeature:(_,poly)=>{
              const title=document.createElement("div");
              const strong=document.createElement("strong");
              strong.textContent="Parcelle "+key;
              const detail=document.createElement("div");
              detail.textContent=money(value)+" · "+
                values.length+" comparables calculés";
              title.append(strong,detail);
              poly.bindPopup(title);
            }
          }).addTo(polygons);
          colored++;
          geometries++;
        }
      }
    }

    const status=document.getElementById("cimParcelStatus");
    if(status){
      status.textContent=colored+" parcelles colorées · "+
        found.size+" références rapprochées · "+
        groups.size+" parcelles avec comparables";
    }
    window.CIMParcelCounts={
      references:groups.size,matched:found.size,
      colored,geometry_errors:missing
    };
  }

  load().catch(error=>{
    console.error("CIM Data cadastre/prix",error);
    const status=document.getElementById("cimParcelStatus");
    if(status) status.textContent="Couche indisponible : "+error.message;
  });
}

if(window.CIMMap && window.CIMData) start();
else window.addEventListener("cim:ready",start,{once:true});
})();
