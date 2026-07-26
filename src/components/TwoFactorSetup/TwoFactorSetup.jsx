import { useState } from "react";
import { useToast } from "../../context/ToastContext";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import styles from "./TwoFactorSetup.module.css";

// Active/désactive la 2FA (TOTP + codes de secours) — le backend existe déjà
// en entier (server/controllers/authController.js setup2FA/enable2FA/disable2FA),
// ce composant n'ajoute que l'interface, jusque-là entièrement absente.
export default function TwoFactorSetup({ token, enabled, onEnabled, onDisabled }) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [step, setStep] = useState("idle"); // idle | settingUp | backupCodes
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const startSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST", headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur.");
      setSecret(data.secret);
      setQrCode(data.qrCode);
      setStep("settingUp");
    } catch (err) {
      toastError(err.message || "Erreur lors de l'activation du 2FA.");
    } finally {
      setLoading(false);
    }
  };

  const confirmEnable = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", { method: "POST", headers: authHeaders, body: JSON.stringify({ token: code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Code invalide.");
      setBackupCodes(data.backupCodes || []);
      setStep("backupCodes");
      onEnabled?.();
    } catch (err) {
      toastError(err.message || "Erreur lors de l'activation du 2FA.");
    } finally {
      setLoading(false);
    }
  };

  const finishBackupCodes = () => {
    setStep("idle");
    setCode("");
    setSecret("");
    setQrCode("");
    toastSuccess("2FA activé avec succès.");
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toastSuccess("Codes de secours copiés.");
    } catch {
      toastError("Impossible de copier automatiquement — copiez-les manuellement.");
    }
  };

  const confirmDisable = async (password) => {
    setDisabling(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", { method: "POST", headers: authHeaders, body: JSON.stringify({ password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erreur.");
      setShowDisableConfirm(false);
      toastSuccess("2FA désactivé.");
      onDisabled?.();
    } catch (err) {
      toastError(err.message || "Erreur lors de la désactivation.");
    } finally {
      setDisabling(false);
    }
  };

  if (step === "backupCodes") {
    return (
      <div className={styles.card}>
        <p className={styles.warning}>
          ⚠️ Sauvegardez ces 10 codes de secours maintenant — ils ne seront plus jamais affichés.
          Chacun permet une seule connexion si vous perdez l'accès à votre application d'authentification.
        </p>
        <div className={styles.codesGrid}>
          {backupCodes.map((c) => (
            <code key={c} className={styles.codeChip}>{c}</code>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={copyBackupCodes}>📋 Copier les codes</button>
          <button type="button" className={styles.primaryBtn} onClick={finishBackupCodes}>J'ai sauvegardé mes codes</button>
        </div>
      </div>
    );
  }

  if (step === "settingUp") {
    return (
      <form className={styles.card} onSubmit={confirmEnable}>
        <p className={styles.desc}>Scannez ce QR code avec Google Authenticator, Authy ou une application équivalente.</p>
        {qrCode && <img src={qrCode} alt="QR code 2FA" className={styles.qr} />}
        <p className={styles.secretRow}>
          Ou saisissez ce code manuellement : <code className={styles.secretCode}>{secret}</code>
        </p>
        <div className={styles.field}>
          <label htmlFor="twoFaConfirmCode">Code à 6 chiffres</label>
          <input
            id="twoFaConfirmCode"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            autoFocus
            required
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => setStep("idle")} disabled={loading}>Annuler</button>
          <button type="submit" className={styles.primaryBtn} disabled={loading || code.length !== 6}>
            {loading ? "Vérification…" : "Activer le 2FA"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.row}>
      <div>
        <p className={styles.rowTitle}>Authentification à deux facteurs (2FA)</p>
        <p className={styles.rowDesc}>
          {enabled
            ? "Activée — un code de votre application d'authentification est requis à chaque connexion."
            : "Ajoutez une couche de sécurité supplémentaire à votre compte."}
        </p>
      </div>
      {enabled ? (
        <button type="button" className={styles.dangerBtn} onClick={() => setShowDisableConfirm(true)}>Désactiver</button>
      ) : (
        <button type="button" className={styles.secondaryBtn} onClick={startSetup} disabled={loading}>
          {loading ? "…" : "Activer"}
        </button>
      )}

      <ConfirmDialog
        open={showDisableConfirm}
        title="Désactiver le 2FA ?"
        description="Votre compte sera moins protégé. Confirmez avec votre mot de passe."
        confirmLabel="Désactiver"
        danger
        requirePassword
        loading={disabling}
        onConfirm={confirmDisable}
        onCancel={() => setShowDisableConfirm(false)}
      />
    </div>
  );
}
