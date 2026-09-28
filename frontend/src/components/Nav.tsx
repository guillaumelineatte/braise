import { Link, NavLink } from "react-router";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap">
        <Wordmark />
        <nav className="nav-links" aria-label="Navigation principale">
          <NavLink to="/recettes" className="u">
            Recettes
          </NavLink>
          <Link to="/#categories" className="u nav-secondary">
            Catégories
          </Link>
          <NavLink to="/a-propos" className="u nav-secondary">
            À propos
          </NavLink>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
