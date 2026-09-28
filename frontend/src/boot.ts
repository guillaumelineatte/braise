/**
 * Point d'entrée.
 *
 * Le JS de l'appli est déjà en cours de téléchargement (modulepreload), mais on attend que
 * index.html ait affiché le haut de page avant de lancer React (1,2 s max). Comme ça l'image
 * principale s'affiche sans attendre le JS. Sur les pages sans ce haut de page statique
 * (liste, admin...), on démarre directement.
 */
import "./styles/index.css"; // importé ici pour que le CSS soit dans le HTML dès le départ

declare global {
  interface Window {
    __BRAISE_SHELL__?: Promise<void>;
  }
}

const shellPainted = window.__BRAISE_SHELL__ ?? Promise.resolve();
const ceiling = new Promise<void>((resolve) => window.setTimeout(resolve, 1200));

void Promise.race([shellPainted, ceiling]).then(() => import("./main"));

export {};
