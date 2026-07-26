import { useState } from "react";
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

  if (!open) return null;

  const handleConfirm = (e) => {
    e.preventDefault();
    onConfirm(requirePassword ? password : undefined);
  };

  const handleCancel = () => {
    setPassword("");
    onCancel();
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={handleCancel}>
      <form className={styles.dialog} onClick={(e) => e.stopPropagation()} onSubmit={handleConfirm}>
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
