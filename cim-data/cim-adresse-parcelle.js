
(function(){
"use strict";

const CODE="13205";
const normalizeNumber=s=>String(s??"").trim().toUpperCase();
const parcelPattern=/(\d{3})\s*([A-Za-z])\s*0*(\d{1,4})/g;

function parcelKeys(raw){
  const keys=[];
  for(const match of String(raw||"").matchAll(parcelPattern)){
    keys.push(CODE+"|"+Number(match[1])+"|"+
      match[2].toUpperCase()+"|"+Number(match[3]));
  }
  return [...new Set(keys)];
}

async function loadRows(path){
  const response=await fetch(path);
  if(!response.ok)throw new Error("HTTP "+response.status+" : "+path);
  const obj=await response.json();
  if(!Array.isArray(obj.fields)||!Array.isArray(obj.rows))
    throw new Error("Format inattendu : "+path);
  const f=Object.fromEntries(obj.fields.map((v,i)=>[v,i]));
  return {rows:obj.rows,fields:f};
}

async function initialize(){
  const map=window.CIMMap;
  const data=window.CIMData;
  if(!map||!data||!window.L||!window.CIMSelectAddress)
    throw new Error("Explorateur non initialisé");

  const [ban,indexResponse]=await Promise.all([
    loadRows("runtime/ban/"+CODE+"/boulevard-chave.json"),
    fetch("runtime/cadastre/"+CODE+"/_index.json")
  ]);
  if(!indexResponse.ok)throw new Error("Index cadastre inaccessible");
  const index=await indexResponse.json();
  if(index.code!==CODE||!Array.isArray(index.shards))
    throw new Error("Index cadastral incompatible");

  const keysByNumber=new Map();
  const numbersByParcel=new Map();

  for(const row of ban.rows){
    const number=normalizeNumber(row[ban.fields.numero]);
    if(!number)continue;
    const keys=parcelKeys(row[ban.fields.cad_parcelles]);
    const existing=keysByNumber.get(number)||new Set();
    for(const key of keys){
      existing.add(key);
      if(!numbersByParcel.has(key))
        numbersByParcel.set(key,new Set());
      numbersByParcel.get(key).add(number);
    }
    keysByNumber.set(number,existing);
  }

  const parcelLayer=L.featureGroup().addTo(map);
  const parcels=new Map();
  let selected=null;
  let pendingAddress=null;
  let loading=false;
  let loaded=false;

  const control=L.control({position:"bottomright"});
  control.onAdd=()=>{
    const el=L.DomUtil.create("div","cim-parcel-navigation");
    el.style.cssText=[
      "background:#fff","border:1px solid #cbd5e1",
      "border-radius:9px","padding:10px 12px",
      "box-shadow:0 2px 12px #0002",
      "max-width:260px","font:12px/1.4 system-ui"
    ].join(";");
    el.innerHTML=
      "<strong>Parcelles cadastrales</strong>"+
      "<div id='cimParcelNavigationStatus'>"+
      "Zoomer sur une adresse pour explorer ses parcelles."+
      "</div>";
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    return el;
  };
  control.addTo(map);

  function status(message){
    const el=document.getElementById("cimParcelNavigationStatus");
    if(el)el.textContent=message;
  }

  function paint(){
    if(!loaded)return;
    parcelLayer.clearLayers();
    const visible=map.getBounds();
    const detailed=map.getZoom()>=16;

    for(const [key,entry] of parcels){
      const active=selected===key;
      if(!active&&!detailed)continue;
      if(!active&&!visible.intersects(entry.bounds))continue;
      const polygon=entry.layer;
      polygon.setStyle({
        color:active?"#FF3B30":"#0A3A8F",
        weight:active?4:1.2,
        opacity:active?1:.62,
        fillColor:active?"#FF9500":"#007AFF",
        fillOpacity:active?.23:.035
      });
      polygon.addTo(parcelLayer);
      if(active)polygon.bringToFront();
    }
  }

  function updateCard(key){
    const entry=parcels.get(key);
    if(!entry)return;
    const container=document.getElementById("detail");
    if(!container)return;
    container.querySelector("#cimParcelCard")?.remove();

    const box=document.createElement("div");
    box.id="cimParcelCard";
    box.className="sale";
    const heading=document.createElement("strong");
    heading.textContent="Parcelle cadastrale";
    const reference=document.createElement("div");
    reference.textContent=entry.idu+" · Référence "+key;

    const numbers=[...(numbersByParcel.get(key)||[])];
    numbers.sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));

    const info=document.createElement("div");
    info.textContent=numbers.length
      ? "Adresse(s) BAN associée(s) : "+numbers.join(", ")
      : "Aucune adresse BAN du boulevard Chave associée";

    const note=document.createElement("small");
    note.textContent="Une parcelle peut correspondre à plusieurs "+
      "adresses ou bâtiments. Les ventes ne sont pas attribuées "+
      "automatiquement à un logement.";

    box.append(heading,reference,info,note);
    container.prepend(box);
  }

  function selectParcel(key,{recenter=false,fromMap=false}={}){
    const entry=parcels.get(key);
    if(!entry)return;
    selected=key;
    paint();
    if(recenter){
      map.fitBounds(entry.bounds,{
        padding:[55,55],maxZoom:19
      });
    }
    const numbers=[...(numbersByParcel.get(key)||[])];
    numbers.sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));

    if(fromMap){
      const address=numbers
        .map(n=>data.addresses.find(a=>
          normalizeNumber(a.key)===n))
        .find(Boolean);
      if(address){
        window.CIMSelectAddress(address.key,false);
      }else{
        document.getElementById("detailTitle").textContent=
          "Parcelle "+entry.idu;
        document.getElementById("detailSubtitle").textContent=
          "Parcelle cadastrale · aucune adresse liée dans ce témoin";
        document.getElementById("detail").replaceChildren();
      }
    }
    updateCard(key);
    status("Parcelle sélectionnée : "+entry.idu);
  }

  function selectFromAddress(number){
    const keys=[...(keysByNumber.get(normalizeNumber(number))||[])];
    const found=keys.find(key=>parcels.has(key));
    if(found){
      selectParcel(found,{recenter:true});
      if(keys.length>1)
        status(keys.length+" parcelles liées à cette adresse ; "+
          "première parcelle surlignée.");
    }else{
      selected=null;paint();
      status(keys.length
        ? "Référence cadastrale non trouvée dans les géométries"
        : "Lien cadastral non établi pour cette adresse");
    }
  }

  async function loadParcels(){
    if(loaded||loading)return;
    loading=true;
    status("Chargement des géométries cadastrales…");
    try{
      for(let start=0;start<index.shards.length;start+=5){
        const results=await Promise.all(
          index.shards.slice(start,start+5).map((_,offset)=>
            loadRows(
              "runtime/cadastre/"+CODE+"/part-"+
              String(start+offset).padStart(5,"0")+".json"
            )
          )
        );
        for(const shard of results){
          for(const row of shard.rows){
            const f=shard.fields;
            const key=String(row[f.dvf_parcelle_key]||"");
            if(!key)continue;
            let geometry;
            try{
              geometry=JSON.parse(row[f.geometry_geojson]);
            }catch(_){continue;}
            if(!geometry?.coordinates)continue;

            const feature={
              type:"Feature",
              geometry,
              properties:{key}
            };
            const polygon=L.geoJSON(feature);
            const bounds=polygon.getBounds();
            if(!bounds.isValid())continue;
            const idu=String(row[f.idu]||key);
            polygon.on("click",event=>{
              L.DomEvent.stopPropagation(event);
              selectParcel(key,{fromMap:true});
            });
            parcels.set(key,{idu,bounds,layer:polygon});
          }
        }
      }
      loaded=true;
      paint();
      status(parcels.size.toLocaleString("fr-FR")+
        " parcelles disponibles à fort zoom");
      if(pendingAddress!==null)
        selectFromAddress(pendingAddress);
    }finally{
      loading=false;
    }
  }

  window.addEventListener("cim:address-selected",event=>{
    pendingAddress=event.detail?.key??null;
    if(loaded)selectFromAddress(pendingAddress);
    else loadParcels().catch(error=>{
      console.error("Parcelles CIM Data",error);
      status("Cadastre indisponible : "+error.message);
    });
  });

  map.on("moveend zoomend",()=>{
    if(loaded)paint();
    else if(map.getZoom()>=16)
      loadParcels().catch(error=>{
        console.error(error);
        status("Erreur de chargement du cadastre");
      });
  });

  loadParcels().then(()=>{
    const selectedAddress=data.addresses.find(a=>
      String(a.key)===String(window.CIMInitialAddressKey||""));
    if(selectedAddress)
      selectFromAddress(selectedAddress.key);
  }).catch(error=>{
    console.error("CIM Data parcelles",error);
    status("Cadastre indisponible : "+error.message);
  });
}

if(window.CIMMap&&window.CIMData){
  initialize().catch(console.error);
}else{
  window.addEventListener("cim:ready",()=>{
    initialize().catch(console.error);
  },{once:true});
}
})();
