import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer/Footer";
import BackToTop from "./BackToTop";
import ScrollToTop from "./ScrollToTop";
import BottomNav from "../BottomNav/BottomNav";
import OfflineBanner from "../OfflineBanner/OfflineBanner";
import Celebration from "../Celebration/Celebration";
import WelcomeGuide from "../WelcomeGuide/WelcomeGuide";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useNotifications } from "../../context/NotificationContext";
import useIsMobile from "../../hooks/useIsMobile";
import styles from "./Layout.module.css";

// Routes qui gèrent leur propre layout (pas de Navbar/Footer global)
const BARE_ROUTES = ["/admin", "/stats", "/contract/"];

const isBareRoute = (pathname) =>
  BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(r));

// ── Bannière email non vérifié ────────────────────────────────────────────────
const EmailBanner = ({ email }) => {
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const resend = async () => {
    setSending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      setSent(true);
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  return (
    <div style={{
      background: "#fffbeb",
      borderBottom: "2px solid #f59e0b",
      padding: "10px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 8,
      fontSize: "0.88rem",
      zIndex: 900,
      position: "relative",
    }}>
      <span style={{ color: "#78350f" }}>
        📧 <strong>Vérifiez votre e-mail</strong> — Un lien de confirmation a été envoyé à{" "}
        <strong>{email}</strong>. Votre accès est limité jusqu'à la vérification.
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {sent ? (
          <span style={{ color: "#10b981", fontWeight: 700 }}>✅ Lien renvoyé !</span>
        ) : (
          <button onClick={resend} disabled={sending}
            style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: "0.82rem" }}>
            {sending ? "Envoi…" : "Renvoyer le lien"}
          </button>
        )}
        <button onClick={() => setVisible(false)}
          style={{ background: "none", border: "none", cursor: "pointer",
            color: "#92400e", fontSize: "1rem", lineHeight: 1 }}>
          ✕
        </button>
      </div>
    </div>
  );
};

// ── Layout principal ──────────────────────────────────────────────────────────
const Layout = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { info: toastInfo } = useToast();
  const { celebration, dismissCelebration } = useNotifications();
  const bare = isBareRoute(location.pathname);
  const isMobile = useIsMobile();
  const lastBackPress = useRef(0);

  // Bouton retour matériel Android : navigue dans l'historique React Router
  // tant qu'on n'est pas sur la page d'accueil, sinon "appuyer 2x pour quitter"
  // plutôt qu'une sortie brutale au premier appui.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      if (location.pathname !== "/") {
        navigate(-1);
        return;
      }
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        CapacitorApp.exitApp();
      } else {
        lastBackPress.current = now;
        toastInfo("Appuyez de nouveau pour quitter");
      }
    });

    return () => { listenerPromise.then((l) => l.remove()); };
  }, [location.pathname, navigate, toastInfo]);

  const showBanner = isAuthenticated && user && user.emailVerified === false;

  // Pages ERP (admin, stats, contrat) : pas de Navbar ni Footer global
  if (bare) {
    return (
      <>
        <ScrollToTop />
        <OfflineBanner />
        {/* La bannière email s'affiche aussi en admin (important pour les admins non vérifiés) */}
        {showBanner && <EmailBanner email={user.email} />}
        <Celebration celebration={celebration} onDismiss={dismissCelebration} />
        {children}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <ScrollToTop />
      <OfflineBanner />
      <Navbar />
      {showBanner && <EmailBanner email={user.email} />}
      <Celebration celebration={celebration} onDismiss={dismissCelebration} />
      <WelcomeGuide />
      <main className={`${styles.main} ${isMobile ? styles.mainWithBottomNav : ""}`}>{children}</main>
      <Footer />
      <BackToTop />
      {isMobile && <BottomNav />}
    </div>
  );
};

export default Layout;
