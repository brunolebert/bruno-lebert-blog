(function(){
"use strict";
const C="runtime/enrichissement-national/";
const cache=new Map();
let serial=0;
function load(path){
 if(!cache.has(path)){
  cache.set(path,fetch(C+path).then(r=>r.ok?r.json():null)
   .catch(()=>null));
 }
 return cache.get(path);
}
function distance(a,b,c,d){
 const rad=Math.PI/180,dy=(c-a)*rad,dx=(d-b)*rad;
 const h=Math.sin(dy/2)**2+
   Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dx/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
function node(tag,text){
 const e=document.createElement(tag);
 e.textContent=String(text??"");
 return e;
}
function addLine(parent,key,value){
 const p=node("p","");
 const b=node("strong",key+" : ");
 p.append(b,document.createTextNode(String(value??"Non renseigné")));
 parent.append(p);
}
function mount(){
 let el=document.getElementById("cimNationalEnrichissement");
 if(el)return el;
 el=node("section","");
 el.id="cimNationalEnrichissement";
 el.style.cssText="padding:13px;margin:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font:13px/1.5 system-ui";
 document.querySelector(".right")?.append(el);
 return el;
}
async function show(address){
 const token=++serial;
 const el=mount();el.replaceChildren();
 const code=String(address?.code||"");
 const lat=Number(address?.latitude);
 const lon=Number(address?.longitude);
 if(!code||!Number.isFinite(lat)||!Number.isFinite(lon))return;
 el.append(node("h3","Copropriété et réseaux"));
 const [rnic,network]=await Promise.all([
  load("coproprietes/"+encodeURIComponent(code)+".json"),
  load("reseaux/"+encodeURIComponent(code)+".json")
 ]);
 if(token!==serial)return;
 const title=node("strong","Syndic et copropriété · RNIC");
 el.append(title);
 if(!rnic){
  addLine(el,"RNIC","Aucun fichier territorial disponible");
 }else{
  const number=String(address.numero||"").trim().toLowerCase();
  const matches=(rnic.coproprietes||[]).filter(c=>{
   if(distance(lat,lon,Number(c.lat),Number(c.lon))>20)return false;
   const n=String(c.numero||"").trim().match(/^(\d+[a-z]?)\b/i);
   return Boolean(n)&&n[1].toLowerCase()===number;
  });
  if(!matches.length){
   addLine(el,"Résultat","Aucune correspondance suffisamment précise");
  }else{
   addLine(el,"Copropriétés proches",matches.length);
   for(const c of matches.slice(0,8)){
    const section=node("div","");
    section.style.cssText="border-top:1px solid #cbd5e1;margin-top:8px";
    addLine(section,"Adresse déclarée",c.adresse);
    addLine(section,"Immatriculation",c.id);
    addLine(section,"Type de syndic",c.type_syndic);
    if(String(c.type_syndic).toLowerCase()==="professionnel"){
     addLine(section,"Syndic professionnel",
       c.syndic_professionnel||"Non renseigné");
     if(c.siret)addLine(section,"SIRET",c.siret);
    }
    if(c.fin_mandat)addLine(section,"Fin de mandat déclarée",c.fin_mandat);
    if(c.mise_a_jour)addLine(section,"Mise à jour",c.mise_a_jour);
    if(c.lots)addLine(section,"Lots",c.lots);
    el.append(section);
   }
  }
 }
 el.append(node("hr",""));
 el.append(node("strong","Internet fixe · ARCEP"));
 if(network){
  addLine(el,"Périmètre","Statistiques communales");
  addLine(el,"Référence","ARCEP "+network.periode);
  addLine(el,"Couches disponibles",
   Object.keys(network.donnees||{}).join(", ")||"Aucune");
  addLine(el,"Éligibilité du bâtiment",
   "Non vérifiée : statistiques communales uniquement");
 }else{
  addLine(el,"Réseaux","Statistiques communales non disponibles");
 }
 el.append(node("small",
  "RNIC : rapprochement indicatif, à confirmer par l'immatriculation et le mandat. Réseaux : les statistiques communales ne certifient pas l'éligibilité à l'adresse."));
}
window.addEventListener("cim:address-selected",e=>{
 const a=e.detail?.address||window.CIMExternalAddress;
 if(a)show(a);
});
window.addEventListener("cim:territory-selected",()=>{
 ++serial;
 document.getElementById("cimNationalEnrichissement")?.remove();
});
})();