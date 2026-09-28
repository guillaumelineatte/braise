import { Link } from "react-router";
import type { RecipeAdminRow } from "@/api/schemas";
import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";

export function Thumb({ thumbnail }: { thumbnail: RecipeAdminRow["thumbnail"] }) {
  return (
    <span className="thumb" style={thumbnail ? { backgroundImage: `url("${thumbnail.lqip}")` } : undefined} aria-hidden="true">
      {thumbnail && <img src={thumbnail.url} alt="" loading="lazy" />}
    </span>
  );
}

export function StatusMark({ published }: { published: boolean }) {
  return <span className={published ? "status --on" : "status"}>{published ? "Publiée" : "Brouillon"}</span>;
}

// ligne du tableau de bord
export function RecipeRowLink({ recipe }: { recipe: RecipeAdminRow }) {
  const now = useNow(30_000);
  return (
    <Link to={`/admin/recipes/${recipe.id}`} className="row-link">
      <Thumb thumbnail={recipe.thumbnail} />
      <span>
        <span className="t" style={{ display: "block" }}>
          {recipe.title}
        </span>
        <span className="s">
          {recipe.category.name} · modifiée {formatRelative(recipe.updated_at, now)}
        </span>
      </span>
      <StatusMark published={recipe.is_published} />
    </Link>
  );
}
