import { useParams, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useVehicles } from "../context/VehicleContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import styles from "./Booking.module.css";

// ── Demande d'embauche chauffeur à temps plein (CDD/CDI) ─────────────────────
// Distinct de DriverBooking.jsx (mission ponctuelle payée en ligne) : ici le
// client propose un contrat de travail durable, que le partenaire propriétaire
// du profil chauffeur accepte ou refuse depuis son tableau de bord — voir
// server/controllers/driverEmploymentController.js.
const DriverEmployment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getItemById } = useVehicles();
  const { user, token } = useAuth();
  const { success, error } = useToast();

  const driver = getItemById(id);

  const [contractType, setContractType] = useState("cdi");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [proposedSalary, setProposedSalary] = useState("");
  const [workSchedule, setWorkSchedule] = useState("");
  const [missionDescription, setMissionDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  if (!driver) {
    return (
      <div className={styles.content} style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1 style={{ color: "#0f1b3f" }}>Chauffeur introuvable</h1>
        <p style={{ color: "#64748b" }}>Ce chauffeur n'est plus disponible ou n'existe pas.</p>
        <Link to="/catalogue?mode=Chauffeur" style={{ color: "#ff4d2d", fontWeight: 700 }}>← Retour aux chauffeurs</Link>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <div className={styles.content} style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1 style={{ color: "#0f1b3f" }}>Connexion requise</h1>
        <p style={{ color: "#64748b" }}>Connectez-vous pour proposer un contrat d'embauche à ce chauffeur.</p>
        <button className={styles.input} style={{ background: "#ff4d2d", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          onClick={() => navigate(`/login?returnTo=/driver-employment/${id}`)}>
          Se connecter
        </button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (submitting) return;
    if (!startDate) { error("Choisissez une date de début."); return; }
    if (contractType === "cdd" && !endDate) { error("Un CDD nécessite une date de fin."); return; }
    if (!proposedSalary || Number(proposedSalary) <= 0) { error("Indiquez le salaire mensuel proposé."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/driver-employment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          driverId: id,
          contractType,
          startDate,
          endDate: contractType === "cdd" ? endDate : undefined,
          proposedSalary: Number(proposedSalary),
          workSchedule,
          missionDescription,
        }),
      });
      if (res.ok) {
        setSent(true);
        success("Proposition d'embauche envoyée !");
      } else {
        const data = await res.json().catch(() => null);
        error(data?.message || "Erreur lors de l'envoi de la proposition.");
      }
    } catch {
      error("Erreur réseau — réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.content} style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: 12 }}>💼</div>
        <h1 style={{ color: "#0f1b3f" }}>Proposition envoyée !</h1>
        <p style={{ color: "#64748b" }}>
          {driver.firstName} {driver.lastName} a été notifié(e) de votre proposition {contractType.toUpperCase()}.
          Vous recevrez une notification dès sa réponse.
        </p>
        <Link to="/dashboard" style={{ color: "#ff4d2d", fontWeight: 700 }}>← Voir mon tableau de bord</Link>
      </div>
    );
  }

  return (
    <div className={styles.content} style={{ maxWidth: 640, margin: "32px auto" }}>
      <Link to={`/driver-booking/${id}`} style={{ color: "#64748b", fontSize: "0.85rem", textDecoration: "none" }}>← Retour au profil du chauffeur</Link>

      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "16px 0 24px", padding: 16, background: "#f8fafc", borderRadius: 14, border: "1.5px solid #e5e9f4" }}>
        {driver.profilePhoto || driver.images?.[0]
          ? <img src={driver.profilePhoto || driver.images[0]} alt={`${driver.firstName} ${driver.lastName}`} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          : <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e5e9f4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem" }}>🧑‍✈️</div>
        }
        <div>
          <strong style={{ color: "#0f1b3f", fontSize: "1.1rem" }}>{driver.firstName} {driver.lastName}</strong>
          <p style={{ margin: "2px 0", color: "#64748b", fontSize: "0.9rem" }}>{driver.title || "Chauffeur professionnel"}</p>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>📍 {driver.zone || driver.ville || "—"} · {driver.experience || 0} ans d'expérience</p>
        </div>
      </div>

      <h1 style={{ color: "#0f1b3f", fontSize: "1.3rem", marginBottom: 4 }}>💼 Employer à temps plein</h1>
      <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 20 }}>
        Proposez un contrat CDD ou CDI à ce chauffeur — la plateforme transmet votre proposition, la négociation et la
        signature du contrat de travail se font ensuite directement entre vous et le chauffeur.
      </p>

      <div style={{ marginBottom: 20 }}>
        <span style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 8 }}>Type de contrat *</span>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ v: "cdi", l: "CDI — Durée indéterminée" }, { v: "cdd", l: "CDD — Durée déterminée" }].map((opt) => (
            <label key={opt.v} style={{
              flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, cursor: "pointer",
              border: `1.5px solid ${contractType === opt.v ? "#ff4d2d" : "#e5e9f4"}`,
              background: contractType === opt.v ? "#fff5f3" : "#fff",
              fontWeight: contractType === opt.v ? 700 : 400,
              color: contractType === opt.v ? "#ff4d2d" : "#374151",
            }}>
              <input type="radio" name="contractType" value={opt.v} checked={contractType === opt.v}
                onChange={() => setContractType(opt.v)} style={{ accentColor: "#ff4d2d" }} />
              {opt.l}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: contractType === "cdd" ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 20 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem" }}>Date de début souhaitée *</span>
          <input type="date" value={startDate} min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
        </label>
        {contractType === "cdd" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem" }}>Date de fin *</span>
            <input type="date" value={endDate} min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
          </label>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
          Salaire mensuel proposé (USD) *
        </label>
        <input type="number" min="1" placeholder="Ex : 400" value={proposedSalary}
          onChange={(e) => setProposedSalary(e.target.value)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
          Horaires / rythme de travail (optionnel)
        </label>
        <input type="text" placeholder="Ex : Temps plein, 6j/7, 8h-18h" value={workSchedule}
          onChange={(e) => setWorkSchedule(e.target.value)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box" }} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: 700, color: "#374151", fontSize: "0.85rem", display: "block", marginBottom: 6 }}>
          Description du poste (optionnel)
        </label>
        <textarea rows={4} placeholder="Ex : Chauffeur personnel pour trajets domicile-bureau, déplacements professionnels occasionnels..."
          value={missionDescription} onChange={(e) => setMissionDescription(e.target.value)}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e9f4", fontSize: "0.95rem", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <button onClick={handleSubmit} disabled={submitting}
        style={{
          width: "100%", padding: "15px", borderRadius: 14, border: "none",
          cursor: submitting ? "not-allowed" : "pointer",
          background: submitting ? "#94a3b8" : "linear-gradient(135deg, #ff4d2d, #e03519)",
          color: "#fff", fontWeight: 800, fontSize: "1rem",
        }}>
        {submitting ? "Envoi en cours…" : "Envoyer la proposition d'embauche"}
      </button>
    </div>
  );
};

export default DriverEmployment;
