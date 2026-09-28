"""Les recettes de démo : 5 catégories, 2 recettes chacune dont une diététique.

Quantités pour le nombre de portions indiqué. Macros par portion, calculées à partir des
ingrédients (moins de 5 % d'écart avec 4P + 4G + 9L).
"""

from dataclasses import dataclass

NBSP = " "

CATEGORIES = [
    ("Entrées", "entrees"),
    ("Plats", "plats"),
    ("Pâtisserie", "patisserie"),
    ("Pains", "pains"),
    ("Apéritif", "aperitif"),
]


@dataclass
class SeedRecipe:
    title: str
    category: str
    description: str
    prep_time_minutes: int
    servings: int
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    ingredients: list[tuple[str, float | None, str]]
    steps: list[str]
    is_dietetic: bool = False
    is_featured: bool = False
    published_days_ago: int = 1
    # image générée : dégradé (base, b, c, d, hero) et teinte
    image_variant: str = "base"
    image_tint: str = "none"
    alt: str = ""


def _t(text: str) -> str:
    """Ajoute les espaces insécables (avant : ; ? ! et entre un nombre et son unité)."""
    for mark in (" :", " ;", " ?", " !", " °C", " cm", " %"):
        text = text.replace(mark, NBSP + mark[1:])
    return text


