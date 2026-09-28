import { Link } from "react-router";
import { useCategories } from "@/api/public";
import { plural } from "@/lib/format";
import { useMeta } from "@/lib/meta";

export default function About() {
  useMeta({
    title: "À propos",
    description: "Braise : des recettes que l'on refait, écrites avec soin, et une option Diététique allégée pour de vrai.",
  });
  const categories = useCategories();
  const total = categories.data?.reduce((sum, c) => sum + c.recipe_count, 0);

  return (
    <>
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <p className="label">À propos</p>
          <h1 className="serif display" style={{ margin: ".4em 0 0", maxWidth: "11ch" }}>
            Prendre le temps de faire.
          </h1>
        </div>
      </section>
      <section className="section">
        <div className="wrap grid">
          <div style={{ gridColumn: "1 / -1" }} className="lg:[grid-column:2/9]">
            <div className="prose">
              <p className="lede" style={{ fontSize: 24 }}>
                Braise est né d'un carnet : des recettes notées au dos d'enveloppes, refaites jusqu'à ce qu'elles tiennent
                sans y penser.
              </p>
              <p>
                On n'y trouve pas de tendances ni de raccourcis. Chaque recette a été cuisinée plusieurs fois, dans une
                cuisine ordinaire, avec des ingrédients qu'on trouve au marché. Quand un geste compte, on explique
                pourquoi : c'est ce qui permet de le refaire sans la recette.
                {total ? ` Le carnet compte aujourd'hui ${plural(total, "recette")}.` : ""}
              </p>

              <h2 className="serif h3" id="methode">
                Notre méthode
              </h2>
              <p>
                Les quantités sont données pour le nombre de portions indiqué ; le sélecteur de portions les recalcule
                pour vous. Les temps comprennent la préparation et la cuisson, repos compris quand il est indispensable.
              </p>
              <p>
                Les valeurs nutritionnelles sont calculées par portion à partir des ingrédients, puis vérifiées : les
                calories annoncées doivent correspondre aux protéines, glucides et lipides à quinze pour cent près.
              </p>

              <h2 className="serif h3">L'option Diététique</h2>
              <p>
                Une recette marquée Diététique est allégée pour de vrai : moins de matières grasses ajoutées, pas de crème
                ni de beurre là où ils ne sont pas indispensables, des portions honnêtes. Elle reste une recette qu'on a
                envie de refaire, pas une version punitive.
              </p>
              <p>
                <Link to="/recettes?dietetic=true">Voir les recettes diététiques</Link>
              </p>

            </div>
          </div>
        </div>
      </section>
    </>
  );
}
