// ── Ne pas perdre le premier appui après une saisie ────────────────────────
//
// Signalé le 2026-09-24 : dans l'assistant de publication, le bouton « Suivant »
// des étapes 1 (Identité) et 3 (Informations) demandait DEUX appuis. Ce sont
// exactement les deux étapes où l'on tape du texte ; les autres ne proposent que
// des sélections, et leur bouton répondait du premier coup.
//
// Enchaînement sur téléphone :
//   1. un champ a le focus, le clavier est ouvert ;
//   2. le doigt touche « Suivant » → le champ perd le focus ;
//   3. le clavier se referme et, `Keyboard.resize` valant « body », toute la
//      page se réagence : le bouton descend de la hauteur du clavier ;
//   4. quand le clic se résout, le bouton n'est plus sous le doigt. Raté.
//   5. Le second appui fonctionne : le clavier est déjà fermé, rien ne bouge.
//
// La parade tient en une ligne : empêcher le comportement par défaut de
// `mousedown`, dont le rôle est justement de DÉPLACER LE FOCUS. Le champ garde
// le focus, le clavier reste ouvert, la page ne bouge pas — et le clic atteint
// le bouton. Le focus se libère ensuite naturellement, quand l'étape change.
//
// À n'utiliser que sur des BOUTONS d'action : un bouton n'a pas besoin du focus
// pour être cliqué, et la navigation au clavier (Tab puis Entrée) n'émet aucun
// `mousedown`, donc elle n'est pas concernée.

/** À étaler sur un bouton : `<button {...appuiFiable} onClick={…}>`. */
export const appuiFiable = {
  onMouseDown: (e) => e.preventDefault(),
};

/**
 * Variante quand le bouton a déjà son propre `onMouseDown`.
 * @param {(e: MouseEvent) => void} [existant]
 */
export const avecAppuiFiable = (existant) => ({
  onMouseDown: (e) => { e.preventDefault(); existant?.(e); },
});

// ── Parade GLOBALE ─────────────────────────────────────────────────────────
// Le défaut ne vient pas d'un bouton en particulier : il frappe TOUT bouton
// touché pendant qu'un champ a le focus. Le corriger bouton par bouton
// reviendrait à en oublier, et à en oublier surtout dans les écrans écrits
// demain. La condition étant reconnaissable sans ambiguïté, on la traite une
// fois pour toutes, au niveau du document.
//
// Volontairement étroit : on n'intervient QUE si un champ de saisie a le focus
// ET que l'appui vise un élément actionnable. Hors de ce cas précis, rien n'est
// modifié — ni les cases à cocher, ni les curseurs, ni les étiquettes (cliquer
// une étiquette DOIT déplacer le focus vers son champ).

const CHAMPS_SANS_CLAVIER = ["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image"];

const ouvreLeClavier = (el) => {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !CHAMPS_SANS_CLAVIER.includes((el.type || "text").toLowerCase());
};

// `label` est exclu à dessein : son rôle est justement de donner le focus.
const ACTIONNABLES = 'button, a[href], [role="button"]';

export function installerAppuiFiable() {
  if (typeof document === "undefined" || document.__vitAppuiFiable) return;
  document.__vitAppuiFiable = true;

  document.addEventListener("mousedown", (e) => {
    const actif = document.activeElement;
    if (!ouvreLeClavier(actif)) return;
    const cible = e.target?.closest?.(ACTIONNABLES);
    if (!cible) return;
    // Le bouton contient le champ (rare, mais alors le focus doit rester) :
    // empêcher le défaut reste correct. On ne bloque que le transfert de focus,
    // jamais le clic lui-même.
    e.preventDefault();
  }, true);
}
