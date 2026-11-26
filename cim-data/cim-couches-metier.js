(function(){
"use strict";
// CIM_DATA_PUB03X12_COUCHES_METIER
if(window.CIMBusinessLayersReady)return;
window.CIMBusinessLayersReady=true;

let banLayer=null;
let banRows=null;
let banPromise=null;
let banActive=false;
let cadActive=true;

function loadBan(){
 if(!banPromise){
  banPromise=fetch("runtime/ban/13205/boulevard-chave.json")
   .then(response=>{
    if(!response.ok)throw Error("Adresses BAN indisponibles");
    return response.json();
   })
   .then(data=>{
    if(!Array.isArray(data.fields)||!Array.isArray(data.rows))
      throw Error("Format BAN incompatible");
    const fields=data.fields;
    const ix=name=>fields.indexOf(name);
    for(const field of ["numero","lon","lat","nom_voie","code_postal"]){
      if(ix(field)<0)throw Error("Champ BAN absent : "+field);
    }
    banRows=data.rows.map(row=>({
      numero:String(row[ix("numero")]??"").trim(),
      longitude:Number(row[ix("lon")]),
      latitude:Number(row[ix("lat")]),
      voie:String(row[ix("nom_voie")]??"Boulevard Chave"),
      cp:String(row[ix("code_postal")]??"13005")
    })).filter(a=>
      a.numero&&Number.isFinite(a.longitude)&&
      Number.isFinite(a.latitude)
    );
    return banRows;
   })
   .catch(error=>{
     banPromise=null;
     throw error;
   });
 }
 return banPromise;
}

function refreshBan(){
 const map=window.CIMMap;
 if(!map||!window.L||!banActive||!banRows)return;
 if(!banLayer)banLayer=L.layerGroup();
 banLayer.clearLayers();

 const bounds=map.getBounds();
 for(const a of banRows){
   const point=L.latLng(a.latitude,a.longitude);
   if(!bounds.contains(point))continue;
   const marker=L.circleMarker(point,{
      radius:4,color:"#164c9a",weight:1,
      fillColor:"#fff",fillOpacity:1
   });
   marker.bindTooltip(a.numero+" "+a.voie);
   marker.on("click",()=>{
     if(typeof window.CIMSelectAddress==="function")
       window.CIMSelectAddress(a.numero,false);
   });
   marker.addTo(banLayer);
 }
 if(!map.hasLayer(banLayer))banLayer.addTo(map);
}

function init(){
 const map=window.CIMMap;
 const menu=document.getElementById("cimLayersMenu");
 if(!map||!menu||!window.L)return;

 if(document.getElementById("cimBusinessLayers"))return;

 const group=document.createElement("div");
 group.id="cimBusinessLayers";
 group.style.cssText=
   "border-top:1px solid #dce4ee;margin-top:10px;padding-top:10px";

 function option(label,checked,handler){
   const row=document.createElement("label");
   row.style.cssText=
     "display:flex;align-items:center;gap:9px;"+
     "margin:9px 0;cursor:pointer";
   const input=document.createElement("input");
   input.type="checkbox";
   input.checked=checked;
   input.style.cssText="width:16px;height:16px;flex:none";
   const name=document.createElement("span");
   name.textContent=label;
   row.append(input,name);
   group.append(row);
   input.addEventListener("change",()=>handler(input));
   return input;
 }

 option("Parcelles cadastrales",true,input=>{
   cadActive=input.checked;
   const layer=window.CIMParcelLayer;
   if(!layer)return;
   if(cadActive){
     if(!map.hasLayer(layer))map.addLayer(layer);
   }else if(map.hasLayer(layer)){
     map.removeLayer(layer);
   }
 });

 option("Comparables DVF calculés",
   document.getElementById("showSales")?.checked!==false,
   input=>{
     const control=document.getElementById("showSales");
     if(!control)return;
     control.checked=input.checked;
     control.dispatchEvent(new Event("change",{bubbles:true}));
   }
 );

 const banStatus=document.createElement("small");
 banStatus.style.cssText=
   "display:block;color:#64748b;margin-top:6px";

 option("Adresses BAN · boulevard Chave",false,async input=>{
   banActive=input.checked;
   if(!banActive){
     if(banLayer&&map.hasLayer(banLayer))
       map.removeLayer(banLayer);
     banStatus.textContent="";
     return;
   }

   banStatus.textContent="Chargement des adresses…";
   try{
     await loadBan();
     if(!banActive)return;
     refreshBan();
     banStatus.textContent="";
   }catch(error){
     banActive=false;
     input.checked=false;
     banStatus.textContent="Adresses indisponibles";
     console.warn("CIM BAN",error);
   }
 });
 group.append(banStatus);
 menu.append(group);

 map.on("moveend",()=>{
   if(banActive)refreshBan();
   if(!cadActive&&window.CIMParcelLayer&&
      map.hasLayer(window.CIMParcelLayer))
     map.removeLayer(window.CIMParcelLayer);
 });
}

window.addEventListener("cim:ready",init);
if(document.readyState==="loading")
 document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();