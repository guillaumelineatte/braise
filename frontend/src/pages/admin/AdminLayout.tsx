import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, Navigate, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { useMe } from "@/api/admin";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WordmarkText } from "@/components/Wordmark";
import { clearSession, useSession } from "@/lib/auth";
import { useMeta } from "@/lib/meta";
import "@/styles/admin.css";

// tout /admin passe par ici : pas de jeton valide = retour au login
export default function AdminLayout() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe();
  useMeta({ title: "Administration", noindex: true });

  // déconnexion auto quand le jeton expire, même si l'onglet reste ouvert
  useEffect(() => {
    if (!session) return;
    const delay = Date.parse(session.expiresAt) - Date.now();
    const timer = window.setTimeout(() => clearSession(), Math.max(0, Math.min(delay, 2 ** 31 - 1)));
    return () => window.clearTimeout(timer);
  }, [session]);

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }

  const logout = () => {
    clearSession();
    client.removeQueries({ queryKey: ["admin"] });
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="admin-shell">
      <a href="#admin-main" className="skip-link">
        Aller au contenu
      </a>
      <header className="admin-bar">
        <div className="inner">
          <div className="brand">
            <Link to="/admin" className="wordmark" aria-label="Braise, tableau de bord">
              <WordmarkText />
            </Link>
            <span className="label">Administration</span>
          </div>
          <nav aria-label="Administration">
            <NavLink to="/admin" end>
              Tableau de bord
            </NavLink>
            <NavLink to="/admin/recipes">Recettes</NavLink>
            <NavLink to="/admin/categories">Catégories</NavLink>
          </nav>
          <div className="tools">
            <span className="who">{me.data?.email ?? session.email}</span>
            <a href="/" target="_blank" rel="noopener" className="u">
              Voir le site
            </a>
            <button type="button" className="u" onClick={logout}>
              Se déconnecter
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="admin-main" className="admin-main" tabIndex={-1} style={{ outline: "none" }}>
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
