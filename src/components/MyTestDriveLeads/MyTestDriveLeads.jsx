import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SALE_LEAD_LABELS, SALE_LEAD_COLORS, fmtLeadDate } from "../../constants/salesLeads";
import styles from "./MyTestDriveLeads.module.css";

// Bloc « Mes demandes d'essai » de l'espace client (docs/vente-demande-essai.md
// §5) — liste courte, chaque ligne mène à la page de suivi /essai/:reference.
const NEEDS_ACTION = ["ALTERNATIVE_PROPOSED"];

export default function MyTestDriveLeads() {
  const { isAuthenticated, authFetch, authReady } = useAuth();
  const [leads, setLeads] = useState(null);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    let cancelled = false;
    authFetch("/api/sales-leads/mine")
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d) => { if (!cancelled) setLeads(d.leads || []); })
      .catch(() => { if (!cancelled) setLeads([]); });
    return () => { cancelled = true; };
  }, [authReady, isAuthenticated, authFetch]);

  if (!leads || leads.length === 0) return null;

  return (
    <section className={styles.block}>
      <h2 className={styles.title}>🔑 Mes demandes d'essai</h2>
      <ul className={styles.list}>
        {leads.map((l) => {
          const [bg, fg] = SALE_LEAD_COLORS[l.status] || ["#e5e7eb", "#374151"];
          const when = l.appointment?.date ? `${fmtLeadDate(l.appointment.date)}${l.appointment.time ? ` à ${l.appointment.time}` : ""}` : l.requested?.date ? `souhaité le ${fmtLeadDate(l.requested.date)}` : "";
          return (
            <li key={l._id}>
              <Link to={`/essai/${l.reference}`} className={styles.row}>
                {l.listingSnapshot?.image && <img src={l.listingSnapshot.image} alt="" className={styles.thumb} />}
                <div className={styles.body}>
                  <strong className={styles.name}>{l.listingSnapshot?.title || "Véhicule"}</strong>
                  <span className={styles.meta}>{l.reference}{when ? ` · ${when}` : ""}</span>
                </div>
                <span className={styles.badge} style={{ background: bg, color: fg }}>
                  {NEEDS_ACTION.includes(l.status) ? "À répondre" : SALE_LEAD_LABELS[l.status] || l.status}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
