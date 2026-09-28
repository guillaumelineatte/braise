import { formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { SaveStatus } from "./useAutosave";

// "Enregistrement…", "Enregistré il y a 5 s", ou l'erreur avec un bouton pour réessayer
export function SaveIndicator({ status, published, onRetry }: { status: SaveStatus; published: boolean | null; onRetry: () => void }) {
  const now = useNow(1000);
  const state = published == null ? "" : published ? " — en ligne" : " — brouillon";
  let text: React.ReactNode;
  switch (status.kind) {
    case "pending":
    case "saving":
      text = "Enregistrement…";
      break;
    case "saved":
      text = `Enregistré ${formatRelative(status.at, now)}`;
      break;
    case "idle":
      text = status.at ? `Enregistré ${formatRelative(status.at, now)}` : "Nouvelle recette";
      break;
    case "needs-title":
      text = "Donnez un titre pour créer le brouillon";
      break;
    case "error":
      return (
        <div className="saved" role="alert">
          <span className="error">Erreur d'enregistrement —</span>
          <button type="button" onClick={onRetry}>
            réessayer
          </button>
          <span style={{ flexBasis: "100%" }}>{status.message}</span>
        </div>
      );
  }
  return (
    <div className="saved" aria-live="polite">
      {text}
      {state}
    </div>
  );
}
