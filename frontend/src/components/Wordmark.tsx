import { Link } from "react-router";
import { cx } from "@/lib/cx";

// le "i" est en couleur d'accent via le CSS
export function WordmarkText() {
  return (
    <>
      Bra<i>i</i>se
    </>
  );
}

export function Wordmark({ to = "/", className, label = "Braise, accueil" }: { to?: string; className?: string; label?: string }) {
  return (
    <Link to={to} className={cx("wordmark", className)} aria-label={label}>
      <WordmarkText />
    </Link>
  );
}
