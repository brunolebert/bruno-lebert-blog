
async function loadCimPilotData(){
  async function load(path){
    const response = await fetch(path);
    if(!response.ok) throw new Error(path+" : HTTP "+response.status);
    const doc = await response.json();
    if(!Array.isArray(doc.fields) || !Array.isArray(doc.rows))
      throw new Error("Format incompatible : "+path);
    return doc.rows.map(row => Object.fromEntries(
      doc.fields.map((key,index) => [key,row[index]])
    ));
  }

  const [ban,comparables,dvf] = await Promise.all([
    load("runtime/ban/13205/boulevard-chave.json"),
    load("runtime/estimation/13205/boulevard-chave.json"),
    load("runtime/dvf/13205/chave.json")
  ]);

  const addresses = new Map();
  for(const a of ban){
    const key = String(a.numero ?? "").trim();
    const latitude = Number(a.lat);
    const longitude = Number(a.lon);
    if(!key || !Number.isFinite(latitude) ||
       !Number.isFinite(longitude)) continue;
    if(addresses.has(key)) continue;
    addresses.set(key,{
      key,numero:key,suffixe:"",
      label:key+" Boulevard Chave",
      latitude,longitude,
      code_postal:String(a.code_postal||"13005"),
      mutations:[],nb_mutations:0,
      median_ratio_m2:null,
      latest_date:null,latest_value:null,
      cad_parcelles:a.cad_parcelles||""
    });
  }

  function quantile(values,q){
    const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!v.length) return null;
    const p=(v.length-1)*q;
    const low=Math.floor(p),high=Math.ceil(p);
    return v[low]+(v[high]-v[low])*(p-low);
  }

  const mutations=[];
  const yearlyValues={};
  const allRatios=[];
  let geolocated=0;

  comparables.forEach((record,index)=>{
    const number=String(record.numero_voie??"").trim();
    const address=addresses.get(number);
    const date=String(record.date_mutation||"");
    const year=Number(record.annee) || Number(date.slice(0,4));
    const ratio=Number(record.prix_m2);
    const value=Number(record.valeur_eur);
    const surface=Number(record.surface_m2);
    const validRatio=Number.isFinite(ratio) && ratio>0;
    const type=String(record.type_local||"").trim();

    const item={
      key:"comparable-"+index,
      year, id_mutation:"",
      date,
      nature_mutation:"Comparable calculé",
      value:Number.isFinite(value)&&value>0 ? value:null,
      numero:number,suffixe:"",
      voie:"Boulevard Chave",
      code_postal:"13005",
      code_commune:"13205",
      commune:"Marseille 5e",
      longitude:address?.longitude??null,
      latitude:address?.latitude??null,
      parcelles:record.parcelle_key ? [record.parcelle_key] : [],
      locaux:[{
        type:type||"Local",
        surface:Number.isFinite(surface)&&surface>0 ? surface:null,
        pieces:null
      }],
      simple:validRatio,
      simple_type:type,
      simple_surface:Number.isFinite(surface)&&surface>0 ? surface:null,
      simple_rooms:null,
      ratio_m2:validRatio ? ratio:null,
      nb_lignes_dvf:null,
      classification:"CALCULATED",
      quality:record.qualite||null
    };

    mutations.push(item);
    if(address){
      address.mutations.push(item.key);
      address.nb_mutations++;
      if(!address.latest_date || date>address.latest_date){
        address.latest_date=date;
        address.latest_value=item.value;
      }
      geolocated++;
    }
    if(validRatio){
      allRatios.push(ratio);
      if(Number.isFinite(year)){
        (yearlyValues[year] ||= []).push(ratio);
      }
    }
  });

  for(const address of addresses.values()){
    const ratios=address.mutations.map(key=>{
      const m=mutations.find(x=>x.key===key);
      return m?.ratio_m2;
    }).filter(Number.isFinite);
    address.median_ratio_m2=quantile(ratios,.5);
  }

  const yearly={};
  for(const [year,values] of Object.entries(yearlyValues)){
    yearly[year]={
      median_m2:quantile(values,.5),
      mutations:values.length,
      count:values.length,
      n:values.length
    };
  }

  const list=[...addresses.values()].sort(
    (a,b)=>a.key.localeCompare(b.key,"fr",{numeric:true})
  );
  const reference=addresses.get("194")||list[0];
  if(!reference) throw new Error("Aucune adresse BAN géolocalisée");

  const stats={
    mutations_total:mutations.length,
    mutations_simples:allRatios.length,
    adresses_geolocalisees:list.length,
    median_m2:quantile(allRatios,.5),
    q1_m2:quantile(allRatios,.25),
    q3_m2:quantile(allRatios,.75),
    yearly
  };

  return {
    statut:"INTEGRATION_LOCALE_NON_CERTIFIEE",
    source:"CIM Data — comparables calculés, BAN et DVF",
    street:{name:"Boulevard Chave",city:"Marseille",stats},
    mutations,
    addresses:list,
    iris_context:[],
    reference_194:{address:reference,mutation:null},
    runtime_counts:{
      ban:ban.length,
      dvf_rows:dvf.length,
      estimation:comparables.length,
      comparables_geolocalises:geolocated
    }
  };
}
