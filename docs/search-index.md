# Index global de recherche du BLOG

Schéma `blog-search-v1`, produit par `tools/build_search_index.py`.

Génération depuis tous les fichiers HTML du dépôt.
Exclusion des pages `noindex` et des pages sans titre.
Aucun enrichissement BAN, DVF ou CIM Data.

Champs : `u` URL, `t` title, `d` description,
`h1/h2/h3` titres réels, `c` canonical,
`n` métadonnées normalisées,
`b` texte visible normalisé pour les recherches globales.

Normalisation : Unicode NFKD, suppression des accents,
minuscules, ponctuation convertie en espaces.

Les voies, adresses et thèmes ne sont retrouvés que lorsqu'ils
existent réellement dans le contenu des pages. Aucun tag
géographique ou sémantique n'est inventé.

La recherche de phrase utilise les champs normalisés.
Le classement définitif, l'autocomplétion, le clavier,
le tactile et l'interface ne sont pas inclus dans ce lot.

La réexécution du générateur doit produire exactement
les mêmes octets à corpus inchangé.
