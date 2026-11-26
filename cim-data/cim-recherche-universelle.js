
(function(){
"use strict";
const root="runtime/";
const input=document.getElementById("search");
const suggestions=document.getElementById("suggestions");
const button=document.getElementById("searchButton");
if(!input||!suggestions||!button)return;

const normal=s=>String(s||"").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[-’']/g," ").replace(/\s+/g," ").trim();

const indexPromise=fetch(root+"territory-index.json").then(r=>{
 if(!r.ok)throw Error("Index territorial HTTP "+r.status);
 return r.json();
}).then(j=>{
 if(!Array.isArray(j.fields)||!Array.isArray(j.rows))
   throw Error("Schéma territorial invalide");
 const f=Object.fromEntries(j.fields.map((x,i)=>[x,i]));
 for(const k of ["code","commune","voie"])
   if(f[k]===undefined)throw Error("Champ manquant : "+k);
 return j.rows.map(r=>({
   code:String(r[f.code]),commune:String(r[f.commune]),
   slug:String(r[f.voie]),
   hay:normal(String(r[f.voie])+" "+String(r[f.commune])),
   voie:normal(r[f.voie])
 }));
});
const territoryPromise=fetch(
 root+"territoires-navigation.json"
).then(r=>{
 if(!r.ok)throw Error("Referentiel territorial HTTP "+r.status);
 return r.json();
}).then(j=>window.CIMTerritorySearch.createIndex(j))
.catch(()=>null);

const postalIndexPromise=fetch(root+"index-codes-postaux.json")
 .then(response=>{
  if(!response.ok)throw Error("Index postal indisponible");
  return response.json();
 });
const banCache=new Map();
let serial=0,activeStreet=null,selectedMarker=null;
let initialized=false;

function streetLabel(s){
 return s.slug.replace(/-/g," ")+" · "+s.commune;
}
function loadStreet(s){
 const key=s.code+"/"+s.slug;
 if(!banCache.has(key)){
  banCache.set(key,fetch(root+"ban/"+key+".json").then(r=>{
   if(!r.ok)throw Error("Fichier BAN HTTP "+r.status+" : "+key);
   return r.json();
  }).then(j=>{
   if(!Array.isArray(j.fields)||!Array.isArray(j.rows))
    throw Error("Schéma BAN invalide");
   const f=Object.fromEntries(j.fields.map((x,i)=>[x,i]));
   return j.rows.map(r=>Object.fromEntries(
     Object.entries(f).map(([k,i])=>[k,r[i]])
   ));
  }).catch(e=>{banCache.delete(key);throw e}));
 }
 return banCache.get(key);
}
function clear(){
 suggestions.replaceChildren();
 suggestions.style.display="none";
}
function option(label,subtitle,action){
 const el=document.createElement("button");
 el.type="button";el.className="suggestion";
 const strong=document.createElement("strong");
 strong.textContent=label;
 const small=document.createElement("small");
 small.textContent=subtitle;
 el.append(strong,small);
 el.addEventListener("click",action);
 suggestions.append(el);
 suggestions.style.display="block";
}
function message(s){
 clear();option(s,"",()=>{});
}
function matches(q,all){
 const terms=normal(q)
   .replace(/^\d+[a-z]?\s*/,"")
   .replace(/\b\d{5}\b/g,"")
   .replace(/[,;]/g," ")
   .split(" ").filter(Boolean);
 if(!terms.length)return [];
 return all.filter(s=>terms.every(t=>s.hay.includes(t)))
   .sort((a,b)=>{
     const aa=a.voie.startsWith(terms[0])?0:1;
     const bb=b.voie.startsWith(terms[0])?0:1;
     return aa-bb||a.commune.localeCompare(b.commune,"fr");
   }).slice(0,12);
}
function actualNumber(q){
 const m=normal(q).match(/^(\d+[a-z]?)\s+/);
 return m?m[1]:null;
}
function addressLabel(a){
 return String(a.numero||"")+" "+String(a.nom_voie||"")+
   ", "+String(a.code_postal||"")+" "+String(a.nom_commune||"");
}
function leaveTerritory(){
 document.body.classList.remove("cim-territory-mode");
 document.getElementById("cimTerritoryDossier")?.remove();
 window.CIMSelectedTerritory=null;
}

function displayTerritory(t){
 const map=window.CIMMap;
 if(!map)return;
 ++serial;
 clear();
 leaveTerritory();
 input.value=t.commune;

 if(selectedMarker){
   map.removeLayer(selectedMarker);
   selectedMarker=null;
 }

 window.CIMExternalAddress=null;
 window.CIMSelectedTerritory=t;

 document.body.classList.remove("cim-universal-mode");
 document.body.classList.add("cim-territory-mode");

 window.dispatchEvent(new CustomEvent(
   "cim:territory-selected",
   {detail:{territory:t}}
 ));

 const b=t.emprise;
 map.fitBounds(
   [[b[1],b[0]],[b[3],b[2]]],
   {padding:[30,30],maxZoom:14}
 );

 const title=document.getElementById("detailTitle");
 const subtitle=document.getElementById("detailSubtitle");

 if(title)title.textContent=t.commune;
 if(subtitle)subtitle.textContent="Vue territoriale";

 const dossier=document.createElement("section");
 dossier.id="cimTerritoryDossier";
 dossier.style.cssText="padding:13px;font:13px/1.6 system-ui";

 const rows=[
   ["Territoire",t.commune],
   ["Code INSEE",t.code],
   ["Voies indexées",String(t.voies)],
   ["Adresses BAN",String(t.adresses)],
   ["Marché immobilier","Statistiques communales à raccorder"],
   ["Comparables","Sélectionnez une adresse pour consulter les ventes proches."]
 ];

 for(const [label,value] of rows){
   const p=document.createElement("p");
   const strong=document.createElement("strong");
   strong.textContent=label+" : ";
   p.append(strong,document.createTextNode(value));
   dossier.append(p);
 }

 document.querySelector(".right")?.append(dossier);
}

function displayAddress(a,s){
 const map=window.CIMMap;
 if(!map){message("Carte non initialisée");return;}
 const lat=Number(a.lat),lon=Number(a.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)){
   message("Coordonnées de l'adresse indisponibles");return;
 }
 leaveTerritory();
 clear();
 input.value=addressLabel(a);
 const id="universal:"+s.code+":"+s.slug+":"+String(a.numero);
 const external={
   key:id,latitude:lat,longitude:lon,label:addressLabel(a),
   code:s.code,commune:s.commune,numero:String(a.numero||""),
   parcelles:String(a.cad_parcelles||"")
 };
 window.CIMExternalAddress=external;
 document.body.classList.add("cim-universal-mode");
 if(selectedMarker)map.removeLayer(selectedMarker);
 selectedMarker=L.circleMarker([lat,lon],{
   radius:9,color:"#fff",weight:3,
   fillColor:"#0A3A8F",fillOpacity:1
 }).addTo(map);
 map.setView([lat,lon],17);

 const title=document.getElementById("detailTitle");
 const subtitle=document.getElementById("detailSubtitle");
 if(title)title.textContent=external.label;
 if(subtitle)subtitle.textContent=
  "Adresse BAN · "+s.commune+" · code territoire "+s.code;

 let dossier=document.getElementById("cimUniversalDossier");
 if(!dossier){
   dossier=document.createElement("section");
   dossier.id="cimUniversalDossier";
   dossier.style.cssText="padding:13px;font:12px/1.55 system-ui";
   document.querySelector(".right")?.append(dossier);
 }
 dossier.replaceChildren();
 function line(label,value){
   const p=document.createElement("p");
   const b=document.createElement("strong");
   b.textContent=label+" : ";
   p.append(b,document.createTextNode(value));
   dossier.append(p);
 }
 line("Adresse",external.label);
 line("Commune",s.commune);
 line("Parcelle(s) référencée(s)",
   external.parcelles||"Non renseignée dans ce fichier BAN");

 window.dispatchEvent(new CustomEvent("cim:address-selected",{
   detail:{key:id,external:true,address:external}
 }));
}
async function renderStreet(s,number,token){
 try{
  const addresses=await loadStreet(s);
  if(token!==serial)return;
  clear();
  const filtered=addresses.filter(a=>
    !number||normal(a.numero).startsWith(number)
  ).sort((a,b)=>
    String(a.numero).localeCompare(String(b.numero),"fr",{numeric:true})
  );
  if(!filtered.length){
   option("Aucun numéro correspondant",streetLabel(s),()=>{});
   return;
  }
  for(const a of filtered.slice(0,35))
   option(addressLabel(a),"Ouvrir cette adresse sur la carte",
     ()=>displayAddress(a,s));
  if(filtered.length>35)
   option(filtered.length+" numéros dans cette voie",
      "Affiner avec le numéro de rue",()=>{});
 }catch(e){
  if(token===serial)message("Adresses indisponibles : "+e.message);
 }
}
async function suggest(){
 const token=++serial;
 const q=normal(input.value);
 activeStreet=null;clear();
 if(q.length<2)return;
 try{
  const all=await indexPromise;
  if(token!==serial)return;
  const number=actualNumber(q);
  const territorial=await territoryPromise;
  if(token!==serial)return;

  if(!number&&territorial){
    const exact=territorial.exact(q);
    const candidates=exact.length?exact:territorial.prefix(q);

    for(const t of candidates)
      option(t.commune,"Commune · "+t.code,
        ()=>displayTerritory(t));
  }


   // CIM_POSTAL_GLOBAL_V3
   if(/^\d{5}$/.test(q)){
    const indexPostal=await postalIndexPromise;
    if(token!==serial)return;
    const accepted=new Set(indexPostal[q]||[]);
    const byCode=new Map();

    for(const street of all){
     if(accepted.has(street.code)&&!byCode.has(street.code))
      byCode.set(street.code,street);
    }

    for(const [code,street] of byCode){
     const territory=territorial?.exact(street.commune)
      ?.find(t=>String(t.code)===code);

     option(
      street.commune+" · "+q,
      "Commune ou arrondissement",
      ()=>territory
       ?displayTerritory(territory)
       :(activeStreet=street,renderStreet(street,null,++serial))
     );
    }

    if(!byCode.size)
     message("Aucune commune couverte pour ce code postal");
    return;
   }

  const found=matches(q,all);
  if(!found.length){
    if(!suggestions.children.length)
      message("Aucune voie correspondante");
    return;
  }
  if(number){
   await Promise.all(found.slice(0,5).map(async s=>{
     try{
      const data=await loadStreet(s);
      if(token!==serial)return;
      for(const a of data.filter(a=>
        normal(a.numero).startsWith(number)).slice(0,8))
       option(addressLabel(a),"Adresse BAN · "+s.commune,
         ()=>displayAddress(a,s));
     }catch(e){console.warn("BAN",s.code,s.slug,e);}
   }));
   if(token===serial&&!suggestions.children.length)
    message("Aucun numéro trouvé ; précise la rue ou la commune");
  }else{
   for(const s of found)
    option(streetLabel(s),"Voir les numéros de cette voie",
      ()=>{activeStreet=s;renderStreet(s,null,++serial);});
  }
 }catch(e){if(token===serial)message("Recherche indisponible : "+e.message);}
}
function captureInput(e){
 if(e.target!==input)return;
 e.stopImmediatePropagation();
 suggest();
}
function captureFocus(e){
 if(e.target!==input)return;
 e.stopImmediatePropagation();
 suggest();
}
function captureKey(e){
 if(e.target!==input)return;
 if(e.key==="Enter"){
  e.preventDefault();e.stopImmediatePropagation();
  const first=suggestions.querySelector("button.suggestion");
  if(first)first.click();
 }
}
function captureClick(e){
 if(e.target===button||button.contains(e.target)){
  e.preventDefault();e.stopImmediatePropagation();
  const first=suggestions.querySelector("button.suggestion");
  if(first)first.click();
  else suggest();
 }
}
function init(){
 if(initialized)return;
 initialized=true;
 document.addEventListener("input",captureInput,true);
 document.addEventListener("focus",captureFocus,true);
 document.addEventListener("keydown",captureKey,true);
 document.addEventListener("click",captureClick,true);
 window.addEventListener("cim:address-selected",e=>{
   leaveTerritory();
   if(!e.detail?.external){
     window.CIMExternalAddress=null;
     document.body.classList.remove("cim-universal-mode");
      if(selectedMarker){
        window.CIMMap?.removeLayer(selectedMarker);
        selectedMarker=null;
      }
   }
 });
 const style=document.createElement("style");
 style.textContent=`
 body.cim-universal-mode .right .tabs,
 body.cim-universal-mode .right #detail,

 body.cim-universal-mode .left .cim-fold{display:none!important}
 #cimUniversalDossier{border-top:1px solid #dce4ef}

 body:not(.cim-universal-mode) #cimUniversalDossier,
 body.cim-territory-mode .right .tabs,
 body.cim-territory-mode .right #detail,
 body.cim-territory-mode .right .cim-fold,
 body.cim-territory-mode .left .cim-fold,
 body.cim-territory-mode #cimNearbyComparables,
 body.cim-territory-mode #cimNearbyMedian{
   display:none!important
 }
 `;
 document.head.append(style);
}
if(document.readyState==="loading")
 document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();
