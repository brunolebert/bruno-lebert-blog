#!/usr/bin/env python3
"""Moteur exploratoire CIM Data. Aucune certification de mutation ou de prix."""
import argparse
import gzip
import json
import math
from pathlib import Path

def charger(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)

def distance(lat1, lon1, lat2, lon2):
    a = math.sin(math.radians(lat2-lat1)/2)**2
    a += (math.cos(math.radians(lat1))*math.cos(math.radians(lat2))
          * math.sin(math.radians(lon2-lon1)/2)**2)
    return 12742000 * math.asin(min(1, math.sqrt(max(0, a))))

def rechercher(base, repo, centres, rayon=150, surface_min=65,
              surface_max=80, pieces=3):
    if not centres or not 0 < rayon <= 2000:
        raise ValueError("CENTRE_OU_RAYON_INVALIDE")
    if not 0 < surface_min <= surface_max:
        raise ValueError("SURFACES_INVALIDES")
    if pieces is not None and pieces < 1:
        raise ValueError("PIECES_INVALIDES")

    dossier = base / "candidats-appartements-geographiques-v0"
    fichiers = sorted(dossier.glob("*.json.gz"))
    if len(fichiers) != 134:
        raise ValueError("INDEX_CANDIDATS_INCOMPLET")

    caches = {}
    candidats = []
    parcourus = 0
    proches = 0

    for fichier in fichiers:
        contenu = charger(fichier)
        code = str(contenu["commune"])
        localises = []

        for numero, categorie, lon, lat, composition in contenu["candidats"]:
            parcourus += 1
            d = min(distance(lat, lon, clat, clon) for clat, clon in centres)
            if d <= rayon:
                proches += 1
                localises.append((numero, categorie, lon, lat, d))

        if not localises:
            continue

        groupes = charger(base / "index-mutations-dvf-global-v0" / fichier.name)["groupes"]

        for numero, categorie, lon, lat, d in localises:
            g = groupes[numero]
            if g["categorie"] != categorie:
                raise ValueError("CATEGORIE_DIVERGENTE")
            appartements = []

            for shard, ligne in g["references"]:
                cle = (code, shard)
                if cle not in caches:
                    fichier_dvf = repo / "cim-data/runtime/dvf" / code / shard
                    brut = json.loads(fichier_dvf.read_text(encoding="utf-8"))
                    caches[cle] = (brut["fields"], brut["rows"])

                champs, lignes = caches[cle]
                valeurs = lignes[ligne]
                if len(champs) != len(valeurs):
                    raise ValueError("SCHEMA_DVF_INVALIDE")
                objet = dict(zip(champs, valeurs))
                if objet["type_local"] == "Appartement":
                    appartements.append(objet)

            if len(appartements) != 1:
                raise ValueError("APPARTEMENT_NON_UNIQUE")

            a = appartements[0]
            surface = float(a["surface_reelle_bati_num"])
            nb_pieces = float(a["nombre_pieces_principales"])

            if not surface_min <= surface <= surface_max:
                continue
            if pieces is not None and nb_pieces != pieces:
                continue

            candidats.append({
                "commune_dvf": code,
                "groupe_ordinal": numero,
                "date": str(g["cle"][0]),
                "voie": str(g["cle"][1]),
                "numero": str(g["cle"][2]),
                "latitude_ban": lat,
                "longitude_ban": lon,
                "distance_m": round(d, 1),
                "surface_batie_m2": surface,
                "pieces": nb_pieces,
                "categorie": categorie,
                "composition": g["composition"],
                "references_dvf": g["references"],
                "statut": "CANDIDAT_NON_CERTIFIE"
            })

    if parcourus != 49530:
        raise ValueError("TOTAL_GLOBAL_INATTENDU")

    candidats.sort(key=lambda x: (
        x["distance_m"], x["date"], x["commune_dvf"], x["groupe_ordinal"]
    ))

    return {
        "schema": "cim-comparables-exploratoire-v1",
        "statut": "NON_CERTIFIE",
        "centres_lat_lon": centres,
        "rayon_m": rayon,
        "surface_min_m2": surface_min,
        "surface_max_m2": surface_max,
        "pieces": pieces,
        "candidats_parcourus": parcourus,
        "candidats_dans_rayon": proches,
        "candidats_retenus": len(candidats),
        "resultats": candidats,
        "avertissement": (
            "Groupes DVF indicatifs, non assimilables à des mutations "
            "indépendantes certifiées. Positions BAN non cadastrales. "
            "Aucun prix individuel ni estimation certifié."
        )
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", required=True, type=Path)
    p.add_argument("--repo", required=True, type=Path)
    p.add_argument("--lat", required=True, type=float)
    p.add_argument("--lon", required=True, type=float)
    p.add_argument("--rayon", type=float, default=150)
    p.add_argument("--surface-min", type=float, default=65)
    p.add_argument("--surface-max", type=float, default=80)
    p.add_argument("--pieces", type=int, default=3)
    p.add_argument("--limite", type=int, default=10)
    args = p.parse_args()

    resultat = rechercher(
        args.base, args.repo, [(args.lat, args.lon)],
        args.rayon, args.surface_min, args.surface_max, args.pieces
    )
    resultat["resultats"] = resultat["resultats"][:max(0, args.limite)]
    print(json.dumps(resultat, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
