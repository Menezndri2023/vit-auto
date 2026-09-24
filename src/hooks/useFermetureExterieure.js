import { useEffect } from "react";

// ── Fermer un panneau quand on touche ailleurs ─────────────────────────────
//
// Le problème du « deux appuis » sur téléphone (signalé le 2026-09-24) :
// cinq composants fermaient leur panneau sur `mousedown` — et le menu burger
// sur `touchstart`, pire encore. Or ces deux évènements précèdent `click` :
//
//     touchstart → touchend → mousedown → mouseup → click
//
// Fermer sur l'un des premiers démonte le panneau AVANT que le `click` ne se
// résolve. La mise en page se réagence, l'élément visé se déplace, et le clic
// n'atteint plus rien. Le premier appui n'a servi qu'à fermer : il faut
// recommencer. C'est exactement ce que décrivait l'exploitant.
//
// On écoute donc `click`, en phase de remontée : l'évènement atteint d'abord sa
// cible — le lien s'ouvre, le bouton agit — puis remonte jusqu'au document où
// l'on ferme. Un seul appui fait les deux.
//
// `pointerdown` aurait le même défaut que `mousedown` : il précède le clic.

/**
 * @param {import("react").RefObject<HTMLElement>} ref  conteneur du panneau —
 *   il doit ENVELOPPER le bouton déclencheur, sinon le clic qui ouvre ferme
 *   aussitôt. Quand ce n'est pas possible, passer le déclencheur en `refsSures`.
 * @param {boolean} ouvert  n'écoute que lorsque le panneau est ouvert.
 * @param {() => void} fermer
 * @param {Array<import("react").RefObject<HTMLElement>>} [refsSures]  zones
 *   supplémentaires dont un clic ne doit pas fermer (déclencheur hors panneau).
 */
export function useFermetureExterieure(ref, ouvert, fermer, refsSures = []) {
  useEffect(() => {
    if (!ouvert) return undefined;

    const dehors = (cible) => {
      if (ref?.current?.contains(cible)) return false;
      return !refsSures.some((r) => r?.current?.contains(cible));
    };
    const auClic = (e) => { if (dehors(e.target)) fermer(); };
    const aEchap = (e) => { if (e.key === "Escape") fermer(); };

    document.addEventListener("click", auClic);
    document.addEventListener("keydown", aEchap);
    return () => {
      document.removeEventListener("click", auClic);
      document.removeEventListener("keydown", aEchap);
    };
    // `refsSures` est un tableau recréé à chaque rendu : le sérialiser sur les
    // refs elles-mêmes éviterait de réinstaller l'écouteur à chaque fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, fermer, ref, ...refsSures]);
}
