
(function(){
"use strict";

function init(){
  const sales = document.getElementById("showSales");
  const map = window.CIMMap;

  if(!sales || !map){
    console.warn("CIM Data : panneau latéral non disponible");
    return;
  }
  if(document.getElementById("cimLayersSidebar")) return;

  const panel = document.createElement("section");
  panel.id = "cimLayersSidebar";
  panel.className = "cim-layers-sidebar";

  const heading = document.createElement("strong");
  heading.textContent = "Lecture cartographique";
  panel.append(heading);

  const legend = document.createElement("div");
  legend.className = "cim-sidebar-gradient";
  panel.append(legend);

  const scale = document.createElement("div");
  scale.className = "cim-sidebar-scale";
  scale.textContent = "Prix au m² observés · quartiers de Marseille";
  panel.append(scale);

  const toggle = document.createElement("label");
  toggle.className = "cim-sidebar-toggle";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.setAttribute("aria-label", "Afficher les prix par quartier");

  const text = document.createElement("span");
  text.textContent = "Coloration des quartiers";

  toggle.append(checkbox,text);
  panel.append(toggle);

  const status = document.createElement("small");
  status.id = "cimLayersStatus";
  status.textContent = "Contours cadastraux visibles au zoom";
  panel.append(status);

  checkbox.addEventListener("change",()=>{
    const layer = window.CIMQuartiersLayer;
    if(!layer){
      status.textContent = "Couche des quartiers non encore disponible";
      checkbox.checked = true;
      return;
    }
    if(checkbox.checked) layer.addTo(map);
    else map.removeLayer(layer);
    status.textContent = checkbox.checked
      ? "Quartiers visibles · parcelles consultables au zoom"
      : "Quartiers masqués · parcelles toujours consultables";
  });

  const anchor = sales.closest("label") || sales.parentElement;
  if(!anchor || !anchor.parentElement){
    console.warn("CIM Data : emplacement des filtres non trouvé");
    return;
  }
  anchor.insertAdjacentElement("beforebegin",panel);

  fetch("quartiers-prix.json").then(response=>{
    if(!response.ok) throw new Error("Source indisponible");
    return response.json();
  }).then(data=>{
    const values = data.metadata?.seuils_eur_m2;
    const n = data.features?.filter(feature=>
      feature.properties?.cim_mediane_m2 != null
    ).length;
    if(Array.isArray(values) && values.length===4){
      const format = n=>Math.round(n).toLocaleString("fr-FR");
      scale.textContent =
        "Seuils : "+values.map(format).join(" · ")+" €/m²";
    }
    if(Number.isFinite(n)){
      status.textContent = n+" quartiers documentés sur 111";
    }
  }).catch(()=>{
    status.textContent = "Couche des prix à vérifier";
  });

  // Masquer uniquement les anciennes fenêtres explicatives
  // Leaflet, jamais le conteneur de la carte.
  function hideObsoleteControls(){
    document.querySelectorAll(".leaflet-control").forEach(el=>{
      const text=(el.textContent||"").trim();
      if(text.includes("Boulevard Chave") &&
         text.includes("données historiques DVF")){
        el.style.display="none";
      }
    });
  }

  hideObsoleteControls();
  window.addEventListener("cim:ready",hideObsoleteControls);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",init,{once:true});
}else{
  init();
}
})();
