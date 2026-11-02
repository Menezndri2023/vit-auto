import { useState, useCallback } from "react";

// Demandes à valider : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useDemandesAValider({
  headers, showToast, token,
}) {
  // Gate admin obligatoire (audit 2026-08) — file d'attente de validation
  // (réservations + achats directs IE) et inbox de supervision des chats
  // client_partner (lecture seule, voir chatController.getClientPartnerChats).
  const [pendingValidationBookings, setPendingValidationBookings] = useState([]);
  const [pendingValidationDirect,   setPendingValidationDirect]   = useState([]);
  const [pendingValidationLoading,  setPendingValidationLoading]  = useState(false);
  const [validationRejectModal,     setValidationRejectModal]     = useState(null); // { kind: "booking"|"direct", item }
  const [validationRejectReason,    setValidationRejectReason]    = useState("");

  // ── Gate admin obligatoire (audit 2026-08) ─────────────────────────────
  const loadPendingValidation = useCallback(async () => {
    if (!token) return;
    setPendingValidationLoading(true);
    try {
      const [bRes, tRes] = await Promise.all([
        fetch("/api/bookings/admin/pending-validation", { headers }),
        fetch("/api/import-export/transactions/admin/pending-validation", { headers }),
      ]);
      if (bRes.ok) setPendingValidationBookings((await bRes.json()).bookings || []);
      if (tRes.ok) setPendingValidationDirect((await tRes.json()).transactions || []);
    } catch { /* ignore */ }
    setPendingValidationLoading(false);
  }, [token, headers]);

  const adminValidateBookingReq = useCallback(async (id, decision, refusalReason) => {
    try {
      const r = await fetch(`/api/bookings/${id}/admin-validate`, {
        method: "PATCH", headers, body: JSON.stringify({ decision, refusalReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast(decision === "approved" ? "Réservation transmise au partenaire." : "Demande refusée.");
        setPendingValidationBookings((prev) => prev.filter((b) => b._id !== id));
      } else {
        showToast(d.message || "Erreur lors de la validation.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
  }, [headers, showToast]);

  const adminValidateDirectReq = useCallback(async (id, decision, refusalReason) => {
    try {
      const r = await fetch(`/api/import-export/transactions/${id}/admin-validate-direct`, {
        method: "PATCH", headers, body: JSON.stringify({ decision, refusalReason }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast(decision === "approved" ? "Achat direct transmis au partenaire." : "Achat direct refusé.");
        setPendingValidationDirect((prev) => prev.filter((t) => t._id !== id));
      } else {
        showToast(d.message || "Erreur lors de la validation.", "error");
      }
    } catch { showToast("Erreur réseau.", "error"); }
  }, [headers, showToast]);

  const confirmValidationReject = useCallback(async () => {
    if (!validationRejectModal) return;
    const { kind, item } = validationRejectModal;
    if (kind === "booking") await adminValidateBookingReq(item._id, "rejected", validationRejectReason.trim());
    else await adminValidateDirectReq(item._id, "rejected", validationRejectReason.trim());
    setValidationRejectModal(null);
    setValidationRejectReason("");
  }, [validationRejectModal, validationRejectReason, adminValidateBookingReq, adminValidateDirectReq]);

  return {
    adminValidateBookingReq, adminValidateDirectReq, confirmValidationReject, loadPendingValidation, pendingValidationBookings,
    pendingValidationDirect, pendingValidationLoading, setValidationRejectModal, setValidationRejectReason, validationRejectModal,
    validationRejectReason,
  };
}
