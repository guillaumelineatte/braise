import { Link } from "react-router";
import { WordmarkText } from "./Wordmark";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot-grid">
          <p className="about">
            Braise rassemble des recettes que l'on prend le temps de faire. Pas de tendances, pas de raccourcis — des gestes
            justes, expliqués une fois pour toutes.
          </p>
          <div className="col">
            <Link to="/recettes" className="u">
              Recettes
            </Link>
            <Link to="/#categories" className="u">
              Catégories
            </Link>
            <Link to="/a-propos" className="u">
              À propos
            </Link>
          </div>
          <div className="col">
            <Link to="/recettes?dietetic=true" className="u">
              Diététique
            </Link>
            <Link to="/a-propos#methode" className="u">
              Notre méthode
            </Link>
            <a href="/sitemap.xml" className="u">
              Plan du site
            </a>
          </div>
        </div>
        <p className="giant" aria-hidden="true">
          <WordmarkText />
        </p>
        <div className="colophon">
          <span>© {new Date().getFullYear()} Braise</span>
          <span>Fraunces &amp; Inter</span>
        </div>
      </div>
    </footer>
  );
}
