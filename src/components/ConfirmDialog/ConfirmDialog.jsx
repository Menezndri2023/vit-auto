import { useEffect, useRef, useState } from "react";
import styles from "./ConfirmDialog.module.css";

// Modal minimal pour les actions destructives (remplace window.confirm) —
// volontairement restreint à ce cas d'usage, pas une librairie de composants
// générique. `requirePassword` ajoute un champ mot de passe et le renvoie tel
// quel à `onConfirm` (l'appelant valide côté serveur, jamais ici).
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger = false,
  requirePassword = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const [password, setPassword] = useState("");
  const dialogRef = useRef(null);

  const handleConfirm = (e) => {
    e.preventDefault();
    onConfirm(requirePassword ? password : undefined);
  };

  const handleCancel = () => {
    setPassword("");
    onCancel();
  };

  // Focus initial + piège de focus (Tab reste dans la modale) + fermeture Escape.
  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll('button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusable?.[0] || dialog)?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleCancel();
        return;
      }
      if (e.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={handleCancel}>
      <form ref={dialogRef} tabIndex={-1} className={styles.dialog} onClick={(e) => e.stopPropagation()} onSubmit={handleConfirm}>
        <h3 className={styles.title}>{title}</h3>
        {description && <p className={styles.description}>{description}</p>}

        {requirePassword && (
          <div className={styles.field}>
            <label htmlFor="confirmDialogPassword">Mot de passe</label>
            <input
              id="confirmDialogPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Confirmez avec votre mot de passe"
              autoFocus
              required
            />
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={handleCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={danger ? styles.dangerConfirmBtn : styles.confirmBtn}
            disabled={loading || (requirePassword && !password)}
          >
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
