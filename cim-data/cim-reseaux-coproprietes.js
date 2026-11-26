(function(){
"use strict";
const ROOT="runtime/enrichissement-national/";
const cache=new Map();
let serial=0;
function load(path){
 if(!cache.has(path))cache.set(path,fetch(ROOT+path)
  .then(r=>r.ok?r.json():null).catch(()=>null));
 return cache.get(path);
}
function normalize(v){
 return String(v||"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/[^a-z0-9]+/g," ").trim();
}
function distance(a,b,c,d){
 const r=Math.PI/180;
 const y=(c-a)*r,x=(d-b)*r;
 const h=Math.sin(y/2)**2+
  Math.cos(a*r)*Math.cos(c*r)*Math.sin(x/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function mount(){
 let el=document.getElementById("cimNationalDossier");
 if(el)return el;
 el=document.createElement("section");
 el.id="cimNationalDossier";
 el.style.cssText="padding:13px;margin:12px;border:1px solid #cbd5e1;border-radius:9px;background:white;font:13px/1.5 system-ui";
 document.querySelector(".right")?.append(el);
 return el;
}
function line(parent,key,value){
 const p=document.createElement("p");
 const strong=document.createElement("strong");
 strong.textContent=key+" : ";
 p.append(strong,document.createTextNode(String(value??"Non renseigné")));
 parent.append(p);
}
function heading(parent,value){
 const h=document.createElement("h3");
 h.textContent=value;
 parent.append(h);
}
async function show(address){
 const id=++serial;
 const el=mount();el.replaceChildren();
 const code=String(address?.code||"");
 const lat=Number(address?.latitude);
 const lon=Number(address?.longitude);
 if(!code||!Number.isFinite(lat)||!Number.isFinite(lon))return;
 heading(el,"Syndic et copropriété");
 const [rnic,arcep]=await Promise.all([
  load("coproprietes/"+encodeURIComponent(code)+".json"),
  load("reseaux/"+encodeURIComponent(code)+".json")
 ]);
 if(id!==serial)return;

 if(!rnic){
  line(el,"RNIC","Source non disponible pour ce territoire");
 }else{
  const addressText=normalize(address.label);
  const number=normalize(address.numero);
  const found=(rnic.coproprietes||[]).filter(c=>{
   const d=distance(lat,lon,Number(c.lat),Number(c.lon));
   if(!Number.isFinite(d)||d>20)return false;
   const stated=normalize(c.numero);
   const statedNumber=stated.match(/^\d+[a-z]?/);
   if(!statedNumber||statedNumber[0]!==number)return false;
   const rest=stated.slice(statedNumber[0].length).trim();
   return Boolean(rest)&&addressText.includes(rest);
  });
  if(!found.length){
   line(el,"RNIC","Aucune correspondance fiable établie");
  }else{
   line(el,"Copropriétés correspondantes",found.length);
   for(const c of found.slice(0,8)){
    const part=document.createElement("section");
    part.style.cssText="border-top:1px solid #ddd;margin-top:8px";
    line(part,"Adresse RNIC",c.adresse);
    line(part,"Immatriculation",c.id);
    line(part,"Type de syndic",c.type);
    if(String(c.type).toLowerCase()==="professionnel"){
     line(part,"Syndic professionnel",c.syndic||"Non renseigné");
     if(c.siret)line(part,"SIRET",c.siret);
    }
    if(c.fin)line(part,"Fin du mandat déclaré",c.fin);
    if(c.maj)line(part,"Dernière déclaration",c.maj);
    if(c.lots!=null)line(part,"Lots",c.lots);
    el.append(part);
   }
  }
 }
 heading(el,"DSL et fibre · ARCEP");
 if(!arcep){
  line(el,"Réseaux","Statistiques non disponibles");
 }else{
  line(el,"Période",arcep.periode);
  line(el,"Périmètre","Commune entière");
  line(el,"Jeux disponibles",
   Object.keys(arcep.donnees||{}).join(", "));
  line(el,"Éligibilité à cette adresse",
   "Non vérifiée — données communales");
 }
 const note=document.createElement("small");
 note.textContent="RNIC : rapprocher l'adresse et confirmer le mandat. ARCEP : les statistiques communales ne prouvent pas l'éligibilité d'un immeuble.";
 el.append(note);
}
window.addEventListener("cim:address-selected",e=>{
 const a=e.detail?.address||window.CIMExternalAddress;
 if(a)show(a);
});
window.addEventListener("cim:territory-selected",()=>{
 ++serial;
 document.getElementById("cimNationalDossier")?.remove();
});
})();
