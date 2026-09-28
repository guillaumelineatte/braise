# Design system de Braise

L'idée : que le site ressemble à un beau livre de cuisine. Typo éditoriale, beaucoup de blanc,
des grandes images, des animations lentes. Pas de déco pour la déco.

La référence c'est `design/prototype.html`. Tokens, proportions, composants, animations : tout
est dedans. Si on hésite sur un détail visuel, on regarde le prototype.

---

## 1. Principes

- Titres en Fraunces, texte en Inter, des filets plutôt que des boîtes. Pas d'ombres pour
  décorer, pas de coins très arrondis, pas de dégradés flashy.
- Rien en dur : recettes, catégories et compteurs viennent de l'API.
- Une seule couleur d'accent, la terre cuite (`--accent`), pour les actions et l'état actif.
  L'olive est réservée à Diététique, l'ocre à la nutrition.
- Animations lentes (300 à 700 ms, courbe `--ease`), masques pour faire apparaître le texte.
  Tout se coupe avec `prefers-reduced-motion`.
- Accessibilité : contrastes AA, focus visible, tout marche au clavier.

---

## 2. Tokens

Ce sont des variables CSS sur `:root` (dans `frontend/src/styles/tokens.css`). Tailwind n'a
accès qu'à ces valeurs, ses couleurs, ombres et rayons par défaut sont désactivés
(`frontend/tailwind.config.ts`).

### Couleurs

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `--bg` | `#F6F1E8` | `#171412` | fond de page |
| `--surface` | `#EFE8DB` | `#1F1B18` | encarts (nutrition), survols, fond d'admin |
| `--surface-2` | `#E8DFCE` | `#28231F` | squelettes, états pressés |
| `--ink` | `#1C1714` | `#EDE6DA` | texte principal |
| `--ink-2` | `#5A514A` | `#A89E92` | texte secondaire, libellés, méta |
| `--ink-3` | `#8A7F75` | `#77706A` | décor et gros textes seulement (voir §7) |
| `--accent` | `#B4552D` | `#D07A52` | action, état actif, focus, le i du logo |
| `--accent-hover` | `#9A4724` | `#E08B63` | survol de l'accent |
| `--accent-text` | `#9A4724` | `#D07A52` | accent en petit texte (pour le contraste AA) |
| `--ocre` | `#C9A24A` | `#D2AD5A` | glucides (nutrition) |
| `--olive` | `#6F7A4B` | `#8A9560` | Diététique, lipides, interrupteur actif |
| `--line` | ink à 10 % | ink à 10 % | filets |
| `--line-strong` | ink à 22 % | ink à 22 % | contours de champs, boutons |
| `--photo-a…d` | `#D9C9AE` → `#5E4B36` | `#4A3F35` → `#1F1A16` | fonds en attendant l'image |
| `--danger` | `#A1362B` | `#E0806F` | erreur bloquante (admin uniquement) |
| `--cream` | `#F6F1E8` | `#F6F1E8` | texte sur photo (hero), pareil dans les deux thèmes |

Le thème sombre suit `prefers-color-scheme`, sauf si on a choisi avec le bouton (gardé dans
`localStorage["braise-theme"]`, appliqué en `data-theme` sur `<html>`). Les tokens marchent aussi
sur n'importe quel `[data-theme]`, c'est ce qui permet de voir les deux thèmes côte à côte sur `/dev/components`.

### Typographie

