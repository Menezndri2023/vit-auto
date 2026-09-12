import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./TestDriveRequestModal.module.css";

// Formulaire « Demander un essai » / « Être rappelé » — un seul écran, mobile
// d'abord, le strict nécessaire (docs/vente-demande-essai.md §1). Ouvert aux
// invités : le serveur renvoie un lien de suivi signé, affiché à la fin.
const SLOTS = [
  { key: "morning",   label: "Matin" },
  { key: "afternoon", label: "Après-midi" },
  { key: "evening",   label: "Soir" },
  { key: "custom",    label: "Autre" },
];

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function TestDriveRequestModal({ open, vehicle, mode = "test_drive", onClose }) {
  const { user, isAuthenticated, authFetch } = useAuth();
  const isCallback = mode === "callback";
  const [form, setForm] = useState({
    firstName: "", lastName: "", phone: "", whatsapp: "", sameWhatsapp: true, city: "",
    date: "", slot: "", customSlot: "", message: "", financing: false, multipleVehicles: false, urgent: false,
    consent: false, website: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const firstFieldRef = useRef(null);

  // Préremplissage pour un client connecté — jamais écrasé s'il a déjà tapé.
  useEffect(() => {
    if (!open) return;
    setDone(null); setError("");
    if (user) {
      setForm((f) => ({
        ...f,
        firstName: f.firstName || user.firstName || "",
        lastName:  f.lastName  || user.lastName  || "",
        phone:     f.phone     || user.phone     || "",
        city:      f.city      || user.address?.city || "",
      }));
    }
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const set = (k) => (e) => {
    const v = e?.target?.type === "checkbox" ? e.target.checked : e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const canSubmit = useMemo(() => {
    if (!form.firstName.trim() || form.phone.trim().length < 6 || !form.consent) return false;
    if (!isCallback && (!form.date || !form.slot || (form.slot === "custom" && !form.customSlot.trim()))) return false;
    return true;
  }, [form, isCallback]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || sending) return;
    setSending(true); setError("");
    try {
      // Connecté : authFetch lie le lead au compte (suivi depuis l'espace
      // client) ; invité : fetch nu, le serveur renvoie un lien signé.
      const doFetch = isAuthenticated ? authFetch : (url, opts) => fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...opts.headers } });
      const res = await doFetch("/api/sales-leads", {
        method: "POST",
        body: JSON.stringify({
          vehicleId: vehicle._id || vehicle.id,
          requestType: isCallback ? "callback" : "test_drive",
          firstName: form.firstName, lastName: form.lastName, phone: form.phone,
          whatsapp: form.sameWhatsapp ? form.phone : form.whatsapp,
          city: form.city, date: isCallback ? undefined : form.date, slot: isCallback ? undefined : form.slot,
          customSlot: form.slot === "custom" ? form.customSlot : undefined,
          message: form.message, financing: form.financing, multipleVehicles: form.multipleVehicles, urgent: form.urgent,
          consent: form.consent, website: form.website, language: "fr",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Envoi impossible pour le moment.");
      setDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="tdr-title">
        <div className={styles.handle} />
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">×</button>

        {done ? (
          <div className={styles.success}>
            <div className={styles.successIcon}>✅</div>
            <h2 className={styles.title}>{done.duplicate ? "Demande déjà enregistrée" : isCallback ? "Demande de rappel envoyée" : "Demande d'essai envoyée"}</h2>
            <p className={styles.lead}>
              Référence <strong>{done.lead?.reference}</strong>. Le vendeur vous répond rapidement — vous serez prévenu par
              {done.lead?.client?.userId ? " notification" : " SMS / WhatsApp"}{done.lead?.client?.email ? " et e-mail" : ""}.
            </p>
            <Link to={done.accessPath || "/dashboard"} className={styles.primary} onClick={onClose}>Suivre ma demande</Link>
            {!isAuthenticated && (
              <p className={styles.hint}>Conservez le lien reçu : il vous permet d'accepter un autre créneau ou d'annuler sans créer de compte.</p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form} noValidate>
            <h2 id="tdr-title" className={styles.title}>{isCallback ? "📞 Être rappelé" : "🔑 Demander un essai"}</h2>
            <p className={styles.lead}>
              {vehicle?.name || vehicle?.title}{vehicle?.ville ? ` — ${vehicle.ville}` : ""}. {isCallback ? "Le vendeur vous rappelle au numéro indiqué." : "Choisissez votre créneau, le vendeur confirme sous 2 h."}
            </p>

            <div className={styles.row2}>
              <label className={styles.field}>
                <span>Prénom *</span>
                <input ref={firstFieldRef} value={form.firstName} onChange={set("firstName")} autoComplete="given-name" required />
              </label>
              <label className={styles.field}>
                <span>Nom</span>
                <input value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
              </label>
            </div>

            <label className={styles.field}>
              <span>Téléphone *</span>
              <input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="+225 07 00 00 00 00" required />
            </label>

            <label className={styles.check}>
              <input type="checkbox" checked={form.sameWhatsapp} onChange={set("sameWhatsapp")} />
              <span>Même numéro sur WhatsApp</span>
            </label>
            {!form.sameWhatsapp && (
              <label className={styles.field}>
                <span>WhatsApp</span>
                <input type="tel" inputMode="tel" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+225 …" />
              </label>
            )}

            <label className={styles.field}>
              <span>Ville</span>
              <input value={form.city} onChange={set("city")} autoComplete="address-level2" placeholder={vehicle?.ville || "Votre ville"} />
            </label>

            {!isCallback && (
              <>
                <label className={styles.field}>
                  <span>Date souhaitée *</span>
                  <input type="date" min={todayISO()} value={form.date} onChange={set("date")} required />
                </label>
                <div className={styles.field}>
                  <span>Créneau souhaité *</span>
                  <div className={styles.chips} role="radiogroup" aria-label="Créneau">
                    {SLOTS.map((s) => (
                      <button key={s.key} type="button" role="radio" aria-checked={form.slot === s.key}
                        className={[styles.chip, form.slot === s.key ? styles.chipOn : ""].join(" ")}
                        onClick={() => set("slot")(s.key)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {form.slot === "custom" && (
                    <input className={styles.inline} value={form.customSlot} onChange={set("customSlot")} placeholder="Ex : samedi vers 11 h" />
                  )}
                </div>
              </>
            )}

            <label className={styles.field}>
              <span>Message (facultatif)</span>
              <textarea rows={2} value={form.message} onChange={set("message")} placeholder="Une question, une précision…" />
            </label>

            <details className={styles.more}>
              <summary>Précisions (facultatif)</summary>
              <div className={styles.chips}>
                {[["financing", "Financement souhaité"], ["multipleVehicles", "Plusieurs véhicules"], ["urgent", "Urgent"]].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={form[k]}
                    className={[styles.chip, form[k] ? styles.chipOn : ""].join(" ")}
                    onClick={() => setForm((f) => ({ ...f, [k]: !f[k] }))}>
                    {label}
                  </button>
                ))}
              </div>
            </details>

            {/* Pot de miel : invisible, doit rester vide. */}
            <input className={styles.hp} tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} aria-hidden="true" />

            <label className={styles.check}>
              <input type="checkbox" checked={form.consent} onChange={set("consent")} required />
              <span>J'accepte d'être contacté par le vendeur et VIT AUTO au sujet de {isCallback ? "ma demande" : "cet essai"}. *</span>
            </label>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <button type="submit" className={styles.primary} disabled={!canSubmit || sending}>
              {sending ? "Envoi…" : isCallback ? "Demander à être rappelé" : "Envoyer ma demande d'essai"}
            </button>
            <p className={styles.hint}>Sans engagement. La vente se conclut directement avec le vendeur ; VIT AUTO vous accompagne jusqu'au bout.</p>
          </form>
        )}
      </div>
    </div>
  );
}
