import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { WordmarkText } from "@/components/Wordmark";

// page d'erreur des routes (souvent un chunk qui n'existe plus après une mise en ligne)
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const chunkFailed = error instanceof Error && /dynamically imported module|Importing a module script failed/i.test(error.message);
  return (
    <div className="wrap" style={{ minHeight: "100svh", display: "grid", alignContent: "center", gap: 24 }}>
      <p className="wordmark">
        <WordmarkText />
      </p>
      <h1 className="serif h1" style={{ margin: 0, maxWidth: "14ch" }}>
        {notFound ? "Cette page a refroidi." : "Quelque chose a attaché au fond de la casserole."}
      </h1>
      <p className="lede" style={{ margin: 0, maxWidth: "40ch" }}>
        {chunkFailed
          ? "Le site vient d'être mis à jour. Rechargez la page pour retrouver la dernière version."
          : "Rechargez la page ; si le problème persiste, revenez un peu plus tard."}
      </p>
      <p style={{ display: "flex", gap: 20, margin: 0 }}>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Recharger
        </button>
        <Link to="/" className="btn">
          Retour à l'accueil
        </Link>
      </p>
    </div>
  );
}
