import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../context/NotificationContext";
import styles from "./NotificationBell.module.css";

const TYPE_ICONS = {
  booking_confirmed: "✅",
  booking_cancelled: "❌",
  booking_completed: "🏁",
  new_booking:       "📦",
  new_review:        "⭐",
  payment_received:  "💰",
  listing_approved:  "✔️",
  listing_rejected:  "🚫",
  system:            "ℹ️",
};

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${d}j`;
};

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  // Fermer si clic en dehors
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleClick = async (notif) => {
    if (!notif.lu) await markAsRead(notif._id);
    setOpen(false);
    if (notif.lien) navigate(notif.lien);
  };

  const recent = notifications.slice(0, 12);

  return (
    <div className={styles.wrapper} ref={panelRef}>
      <button
        className={styles.bell}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={markAllAsRead}>
                Tout marquer lu
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className={styles.empty}>
              <span>🔔</span>
              <p>Aucune notification</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {recent.map((n) => (
                <li
                  key={n._id}
                  className={`${styles.item} ${!n.lu ? styles.itemUnread : ""}`}
                  onClick={() => handleClick(n)}
                >
                  <span className={styles.itemIcon}>
                    {TYPE_ICONS[n.type] || "🔔"}
                  </span>
                  <div className={styles.itemContent}>
                    <p className={styles.itemTitle}>{n.titre}</p>
                    <p className={styles.itemMsg}>{n.message}</p>
                    <span className={styles.itemTime}>{timeAgo(n.createdAt)}</span>
                  </div>
                  <button
                    className={styles.delBtn}
                    onClick={(e) => { e.stopPropagation(); deleteNotification(n._id); }}
                    aria-label="Supprimer"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
