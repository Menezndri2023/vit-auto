import { useState, useCallback } from "react";

// Emails & livraison : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useEmailsLivraison({
  headers, token,
}) {
  // Emails & livraison — voir commWebhookController.js pour l'origine des
  // statuts "bounced"/"complained" (webhook Resend, sans lequel un email
  // rejeté par le serveur destinataire restait indiscernable d'un email
  // réellement livré).
  const [emailStats,           setEmailStats]           = useState(null);
  const [emailFailures,        setEmailFailures]        = useState([]);
  const [emailDeliveryLoading, setEmailDeliveryLoading] = useState(false);

  // ── Emails & livraison (bounces/échecs Resend) ───────────────────────────────
  const loadEmailDelivery = useCallback(async () => {
    if (!token) return;
    setEmailDeliveryLoading(true);
    try {
      const [sRes, fRes] = await Promise.all([
        fetch("/api/comm/stats", { headers }),
        fetch("/api/comm/failures?limit=100", { headers }),
      ]);
      if (sRes.ok) setEmailStats((await sRes.json()).stats);
      if (fRes.ok) setEmailFailures((await fRes.json()).failures || []);
    } catch { /* ignore */ }
    setEmailDeliveryLoading(false);
  }, [token, headers]);

  return {
    emailDeliveryLoading, emailFailures, emailStats, loadEmailDelivery,
  };
}
