import { Link } from "react-router";
import { useDashboard } from "@/api/admin";
import { errorMessage } from "@/api/client";
import { RecipeRowLink } from "@/components/admin/RecipeRowLink";
import { ButtonLink } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";
import { plural } from "@/lib/format";

export default function Dashboard() {
  const { data, isPending, error } = useDashboard();

  const counters = [
    { label: "Publiées", value: data?.published_count, to: "/admin/recipes?status=published" },
    { label: "Brouillons", value: data?.draft_count, to: "/admin/recipes?status=draft" },
    { label: "Catégories", value: data?.category_count, to: "/admin/categories" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="serif">Tableau de bord</h1>
          <p>{data ? `${plural(data.published_count + data.draft_count, "recette")} au total.` : " "}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ButtonLink to="/admin/categories">Gérer les catégories</ButtonLink>
          <ButtonLink to="/admin/recipes/new" variant="primary">
            Nouvelle recette
          </ButtonLink>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {errorMessage(error)}
        </p>
      )}

      <div className="counters">
        {counters.map((counter) => (
          <Link key={counter.label} to={counter.to} className="counter">
            <span className="label">{counter.label}</span>
            <span className="n">{isPending ? <Skeleton line style={{ width: 64, height: 48 }} /> : counter.value}</span>
          </Link>
        ))}
      </div>

      <div className="dash-grid">
        <section className="panel" aria-labelledby="recent-title">
          <div className="panel-head">
            <h2 className="label" id="recent-title">
              Dernières modifications
            </h2>
            <Link to="/admin/recipes" className="small u">
              Toutes les recettes
            </Link>
          </div>
          <ul className="rows">
            {isPending
              ? Array.from({ length: 5 }, (_, i) => (
                  <li key={i} style={{ padding: "16px 24px" }}>
                    <Skeleton line style={{ width: `${50 + i * 8}%` }} />
                  </li>
                ))
              : data?.recent.map((recipe) => (
                  <li key={recipe.id}>
                    <RecipeRowLink recipe={recipe} />
                  </li>
                ))}
          </ul>
          {data && data.recent.length === 0 && <p className="empty-row">Aucune recette pour l'instant : commencez par la première.</p>}
        </section>

        <section className="panel" aria-labelledby="drafts-title">
          <div className="panel-head">
            <h2 className="label" id="drafts-title">
              Brouillons en attente
            </h2>
            <Link to="/admin/recipes?status=draft" className="small u">
              Tous les brouillons
            </Link>
          </div>
          <ul className="rows">
            {data?.drafts.map((recipe) => (
              <li key={recipe.id}>
                <RecipeRowLink recipe={recipe} />
              </li>
            ))}
          </ul>
          {data && data.drafts.length === 0 && <p className="empty-row">Aucun brouillon en attente. Tout ce qui est écrit est en ligne.</p>}
        </section>
      </div>
    </>
  );
}
