#!/usr/bin/env python3
"""Tests d'integration du moteur de comparables sur les index reels."""
import argparse
import importlib.util
from pathlib import Path

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--indices", type=Path, required=True)
    args = p.parse_args()

    engine = args.repo / "cim-data/tools/moteur_comparables_v1.py"
    spec = importlib.util.spec_from_file_location("cim_moteur", engine)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    tests = [
        ("CHAVE_194",
         [(43.295515, 5.397366), (43.295508, 5.397333)],
         150, 25),
        ("BRIFFAUT_23",
         [(43.294499, 5.397014)],
         163, 24)
    ]

    for name, centres, proches, retenus in tests:
        result = module.rechercher(args.indices, args.repo, centres)
        assert result["schema"] == "cim-comparables-exploratoire-v1"
        assert result["statut"] == "NON_CERTIFIE"
        assert result["candidats_parcourus"] == 49530
        assert result["candidats_dans_rayon"] == proches
        assert result["candidats_retenus"] == retenus
        assert len(result["resultats"]) == retenus

        for item in result["resultats"]:
            assert item["statut"] == "CANDIDAT_NON_CERTIFIE"
            assert item["references_dvf"]
            assert 0 <= item["distance_m"] <= 150
            assert 65 <= item["surface_batie_m2"] <= 80
            assert item["pieces"] == 3
            for shard, line in item["references_dvf"]:
                assert isinstance(shard, str) and isinstance(line, int)
                assert (args.repo / "cim-data/runtime/dvf" /
                        item["commune_dvf"] / shard).is_file()

        print(f"TEST_{name}=CONFORME|PROCHES={proches}|RETENUS={retenus}")

    # Rejet des configurations invalides avant interrogation.
    invalides = [
        ([], 150, 65, 80, 3),
        ([(43.295515, 5.397366)], 0, 65, 80, 3),
        ([(43.295515, 5.397366)], 150, 80, 65, 3),
        ([(43.295515, 5.397366)], 150, 65, 80, 0)
    ]
    for centres, rayon, mini, maxi, pieces in invalides:
        try:
            module.rechercher(
                args.indices, args.repo, centres,
                rayon, mini, maxi, pieces
            )
        except ValueError:
            continue
        raise AssertionError("PARAMETRE_INVALIDE_ACCEPTE")

    print("TEST_PARAMETRES_INVALIDES=4/4")
    print("VERDICT=TESTS_INTEGRATION_CONFORMES")

if __name__ == "__main__":
    main()
