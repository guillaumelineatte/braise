import { Link } from "react-router";
import { useMeta } from "@/lib/meta";

export default function NotFound() {
  useMeta({ title: "Page introuvable", noindex: true });
  return (
    <section className="section">
      <div className="wrap" style={{ display: "grid", gap: 28, minHeight: "50svh", alignContent: "center" }}>
        <p className="label">Erreur 404</p>
        <h1 className="serif display" style={{ margin: 0, maxWidth: "12ch" }}>
          Cette page a refroidi.
        </h1>
        <p className="lede" style={{ margin: 0, maxWidth: "36ch" }}>
          L'adresse a peut-être changé, ou la recette a été retirée de la carte. Il reste de quoi faire.
        </p>
        <p style={{ display: "flex", gap: 28, margin: 0, flexWrap: "wrap" }}>
          <Link to="/recettes" className="u">
            Voir toutes les recettes
          </Link>
          <Link to="/" className="u">
            Retour à l'accueil
          </Link>
        </p>
      </div>
    </section>
  );
}
