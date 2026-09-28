import { Link } from "react-router";
import type { CategoryOut } from "@/api/schemas";
import { plural } from "@/lib/format";
import { Photo, toneFor } from "./Photo";

// une ligne de la liste des catégories de l'accueil (la photo apparaît au survol)
export function CategoryRow({ category }: { category: CategoryOut }) {
  const base = `/recettes?category=${encodeURIComponent(category.slug)}`;
  return (
    <div className="cat">
      <Link className="name" to={base}>
        {category.name}
      </Link>
      <span className="counts">
        <span className="count">{plural(category.recipe_count, "recette")}</span>
        {category.dietetic_count > 0 && (
          <Link
            className="diet"
            to={`${base}&dietetic=true`}
            aria-label={`${category.name}, ${plural(category.dietetic_count, "recette diététique", "recettes diététiques")}`}
          >
            Diététique<span className="tnum">{category.dietetic_count}</span>
          </Link>
        )}
      </span>
      <Photo className="swatch" image={category.cover ?? null} sizes="320px" reveal={false} tone={toneFor(category.id + 3)} alt="" />
    </div>
  );
}

export function CategoryRowSkeleton() {
  return (
    <div className="cat" aria-hidden="true">
      <div className="skel-line" style={{ height: "clamp(34px, 5.4vw, 86px)", width: "40%" }} />
      <div className="skel-line" style={{ width: 80 }} />
    </div>
  );
}