RECIPES: list[SeedRecipe] = [
    SeedRecipe(
        title="Bouillon de champignons et sarrasin grillé",
        category="entrees",
        description=_t(
            "Un bouillon limpide, profond comme un jus de viande, sans une once de viande. "
            "Le sarrasin grillé apporte le croquant, l'œuf mollet la douceur."
        ),
        prep_time_minutes=50,
        servings=4,
        calories=310,
        protein_g=17,
        carbs_g=40,
        fat_g=10,
        is_dietetic=True,
        is_featured=True,
        published_days_ago=2,
        image_variant="hero",
        image_tint="ocre",
        ingredients=[
            ("Champignons de Paris", 400, "G"),
            ("Shiitakés séchés", 20, "G"),
            ("Sarrasin décortiqué", 140, "G"),
            ("Oignon jaune", 1, "UNIT"),
            ("Poireau", 1, "UNIT"),
            ("Gousses d'ail", 2, "UNIT"),
            ("Huile d'olive", 1, "TBSP"),
            ("Sauce soja", 2, "TBSP"),
            ("Branches de thym", 4, "UNIT"),
            ("Eau", 1.5, "L"),
            ("Œufs", 4, "UNIT"),
            ("Pousses d'épinards", 80, "G"),
            ("Ciboulette", 10, "G"),
        ],
        steps=[
            "Réhydratez les shiitakés vingt minutes dans 30 cl de l'eau, chaude. Gardez l'eau de trempage : "
            "c'est elle qui donnera sa profondeur au bouillon.",
            "Émincez l'oignon, le poireau et l'ail. Faites-les suer dans l'huile d'olive à feu doux, dix minutes, "
            "sans coloration : ils doivent devenir fondants et translucides.",
            "Ajoutez les champignons de Paris coupés en quartiers et montez le feu. Laissez-les rendre leur eau, "
            "puis dorer franchement : la couleur, ici, c'est le goût.",
            "Versez le reste de l'eau, l'eau de trempage filtrée, les shiitakés émincés et le thym. Laissez frémir "
            "vingt-cinq minutes à couvert, puis assaisonnez avec la sauce soja.",
            "Pendant ce temps, torréfiez le sarrasin à sec dans une poêle, en remuant, jusqu'à ce qu'il sente la "
            "noisette. Faites-le cuire douze minutes à l'eau salée, puis égouttez.",
            "Plongez les œufs six minutes dans l'eau bouillante, puis dans l'eau glacée. Répartissez le sarrasin et "
            "les pousses d'épinards dans des bols chauds, versez le bouillon brûlant, posez l'œuf écalé et coupé "
            "en deux, parsemez de ciboulette.",
        ],
    ),
    SeedRecipe(
        title="Poireaux vinaigrette, œufs mimosa et noisettes",
        category="entrees",
        description=_t(
            "Le classique des bistrots, traité avec égard : des poireaux fondants jusqu'au cœur, "
            "une vinaigrette nette, et des noisettes pour le relief."
        ),
        prep_time_minutes=35,
        servings=4,
        calories=330,
        protein_g=10,
        carbs_g=17,
        fat_g=25,
        published_days_ago=28,
        image_variant="d",
        image_tint="olive",
        ingredients=[
            ("Petits poireaux", 8, "UNIT"),
            ("Œufs", 4, "UNIT"),
            ("Noisettes", 40, "G"),
            ("Échalote", 1, "UNIT"),
            ("Moutarde de Dijon", 1, "TBSP"),
            ("Vinaigre de xérès", 1, "TBSP"),
            ("Huile de colza", 4, "TBSP"),
            ("Ciboulette", 10, "G"),
            ("Fleur de sel", 1, "PINCH"),
        ],
        steps=[
            "Fendez les poireaux sur la longueur jusqu'à mi-hauteur et rincez-les sous l'eau en écartant les "
            "feuilles : la terre se cache toujours au cœur. Ficelez-les en botte.",
            "Plongez-les dans une grande casserole d'eau bouillante salée, quinze à dix-huit minutes. La pointe "
            "d'un couteau doit s'y enfoncer sans résistance. Égouttez-les longuement, tête en bas.",
            "Faites durcir les œufs dix minutes, refroidissez-les et écalez-les. Hachez finement les blancs, "
            "passez les jaunes au tamis.",
            "Torréfiez les noisettes à sec, frottez-les dans un torchon pour ôter la peau, puis concassez-les "
            "grossièrement.",
            "Fouettez la moutarde, le vinaigre et l'échalote ciselée, puis versez l'huile en filet. Nappez les "
            "poireaux encore tièdes : ils boivent mieux la vinaigrette. Finissez avec les œufs, les noisettes, "
            "la ciboulette et la fleur de sel.",
        ],
    ),
    SeedRecipe(
        title="Poulet rôti au citron confit et aux olives",
        category="plats",
        description=_t(
            "Une volaille entière, une heure de four, et le jus qui fait tout. "
            "On la sert au plat, avec du pain pour saucer."
        ),
        prep_time_minutes=90,
        servings=4,
        calories=512,
        protein_g=46,
        carbs_g=5,
        fat_g=34,
        published_days_ago=15,
        image_variant="base",
        image_tint="accent",
        ingredients=[
            ("Poulet fermier", 1.6, "KG"),
            ("Citrons confits", 2, "UNIT"),
            ("Olives vertes dénoyautées", 120, "G"),
            ("Gousses d'ail en chemise", 4, "UNIT"),
            ("Huile d'olive", 3, "TBSP"),
            ("Beurre demi-sel", 30, "G"),
            ("Bouillon de volaille", 200, "ML"),
            ("Thym séché", 1, "PINCH"),
        ],
        steps=[
            "Sortez le poulet une heure avant. Séchez la peau avec soin, salez-la généreusement et laissez-la "
            "reposer à l'air : c'est ce qui la rendra craquante.",
            "Préchauffez le four à 220 °C. Coupez les citrons confits en quartiers, retirez la pulpe et taillez "
            "l'écorce en lanières fines.",
            "Glissez le beurre et la moitié des lanières de citron sous la peau des blancs. Frottez l'ensemble "
            "d'huile, disposez l'ail et le thym dans le plat.",
            "Enfournez 20 minutes, puis baissez à 180 °C. Ajoutez le bouillon, les olives et le reste de citron. "
            "Poursuivez 55 minutes en arrosant deux fois.",
            "Laissez reposer un quart d'heure hors du four, couvert lâchement. Découpez au plat et nappez du jus, "
            "sans le dégraisser entièrement.",
        ],
    ),
    SeedRecipe(
        title="Risotto au potimarron, sauge frite",
        category="plats",
        description=_t(
            "Un risotto sans beurre ni crème : c'est le potimarron, écrasé au dernier moment, qui fait le liant. "
            "La sauge frite apporte le craquant et le parfum."
        ),
        prep_time_minutes=45,
        servings=4,
        calories=390,
        protein_g=10.5,
        carbs_g=67,
        fat_g=8.5,
        is_dietetic=True,
        published_days_ago=8,
        image_variant="b",
        image_tint="ocre",
        ingredients=[
            ("Riz arborio", 240, "G"),
            ("Potimarron", 600, "G"),
            ("Oignon jaune", 1, "UNIT"),
            ("Bouillon de légumes", 1.2, "L"),
            ("Vin blanc sec", 100, "ML"),
            ("Huile d'olive", 1, "TBSP"),
            ("Parmesan", 30, "G"),
            ("Fromage blanc 0 %", 60, "G"),
            ("Feuilles de sauge", 12, "UNIT"),
            ("Huile de pépins de raisin", 2, "TSP"),
        ],
        steps=[
            "Coupez le potimarron en deux, retirez les graines et taillez-le en dés de deux centimètres, avec la "
            "peau : elle fond à la cuisson. Mettez un tiers de côté ; faites cuire le reste vingt minutes à la "
            "vapeur, puis écrasez-le à la fourchette.",
            "Portez le bouillon à frémissement et gardez-le sur feu doux. Un bouillon froid casse la cuisson du riz "
            "à chaque louche.",
            "Faites suer l'oignon ciselé dans l'huile d'olive, ajoutez le riz et nacrez-le deux minutes en remuant : "
            "les grains deviennent translucides sur les bords. Déglacez au vin blanc et laissez-le s'évaporer.",
            "Ajoutez les dés de potimarron réservés, puis le bouillon louche après louche, en attendant chaque fois "
            "qu'il soit presque absorbé. Comptez dix-huit minutes : le riz doit rester légèrement ferme au centre.",
            "Pendant ce temps, faites frire les feuilles de sauge dans l'huile de pépins de raisin bien chaude, "
            "quelques secondes par face. Égouttez-les sur du papier : elles durcissent en refroidissant.",
            "Hors du feu, incorporez la purée de potimarron, le fromage blanc et le parmesan râpé. Couvrez deux "
            "minutes, puis servez aussitôt, la sauge posée dessus.",
        ],
    ),
    SeedRecipe(
        title="Tarte aux figues et miel de châtaignier",
        category="patisserie",
        description=_t(
            "Une pâte sablée à l'amande, une fine crème d'amande et des figues serrées comme des tuiles. "
            "Le miel de châtaignier, un peu amer, empêche l'ensemble de tourner à la confiserie."
        ),
        prep_time_minutes=80,
        servings=8,
        calories=460,
        protein_g=7.7,
        carbs_g=56,
        fat_g=24,
        published_days_ago=5,
        image_variant="base",
        image_tint="accent",
        ingredients=[
            ("Farine de blé T55", 200, "G"),
            ("Beurre doux", 150, "G"),
            ("Sucre glace", 60, "G"),
            ("Sucre blond", 50, "G"),
            ("Poudre d'amande", 110, "G"),
            ("Œufs", 2, "UNIT"),
            ("Figues fraîches", 600, "G"),
            ("Miel de châtaignier", 60, "G"),
            ("Fleur de sel", 1, "PINCH"),
            ("Branches de thym", 2, "UNIT"),
        ],
        steps=[
            "Sablez du bout des doigts la farine, 100 g de beurre froid en dés, le sucre glace, 30 g de poudre "
            "d'amande et la fleur de sel. Ajoutez un œuf, rassemblez sans pétrir, filmez et réservez une heure "
            "au froid.",
            "Étalez la pâte sur trois millimètres, foncez un cercle de 24 cm et piquez le fond. Remettez au froid "
            "vingt minutes : une pâte froide ne se rétracte pas à la cuisson.",
            "Faites cuire à blanc quinze minutes à 170 °C sous un papier lesté, puis cinq minutes à découvert, "
            "jusqu'à ce que le fond soit couleur sable.",
            "Fouettez le reste du beurre, pommade, avec le sucre blond, puis ajoutez 80 g de poudre d'amande et le "
            "second œuf. Étalez cette crème en couche fine sur le fond de tarte.",
            "Coupez les figues en quartiers et rangez-les serrées, pointe vers le haut. Enfournez trente-cinq "
            "minutes à 170 °C : la crème doit gonfler entre les fruits et prendre couleur.",
            "À la sortie du four, nappez de miel tiédi et parsemez de feuilles de thym. Laissez tiédir avant de "
            "découper : chaude, la crème s'effondre.",
        ],
    ),
    SeedRecipe(
        title="Poires pochées au thé fumé, fromage blanc vanillé",
        category="patisserie",
        description=_t(
            "Des poires pochées dans un thé fumé à peine miellé, qui prend en refroidissant des airs de sirop. "
            "Un dessert de fin d'automne, net et peu sucré."
        ),
        prep_time_minutes=40,
        servings=4,
        calories=210,
        protein_g=7,
        carbs_g=35,
        fat_g=5.7,
        is_dietetic=True,
        published_days_ago=23,
        image_variant="c",
        image_tint="olive",
        ingredients=[
            ("Poires Conférence", 4, "UNIT"),
            ("Thé lapsang souchong", 8, "G"),
            ("Eau", 1, "L"),
            ("Miel d'acacia", 40, "G"),
            ("Citron non traité", 1, "UNIT"),
            ("Étoiles de badiane", 2, "UNIT"),
            ("Fromage blanc 3 %", 300, "G"),
            ("Gousse de vanille", 1, "UNIT"),
            ("Cerneaux de noix", 20, "G"),
        ],
        steps=[
            "Portez l'eau à frémissement, retirez du feu et faites infuser le thé quatre minutes, pas davantage : "
            "au-delà, il devient âpre. Filtrez, puis ajoutez le miel, la badiane et le zeste du citron prélevé en "
            "larges bandes.",
            "Pelez les poires en gardant la queue et citronnez-les à mesure pour qu'elles ne noircissent pas. "
            "Plongez-les dans le thé frémissant, couvertes d'un disque de papier cuisson.",
            "Laissez pocher vingt à vingt-cinq minutes selon leur maturité : la lame d'un couteau doit entrer comme "
            "dans du beurre. Laissez-les refroidir dans leur liquide.",
            "Retirez les poires et faites réduire le liquide de moitié à feu vif, jusqu'à ce qu'il nappe la cuillère.",
            "Fendez la gousse de vanille, grattez les graines dans le fromage blanc et fouettez-le. Servez chaque "
            "poire sur une cuillerée de fromage blanc, arrosée de sirop et parsemée de noix concassées.",
        ],
    ),
    SeedRecipe(
        title="Pain au levain de seigle",
        category="pains",
        description=_t(
            "Une miche dense et acidulée, sans matière grasse ni sucre, qui se garde une semaine. "
            "Il lui faut une journée, dont vingt minutes de travail."
        ),
        prep_time_minutes=24 * 60,
        servings=12,
        calories=160,
        protein_g=4.5,
        carbs_g=33.5,
        fat_g=0.8,
        is_dietetic=True,
        published_days_ago=11,
        image_variant="c",
        image_tint="none",
        ingredients=[
            ("Farine de seigle T130", 400, "G"),
            ("Farine de blé T80", 100, "G"),
            ("Levain de seigle actif", 150, "G"),
            ("Eau tiède", 380, "ML"),
            ("Sel fin", 10, "G"),
            ("Graines de carvi", 1, "TSP"),
        ],
        steps=[
            "La veille au soir, rafraîchissez votre levain pour qu'il soit à son pic le lendemain matin : bombé, "
            "criblé de bulles, avec une odeur franche de yaourt.",
            "Mélangez les farines, l'eau tiède et le levain jusqu'à obtenir une pâte collante, presque une boue. "
            "N'ajoutez pas de farine : le seigle ne forme pas de réseau, il n'a rien à gagner au pétrissage.",
            "Incorporez le sel et le carvi, couvrez et laissez fermenter trois heures à température ambiante. "
            "La pâte doit gonfler d'un tiers et se fissurer en surface.",
            "Les mains mouillées, façonnez une boule, déposez-la dans un banneton fariné de seigle et laissez lever "
            "encore une heure et demie, jusqu'à ce que la surface se craquelle.",
            "Préchauffez le four à 250 °C avec une cocotte en fonte. Retournez le pain dans la cocotte, couvrez, "
            "enfournez vingt minutes, puis poursuivez quarante minutes à 210 °C, à découvert.",
            "Laissez reposer le pain vingt-quatre heures, enveloppé dans un torchon, avant de le trancher. Le seigle "
            "finit de se structurer en refroidissant : coupé trop tôt, la mie colle au couteau.",
        ],
    ),
    SeedRecipe(
        title="Focaccia au romarin et fleur de sel",
        category="pains",
        description=_t(
            "Une pâte très hydratée, beaucoup d'huile d'olive et des alvéoles creusées du bout des doigts. "
            "Croustillante dessous, moelleuse au cœur."
        ),
        prep_time_minutes=240,
        servings=8,
        calories=310,
        protein_g=6.7,
        carbs_g=45,
        fat_g=11,
        published_days_ago=34,
        image_variant="d",
        image_tint="ocre",
        ingredients=[
            ("Farine de blé T65", 500, "G"),
            ("Eau tiède", 400, "ML"),
            ("Levure de boulanger fraîche", 10, "G"),
            ("Sel fin", 10, "G"),
            ("Huile d'olive", 6, "TBSP"),
            ("Branches de romarin", 3, "UNIT"),
            ("Fleur de sel", 1, "TSP"),
        ],
        steps=[
            "Délayez la levure dans l'eau tiède, versez sur la farine et mélangez jusqu'à ce qu'il ne reste plus "
            "de farine sèche. Laissez reposer vingt minutes : la pâte s'hydrate seule.",
            "Ajoutez le sel et deux cuillerées d'huile, puis travaillez la pâte à la main mouillée, en l'étirant et "
            "en la repliant sur elle-même, quatre fois à trente minutes d'intervalle.",
            "Couvrez et laissez lever une heure et demie, jusqu'à ce que la pâte ait doublé et tremble quand on "
            "bouge le bol.",
            "Huilez généreusement un plat de 30 × 40 cm, déposez-y la pâte et étirez-la doucement vers les coins. "
            "Si elle résiste, attendez dix minutes et recommencez.",
            "Arrosez du reste d'huile, puis enfoncez les doigts jusqu'au fond pour creuser des alvéoles. Piquez de "
            "romarin, parsemez de fleur de sel et laissez lever encore trente minutes.",
            "Enfournez vingt-deux minutes à 230 °C, jusqu'à ce que le dessus soit doré et le dessous sonne "
            "croustillant. Laissez tiédir sur une grille, jamais dans le plat.",
        ],
    ),
    SeedRecipe(
        title="Gougères au comté",
        category="aperitif",
        description=_t(
            "Des choux salés, creux et légers, qui sentent le comté affiné. "
            "On les sert tièdes, à peine sortis du four, avec un vin du Jura."
        ),
        prep_time_minutes=50,
        servings=6,
        calories=350,
        protein_g=13,
        carbs_g=20,
        fat_g=24.5,
        published_days_ago=19,
        image_variant="hero",
        image_tint="ocre",
        ingredients=[
            ("Eau", 125, "ML"),
            ("Lait entier", 125, "ML"),
            ("Beurre doux", 100, "G"),
            ("Farine de blé T55", 150, "G"),
            ("Œufs", 4, "UNIT"),
            ("Comté 18 mois", 120, "G"),
            ("Sel fin", 1, "TSP"),
            ("Noix de muscade", 1, "PINCH"),
        ],
        steps=[
            "Portez l'eau, le lait, le beurre en morceaux et le sel à ébullition. Dès que le beurre a fondu, "
            "retirez du feu et versez la farine d'un coup.",
            "Mélangez vivement à la spatule, puis remettez sur feu moyen deux minutes pour dessécher la pâte : "
            "elle doit se détacher des parois et laisser un léger film au fond.",
            "Hors du feu, incorporez les œufs un à un, en attendant que chacun soit absorbé. La pâte est prête "
            "quand elle retombe en ruban épais et forme un V au bout de la spatule.",
            "Ajoutez les trois quarts du comté râpé et la muscade. Dressez des boules de la taille d'une noix sur "
            "une plaque et parsemez du reste de fromage.",
            "Enfournez vingt-cinq minutes à 190 °C sans ouvrir la porte : un courant d'air, et les choux "
            "retombent. Ils sont cuits quand ils sonnent creux.",
        ],
    ),
    SeedRecipe(
        title="Rillettes de maquereau au fromage blanc",
        category="aperitif",
        description=_t(
            "Des rillettes vives, où le fromage blanc remplace le beurre. Citron, échalote, piment d'Espelette : "
            "de quoi tartiner sans s'alourdir avant le dîner."
        ),
        prep_time_minutes=20,
        servings=6,
        calories=120,
        protein_g=11.7,
        carbs_g=6.3,
        fat_g=5.7,
        is_dietetic=True,
        published_days_ago=41,
        image_variant="b",
        image_tint="olive",
        ingredients=[
            ("Maquereau au naturel, égoutté", 250, "G"),
            ("Fromage blanc 0 %", 150, "G"),
            ("Citron non traité", 1, "UNIT"),
            ("Échalote", 1, "UNIT"),
            ("Moutarde à l'ancienne", 1, "TSP"),
            ("Ciboulette", 15, "G"),
            ("Piment d'Espelette", 1, "PINCH"),
            ("Radis roses", 200, "G"),
            ("Concombre", 1, "UNIT"),
            ("Endives", 2, "UNIT"),
        ],
        steps=[
            "Égouttez le maquereau, retirez la peau et l'arête centrale, puis effeuillez la chair à la fourchette : "
            "gardez des morceaux, ce sont eux qui font la texture.",
            "Ciselez l'échalote très finement et laissez-la mariner cinq minutes dans le jus du citron : elle perd "
            "son piquant sans perdre son croquant.",
            "Mélangez le fromage blanc, la moutarde, l'échalote et son jus, le zeste du citron et la ciboulette "
            "ciselée. Incorporez le maquereau sans trop travailler.",
            "Assaisonnez de piment d'Espelette et de poivre, goûtez, rectifiez. Laissez reposer une demi-heure "
            "au frais : les saveurs se lient.",
            "Taillez le concombre en bâtonnets, coupez les radis en deux et effeuillez les endives. Servez les "
            "rillettes bien froides, entourées des crudités.",
        ],
    ),
]

for _recipe in RECIPES:
    _recipe.steps = [_t(step) for step in _recipe.steps]
    _recipe.ingredients = [(_t(name), qty, unit) for name, qty, unit in _recipe.ingredients]
