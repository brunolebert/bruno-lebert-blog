
(function(){
"use strict";
async function init(){
  const map=window.CIMMap;
  if(!map || !window.L) return;
  const response=await fetch("quartiers-prix.json");
  if(!response.ok)throw new Error("Prix quartiers HTTP "+response.status);
  const data=await response.json();
  const thresholds=data.metadata.seuils_eur_m2;
  const colors=["#15966C","#65C044","#F0DB35","#F39A35","#DC514D"];
  const price=n=>Math.round(n).toLocaleString("fr-FR")+" €/m²";
  let chosen=null;
  const overlay=L.geoJSON(data,{
    style:feature=>{
      const n=feature.properties.cim_mediane_m2;
      const color=n==null ? "#9daab1" :
        colors[thresholds.findIndex(t=>n<=t)<0 ? 4 :
          thresholds.findIndex(t=>n<=t)];
      return {
        color:n==null?"#bac4ca":"#fff",
        weight:1,opacity:.85,
        fillColor:color,
        fillOpacity:n==null?.035:.38
      };
    },
    onEachFeature:(feature,polygon)=>{
      const p=feature.properties;
      const popup=document.createElement("div");
      const title=document.createElement("strong");
      title.textContent=p.nom||"Quartier";
      popup.append(title);
      const details=document.createElement("div");
      details.textContent=p.cim_mediane_m2==null
        ? "Données insuffisantes pour colorer ce quartier"
        : price(p.cim_mediane_m2)+" · "+p.cim_n_comparables+
          " comparables · "+p.cim_n_parcelles+
          " parcelles distinctes · "+p.cim_periode;
      popup.append(details);
      polygon.bindPopup(popup);
      polygon.on("click",()=>{
        if(chosen)overlay.resetStyle(chosen);
        chosen=polygon;
        polygon.setStyle({weight:3,color:"#0A3A8F",fillOpacity:.52});
        polygon.bringToFront();
      });
    }
  }).addTo(map);
  const panel=L.control({position:"topleft"});
  panel.onAdd=()=>{
    const div=L.DomUtil.create("div","cim-quartier-prices");
    div.style.cssText="background:#fff;padding:10px 13px;border-radius:8px;box-shadow:0 2px 12px #0003;font:12px system-ui;max-width:330px";
    const heading=document.createElement("strong");
    heading.textContent="Prix immobiliers par quartier · Marseille";
    div.append(heading);
    const grad=document.createElement("div");
    grad.style.cssText="height:11px;margin:9px 0 5px;border-radius:4px;background:linear-gradient(90deg,#15966C,#65C044,#F0DB35,#F39A35,#DC514D)";
    div.append(grad);
    const bounds=document.createElement("div");
    bounds.textContent="Vert : prix plus faibles · Rouge : prix plus élevés";
    div.append(bounds);
    const sub=document.createElement("div");
    const shown=data.features.filter(f=>f.properties.cim_mediane_m2!=null).length;
    sub.style.cssText="font-size:11px;color:#506079;margin-top:5px";
    sub.textContent=shown+"/111 quartiers documentés · Comparables calculés, pas tension du marché";
    div.append(sub);
    const toggle=document.createElement("label");
    toggle.style.cssText="display:flex;gap:7px;align-items:center;margin-top:8px";
    const checkbox=document.createElement("input");
    checkbox.type="checkbox";checkbox.checked=true;
    checkbox.addEventListener("change",()=>{
      if(checkbox.checked)overlay.addTo(map);
      else map.removeLayer(overlay);
    });
    toggle.append(checkbox,document.createTextNode("Afficher les quartiers colorés"));
    div.append(toggle);
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    window.CIMQuartiersLayer=overlay;
    window.CIMQuartiersCount=shown;
    return div;
  };
  panel.addTo(map);
}
if(window.CIMMap)init().catch(console.error);
else window.addEventListener("cim:ready",()=>init().catch(console.error),{once:true});
})();
