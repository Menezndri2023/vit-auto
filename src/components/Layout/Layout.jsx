import { useState } from "react";
import Navbar from "../Navbar/Navbar";
import Footer from "../Footer/Footer";
import BackToTop from "./BackToTop";
import { useAuth } from "../../context/AuthContext";
import styles from "./Layout.module.css";

const EmailBanner = ({ email }) => {
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [visible,  setVisible]  = useState(true);

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
        📧 <strong>Vérifiez votre e-mail</strong> — Un lien de confirmation a été envoyé à <strong>{email}</strong>.
        Votre accès est limité jusqu'à la vérification.
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
          style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", fontSize: "1rem", lineHeight: 1 }}>
          ✕
        </button>
      </div>
    </div>
  );
};

const Layout = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const showBanner = isAuthenticated && user && user.emailVerified === false;

  return (
    <div className={styles.page}>
      <Navbar />
      {showBanner && <EmailBanner email={user.email} />}
      <main className={styles.main}>{children}</main>
      <Footer />
      <BackToTop />
    </div>
  );
};

export default Layout;
