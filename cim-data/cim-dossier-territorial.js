
(function(){
    "use strict";

    const ROOT="runtime/";
    const format=new Intl.NumberFormat("fr-FR",{
        maximumFractionDigits:0
    });

    let serial=0;
    let outline=null;
    let resources=null;

    function load(){
        if(!resources){
            resources=Promise.all([
                fetch(ROOT+"dossiers-territoriaux.json")
                    .then(r=>{
                        if(!r.ok)throw Error("Statistiques");
                        return r.json();
                    }),
                fetch(ROOT+"territoires-agregation-iris.geojson")
                    .then(r=>{
                        if(!r.ok)throw Error("Contours");
                        return r.json();
                    })
            ]).catch(e=>{
                resources=null;
                throw e;
            });
        }
        return resources;
    }

    function clear(){
        if(outline && window.CIMMap){
            window.CIMMap.removeLayer(outline);
        }
        outline=null;
        document.getElementById(
            "cimTerritoryMarket"
        )?.remove();
    }

    function element(tag,text,parent){
        const node=document.createElement(tag);
        node.textContent=text;
        if(parent)parent.appendChild(node);
        return node;
    }

    async function render(){
        const ticket=++serial;
        clear();

        const territory=window.CIMSelectedTerritory;

        if(!territory)return;

        const code=String(
            territory.code ?? territory
        );

        try{
            const [stats,geo]=await load();

            if(ticket!==serial)return;

            const current=window.CIMSelectedTerritory;

            if(!current ||
                String(current.code ?? current)!==code
            )return;

            const data=stats.territoires[code];

            if(!data)return;

            const host=document.getElementById(
                "cimTerritoryDossier"
            );

            if(!host)return;

            const section=element("section","",host);
            section.id="cimTerritoryMarket";

            element("h3","Marché immobilier",section);

            element(
                "p",
                "Transactions DVF · "+data.periode,
                section
            );

            for(const kind of ["Appartement","Maison"]){
                const s=data.types[kind];
                const block=element("div","",section);

                block.className="cim-territory-market-type";

                element("h4",kind,block);

                if(!s.observations){
                    element(
                        "p",
                        "Aucune observation qualifiée disponible.",
                        block
                    );
                    continue;
                }

                const price=element(
                    "strong",
                    format.format(s.mediane)+" €/m²",
                    block
                );

                price.className="cim-territory-market-price";

                if(s.observations===1){
                    element(
                        "p",
                        "Transaction unique : aucune fourchette de marché calculable.",
                        block
                    );
                }else{
                    element(
                        "p",
                        "Fourchette centrale : "+
                        format.format(s.q1)+" – "+
                        format.format(s.q3)+" €/m²",
                        block
                    );
                }

                element(
                    "p",
                    format.format(s.observations)+
                    " observation(s)",
                    block
                );

                if(s.statut==="FAIBLE_EFFECTIF"){
                    element(
                        "small",
                        "Échantillon limité : résultat indicatif.",
                        block
                    );
                }
            }

            element(
                "small",
                "Observations qualifiées non exhaustives. "+
                "Ces statistiques ne constituent pas "+
                "une estimation personnalisée.",
                section
            );

            const feature=geo.features.find(
                f=>String(f.properties.code)===code
            );

            if(feature && window.CIMMap && window.L){
                outline=L.geoJSON(feature,{
                    interactive:false,
                    style:{
                        color:"#0A3A8F",
                        weight:2,
                        opacity:0.85,
                        fillOpacity:0.035
                    }
                }).addTo(window.CIMMap);

                outline.bringToBack();

                element(
                    "small",
                    "Contour territorial issu de "+
                    "l’agrégation des IRIS.",
                    section
                );
            }

        }catch(error){
            if(ticket!==serial)return;

            const host=document.getElementById(
                "cimTerritoryDossier"
            );

            if(host){
                const section=element(
                    "section",
                    "Données territoriales temporairement indisponibles.",
                    host
                );

                section.id="cimTerritoryMarket";
            }

            console.warn(
                "CIM Data : dossier territorial indisponible"
            );
        }
    }

    window.addEventListener(
        "cim:territory-selected",
        ()=>requestAnimationFrame(render)
    );

    function resetAddress(){
        ++serial;
        clear();
    }

    window.addEventListener(
        "cim:address-selected",resetAddress
    );

    document.addEventListener(
        "cim:address-selected",resetAddress
    );

})();
