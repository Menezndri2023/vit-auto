import { useState, useMemo } from "react";
import styles from "./PartnerCalendar.module.css";

// Statuts qui occupent réellement un créneau (même liste que la détection de
// conflit côté serveur — voir server/controllers/bookingController.js) :
// une réservation annulée/terminée/refusée ne bloque plus le planning.
const ACTIVE_STATUSES = new Set([
  "pending", "confirmed", "preparing", "ready", "in_progress",
  "client_arrived", "transaction_concluded", "waiting_client_validation",
]);

const TYPE_LABELS = { location: "🚗 Location", chauffeur: "👨‍✈️ Chauffeur", essai: "🔑 Essai" };
const TYPE_COLORS = { location: "#2563eb", chauffeur: "#7c3aed", essai: "#0d9488" };

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Extrait, pour chaque réservation active, l'intervalle [start, end] qu'elle
// occupe réellement — chaque type de commande stocke ses dates différemment
// (location.startDate/endDate, chauffeur.date/dateFin, essai.preferredDate seul).
function bookingInterval(b) {
  if (b.type === "location" && b.startDate) {
    return { start: startOfDay(b.startDate), end: startOfDay(b.endDate || b.startDate) };
  }
  if (b.type === "chauffeur" && b.chauffeur?.date) {
    const start = startOfDay(b.chauffeur.date);
    const end = startOfDay(b.chauffeur.dateFin || b.chauffeur.date);
    return { start, end };
  }
  if (b.type === "essai" && (b.preferredDate || b.essai?.preferredDate)) {
    const d = startOfDay(b.preferredDate || b.essai.preferredDate);
    return { start: d, end: d };
  }
  return null;
}

function buildMonthGrid(monthDate) {
  const year  = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  // Lundi = 0 (au lieu du dimanche=0 par défaut de getDay())
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Calendrier de disponibilité partagé — vue d'ensemble des véhicules et
 * chauffeurs déjà occupés, jour par jour, pour éviter d'avoir à vérifier
 * chaque créneau un par un (voir les endpoints occupied-dates/occupied-slots).
 * Construit entièrement à partir de `bookings` déjà chargées en mémoire
 * (VehicleContext.partnerBookings) — aucun appel réseau supplémentaire.
 */
export default function PartnerCalendar({ bookings }) {
  const [monthDate, setMonthDate] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);

  const activeBookings = useMemo(() => {
    return bookings
      .filter((b) => ACTIVE_STATUSES.has(b.status))
      .map((b) => ({ booking: b, interval: bookingInterval(b) }))
      .filter((x) => x.interval);
  }, [bookings]);

  const cells = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  const dayOccupancy = useMemo(() => {
    const map = new Map();
    for (const cell of cells) {
      if (!cell) continue;
      const key = cell.getTime();
      const matches = activeBookings.filter(
        ({ interval }) => cell >= interval.start && cell <= interval.end
      );
      map.set(key, matches);
    }
    return map;
  }, [cells, activeBookings]);

  const selectedEntries = selectedDay ? dayOccupancy.get(selectedDay.getTime()) || [] : [];

  const monthLabel = monthDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const today = startOfDay(new Date());

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <button type="button" className={styles.navBtn} onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}>‹</button>
        <h3 className={styles.monthLabel}>{monthLabel}</h3>
        <button type="button" className={styles.navBtn} onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}>›</button>
        <button type="button" className={styles.todayBtn} onClick={() => setMonthDate(startOfDay(new Date()))}>Aujourd'hui</button>
      </div>

      <div className={styles.legend}>
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <span key={key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: TYPE_COLORS[key] }} />
            {label}
          </span>
        ))}
      </div>

      <div className={styles.grid}>
        {DAY_LABELS.map((d) => <div key={d} className={styles.dayHeader}>{d}</div>)}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className={styles.emptyCell} />;
          const key = cell.getTime();
          const matches = dayOccupancy.get(key) || [];
          const isToday = cell.getTime() === today.getTime();
          const isSelected = selectedDay && cell.getTime() === selectedDay.getTime();
          return (
            <button
              type="button"
              key={i}
              className={[styles.dayCell, isToday ? styles.dayCellToday : "", isSelected ? styles.dayCellSelected : ""].join(" ")}
              onClick={() => setSelectedDay(matches.length ? cell : null)}
            >
              <span className={styles.dayNum}>{cell.getDate()}</span>
              {matches.length > 0 && (
                <span className={styles.dots}>
                  {matches.slice(0, 4).map(({ booking }, idx) => (
                    <span key={idx} className={styles.dot} style={{ background: TYPE_COLORS[booking.type] || "#94a3b8" }} />
                  ))}
                  {matches.length > 4 && <span className={styles.dotMore}>+{matches.length - 4}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className={styles.detailPanel}>
          <div className={styles.detailHeader}>
            <strong>{selectedDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong>
            <button type="button" className={styles.closeBtn} onClick={() => setSelectedDay(null)}>✕</button>
          </div>
          {selectedEntries.length === 0 ? (
            <p className={styles.emptyDetail}>Aucune occupation ce jour-là.</p>
          ) : (
            <ul className={styles.detailList}>
              {selectedEntries.map(({ booking }) => (
                <li key={booking.id} className={styles.detailItem}>
                  <span className={styles.detailBadge} style={{ background: TYPE_COLORS[booking.type] }}>
                    {TYPE_LABELS[booking.type] || booking.type}
                  </span>
                  <div className={styles.detailInfo}>
                    <div className={styles.detailName}>{booking.vehicleName}</div>
                    <div className={styles.detailMeta}>
                      Réf. {booking.reference || "—"} · {booking.firstName} {booking.lastName}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
