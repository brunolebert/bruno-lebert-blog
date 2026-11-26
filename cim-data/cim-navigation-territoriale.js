
(function(){
"use strict";

const normalize = value => String(value || "")
 .normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"")
 .toLowerCase()
 .replace(/[-’']/g," ")
 .replace(/\s+/g," ")
 .trim();

function createIndex(data){
 if(!Array.isArray(data.territoires))
   throw Error("Referentiel territorial invalide");

 const index = new Map();

 for(const t of data.territoires){
   const name = normalize(t.commune);
   if(!name || !t.code || !t.centre)
     throw Error("Territoire incomplet");

   if(!index.has(name))index.set(name,[]);
   index.get(name).push(t);
 }

 return {
   exact(query){
     return index.get(normalize(query)) || [];
   },
   prefix(query){
     const q=normalize(query);
     if(q.length<2)return [];
     return [...index.entries()]
       .filter(([name])=>name.startsWith(q))
       .flatMap(([,items])=>items)
       .slice(0,12);
   }
 };
}

if(typeof module!=="undefined" && module.exports)
 module.exports={normalize,createIndex};
else
 window.CIMTerritorySearch={normalize,createIndex};

})();
