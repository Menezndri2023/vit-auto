// Contrôle du selfie de vérification d'identité (2026-10-09).
//
// Décision de l'exploitant : AUCUNE analyse du visage — ni comparaison avec la
// photo de la pièce, ni détection automatique. Une telle comparaison est un
// traitement biométrique au sens de la CNDP (loi 09-08), soumis à autorisation
// préalable. Le selfie reste une simple photo, examinée par l'équipe VIT AUTO
// avec la pièce d'identité. On ne vérifie ici que ce qui rend la photo
// exploitable : format et taille.
export function checkSelfieQuality(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      resolve({ ok: false, message: "Format d'image invalide." });
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      if (img.width < 200 || img.height < 200) {
        resolve({ ok: false, message: `Image trop petite (${img.width}×${img.height}px). Minimum 200×200px.` });
      } else {
        resolve({ ok: true, message: "✓ Selfie enregistré — notre équipe le comparera à votre pièce d'identité." });
      }
    };
    img.onerror = () => resolve({ ok: false, message: "Image illisible." });
    img.src = dataUrl;
  });
}