| Rôle | Police | Taille | Réglages |
|---|---|---|---|
| `display` | Fraunces | `clamp(54px, 8vw, 128px)` | opsz 144, SOFT 40, WONK 1 ; interlignage .95 ; approche −.03em |
| `h1` | Fraunces | `clamp(43px, 5vw, 68px)` | idem |
| `h2` | Fraunces | `clamp(34px, 3.6vw, 54px)` | souvent en italique 300 |
| `h3` | Fraunces | `27px` | approche −.02em, interlignage 1.05 |
| `h4` | Fraunces | `21px` | opsz 40, approche −.015em |
| `lede` | Fraunces italique 300 | `21px` | opsz 30, SOFT 60 ; `--ink-2` |
| corps | Inter | `17px` / 1.6 | |
| `small`, `meta` | Inter | `14px` | chiffres tabulaires pour la méta |
| `label` | Inter 500 | `11.5px` | capitales, approche .12em |
| `step` (texte d'étape) | Inter | `21px` / 1.55 (`18px` < 600 px, `27px` en mode cuisine) | |

Les chiffres qui s'alignent ou qui changent (quantités, portions, calories, compteurs) sont en
`tabular-nums`.

Polices auto-hébergées avec `@fontsource-variable/fraunces` (avec l'axe opsz) et `@fontsource-variable/inter`.

### Grille, espacements

- Conteneur `.wrap` : `max-width: 1440px`, marges `clamp(20px, 4vw, 72px)`.
- Grille de 12 colonnes, gouttière `24px`.
- Sections : `padding: clamp(72px, 10vw, 160px) 0`.
- Barre de navigation : 64 px, collante, flou d'arrière-plan, fond `--bg` à 82 %.

### Rayons, ombres

- Rayons : `2px` (boutons, champs, stepper), `4px` (photos, encarts, menus), `50 %` (pastilles).
- Une seule ombre, `--shadow` (`0 24px 64px -32px`), seulement pour ce qui flotte : menus, dialogs, panneaux.

### Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `--ease` | `cubic-bezier(.16, 1, .3, 1)` | toutes les transitions |
| `--t-1` | 300 ms | couleurs, survols |
| `--t-2` | 500 ms | fondus, soulignés, pastilles |
| `--t-3` | 700 ms | révélations (masque de texte, clip des images) |

- Texte : chaque ligne monte de `translateY(112%)` à 0, 80 ms de décalage entre les lignes.
- Images : `clip-path: inset(0 0 100% 0)` vers `inset(0)` quand elles entrent dans l'écran.
- Survol d'une photo : `scale(1.03)` en 700 ms.
- Quantités qui changent : le chiffre descend avec un fondu, 500 ms.
- Liens `.u` : le soulignement se dessine de gauche à droite, 500 ms.
- Scroll doux avec Lenis, seulement sur le site public.
- Avec `prefers-reduced-motion: reduce` : transitions à 150 ms, plus de translations ni de masques,
  pas de Lenis ni de curseur perso.

### Grain

Un bruit SVG par-dessus toute la page (`body::after`, 3,5 % en `multiply`, 5 % en `screen` en sombre).
Les images de démo générées par `app/seed.py` ont aussi un peu de grain.

---

## 3. Composants

Ils sont dans `frontend/src/components/`. En dev, `/dev/components` les affiche tous, en clair et
en sombre.

| Composant | Rôle | Notes |
|---|---|---|
| **Wordmark** | Bra*i*se, avec le i en accent | 26 px dans la navigation ; géant (`clamp(120px, 28vw, 420px)`) dans le pied de page, décalé vers le bas |
| **Label** | surtitre en capitales | 11.5 px, `--ink-2` |
| **DietMark** | marqueur Diététique | pastille olive de 6 px + libellé en capitales ; hérite de la couleur |
| **Photo** | image avec LQIP et révélation | fond LQIP flou, fondu de l'image nette, `srcset` 320/800/1600, `clip-path` à l'entrée ; aplat tonal si pas d'image |
| **Card** | carte de recette | photo, catégorie, titre serif, méta (temps, portions, Diététique) ; tailles `big` (h1), `medium` (h3) |
| **CategoryRow** | ligne de catégorie | nom serif géant, compteurs à droite, lien Diététique ; au survol : retrait, italique 300, vignette qui glisse |
| **Stepper** | − n + | 36 × 36, filet `--line-strong`, rayon 2 px ; bornes 1–24 |
| **NutritionBlock** | encart calories + macros | fond `--surface`, kcal en Fraunces 54 px, barre segmentée (protéines accent, glucides ocre, lipides olive) en part d'énergie |
| **Step** | étape cochable | numéro Fraunces italique 300 en `--ink-3`, texte 21 px, pastille à cocher accent |
| **Select** | menu déroulant personnalisé | bouton à trait inférieur, chevron qui pivote, liste flottante avec ombre, option active marquée d'un point accent ; clavier complet (flèches, Entrée, Échap, saisie rapide) |
| **Toggle** | interrupteur | 40 × 22, olive quand actif, `role="switch"` |
| **Button** | action | 36 px ; `primary` (encre, survol accent), `ghost` (filet), `quiet` (texte seul) |
| **Input / Textarea** | champ | trait inférieur seulement, 40 px, focus accent ; erreur sous le champ en `--danger` |
| **Skeleton** | chargement | aplat `--surface-2` qui respire (opacité), aux proportions du contenu attendu |
| **Dialog** | boîte flottante | fond `--bg`, filet, rayon 4, `--shadow` ; piège le focus, Échap ferme ; sert aussi à la confirmation de suppression |

### Composants ajoutés pour l'application

| Composant | Rôle | Notes |
|---|---|---|
| **Toast** | message éphémère | en bas à gauche, fond `--ink`, texte `--bg`, 14 px ; erreurs avec liseré `--danger` ; `role="status"` |
| **Drawer** | panneau latéral | filtres sur mobile, aperçu dans l'éditeur ; glisse depuis le bord, fond `--bg`, filet |
| **Combobox** | champ à suggestions | autocomplétion des ingrédients ; même liste flottante que Select ; flèches, Entrée, Échap |
| **Dropzone / Cropper** | image de recette | glisser-déposer, aperçu immédiat, recadrage au ratio 5/4 (glisser pour cadrer, curseur de zoom, flèches au clavier), barre de progression fine en accent |
| **SaveIndicator** | état de l'enregistrement | Enregistrement…, Enregistré il y a n s, ou l'erreur avec un lien pour réessayer ; 13 px `--ink-2` |
| **SectionNav** | sommaire de l'éditeur | liens d'ancre ; une pastille `--danger` signale une section incomplète |
| **Warn** | avertissement discret | trait accent de 16 px, texte 14 px, action à droite (ex. Corriger à 512) |
| **EmptyState** | liste vide | phrase rédigée en Fraunces italique, action secondaire |

### Mise en page publique

- **Hero** : pleine hauteur moins la navigation, photo en fond, voile dégradé bas → haut,
  titre en `display` révélé ligne par ligne (les lignes d'un titre dynamique sont mesurées après mise en page),
  méta séparée par des tirets fins, lien « Voir la recette » souligné.
- **Sélection** : titre `h2` italique 300 sur 7 colonnes, texte sur 4 ; une grande carte (4/5) sur 7 colonnes,
  deux moyennes (4/3) sur 5 colonnes, décalées vers le bas.
- **Dernières recettes** : trois colonnes (deux sous 840 px, une sous 600 px), photos aux proportions variées (4/5, 1/1, 5/4, 3/4, 4/3), colonne centrale abaissée.
- **Liste** : motif de 6 cartes (2 larges + 4 étroites), une colonne sur deux décalée de 64 px. Barre de filtres
  collante sous la navigation : recherche à trait inférieur, catégories en libellés (trait accent sous l'actif),
  option Diététique (pastille olive), temps et tri en menus personnalisés. Sous 1280 px, tout sauf la recherche
  passe dans un panneau latéral (« Filtres · n »).
- **Recette** : en-tête 7 + 5 colonnes (photo 5/4), ingrédients collants sur 4 colonnes, étapes sur 7 (640 px max),
  « À poursuivre » en trois cartes. La mise en page répond à des **requêtes de conteneur** (`.recipe`), pas à la
  largeur de la fenêtre : la même vue sert l'aperçu de l'éditeur, dans un panneau étroit.
- **Image partagée** : la photo d'une carte (et celle du hero) glisse jusqu'à l'en-tête de la recette (`layoutId`, 700 ms, `--ease`).
- **Mode cuisine** : navigation, pied de page et suggestions masqués, étapes en 27 px, barre discrète « Quitter le
  mode cuisine » ; l'écran reste allumé (Wake Lock), sinon un message invite à désactiver la mise en veille.

Attention : sur l'accueil et les pages recette, `frontend/index.html` dessine déjà la nav et la photo
(hero ou en-tête de recette) avant que React démarre, avec les mêmes classes. Si on modifie `.nav`, `.hero`
ou `.recipe-head`, il faut aussi modifier `index.html`, sinon ça saute au moment où React prend le relais.

### Administration

Mêmes tokens, mais plus dense et plus utilitaire : Inter partout, Fraunces seulement pour les titres
de page, sections de 24 px, tableaux avec des filets, lignes de 56 px. Fond `--surface`, panneaux en `--bg`
avec un filet.

L'éditeur suit le prototype : une barre collante en haut (titre, état de l'enregistrement, Aperçu,
Publier ou Retirer, Voir sur le site), le sommaire des sections à gauche (pastille vide = à compléter,
pastille `--danger` = ce qui a bloqué la publication), et un trait `--danger` à gauche des sections incomplètes.

---

## 4. Voix

On écrit comme si on expliquait à quelqu'un qui cuisine juste à côté.

- À l'impératif, en vouvoyant : « Séchez la peau avec soin, salez-la généreusement. »
- On dit pourquoi, en quelques mots : « … c'est ce qui la rendra craquante. »
- Des repères qu'on voit ou qu'on sent plutôt que juste des minutes : « jusqu'à ce qu'il sente la noisette ».
- Des phrases courtes. Pas de points d'exclamation, pas de superlatifs, pas d'emoji.
- Typo française : espace insécable avant `:` `;` `?` `!` et entre nombre et unité (`220 °C`, `24 cm`), guillemets « ».
- Descriptions en deux phrases, concrètes.
- Dans l'interface, on reste simple. Les états vides ont une vraie phrase (« Rien ne mijote sous ces critères. ») et les erreurs disent quoi faire.

---

## 5. Données et comportements

- Les quantités sont enregistrées pour le nombre de portions de la recette. Le recalcul se fait
  dans le navigateur (deux décimales max, avec une virgule).
- Unités : `UNIT` (sans unité affichée), `G` g, `KG` kg, `ML` ml, `L` L, `TBSP` c. à s., `TSP` c. à c., `PINCH` pincée(s).
- Durées : `45 min`, `1 h 30`, `24 h`.
- Nutrition : les calories sont comparées à `4P + 4G + 9L`. Avertissement au-dessus de 15 % d'écart,
  publication bloquée au-dessus de 40 %.

---

## 6. Accessibilité

- Focus : `outline: 1.5px solid var(--accent)` avec 4 px de décalage. On ne l'enlève jamais.
- Zones cliquables de 36 px minimum (les pastilles à cocher font 28 px mais la zone de clic est plus grande).
- Les menus faits maison suivent les patterns ARIA (listbox, combobox, switch, dialog).
- Mode cuisine : texte en 27 px, pas de nav, et l'écran reste allumé (Wake Lock, ou un message si le navigateur ne le gère pas).

## 7. Contraste

On garde les couleurs du prototype, mais on fait attention à où on les utilise pour rester en AA.

- `--ink-3` ne fait que 3,5:1 sur `--bg`. Donc seulement pour la déco (numéros d'étapes, poignées,
  filets, pastilles) et les textes de 24 px ou plus. Pour le petit texte on prend `--ink-2` (6,9:1).
  C'est pour ça que les compteurs de catégories, les unités, les labels de l'admin, les descriptions
  des interrupteurs et le colophon sont en `--ink-2` alors que le prototype les met en `--ink-3`.
- L'accent en petit texte (liens de 14 px, « Corriger à n ») utilise `--accent-text` (5,6:1 en clair)
  au lieu de `--accent` (4,4:1).
- Du texte sur une photo a toujours le dégradé sombre derrière (`hero-scrim`).
