import { useState, useCallback } from "react";

// Founding Partners : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useFoundingPartners({
  fetchPaged, headers, showToast, token,
}) {
  // Founding Partner Onboarding Admin
  const [foundingList,      setFoundingList]     = useState([]);
  const [foundingStats,     setFoundingStats]    = useState(null);
  const [foundingLoading,   setFoundingLoading]  = useState(false);
  const [foundingDetail,    setFoundingDetail]   = useState(null);
  const [foundingSignLink,  setFoundingSignLink] = useState(null); // { id, link, type, companyName }
  const [foundingNote,      setFoundingNote]     = useState("");
  const [foundingAction,    setFoundingAction]   = useState(null); // { id, type: 'approve'|'reject'|'agreement' }
  const [foundingSubmitting, setFoundingSubmitting] = useState(false); // évite le double-clic (envoi LOI/accord/rejet en double) — utilisé uniquement par le MODAL (une seule cible à la fois)
  // Bug réel corrigé (audit — remonté par l'utilisateur) : les boutons "Relancer"/
  // "Envoyer Accord"/"Renvoyer la LOI"/"Renvoyer l'accord" de CHAQUE ligne du
  // tableau Founding Partner partageaient tous le même booléen foundingSubmitting
  // — cliquer "Relancer" sur UN partenaire désactivait/grisait visuellement les
  // boutons de TOUS les autres partenaires de la liste pendant l'appel réseau
  // (aucun mauvais envoi ne partait réellement, mais l'admin le percevait comme
  // "le bouton s'active pour tous"). Un id précis (plutôt qu'un booléen global)
  // permet de ne griser que le bouton de la ligne réellement concernée.
  const [foundingRowActionId, setFoundingRowActionId] = useState(null);
  // CRM Directory
  const [foundingView,      setFoundingView]     = useState("onboarding"); // "onboarding" | "crm"
  const [foundingCRMFilter, setFoundingCRMFilter]= useState("");           // crmStatus filter
  const [foundingCRMEdit,   setFoundingCRMEdit]  = useState(null);         // { id, data: {...} }

  const loadFoundingPartners = useCallback(async () => {
    if (!token) return;
    setFoundingLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetchPaged("/api/partner-onboarding/admin/list", { limit: 5000, pageSize: 100, key: "onboardings" }),
        fetch("/api/partner-onboarding/admin/stats",          { headers }),
      ]);
      // Toutes les pages (fetchPaged) — l'onglet n'en montrait que 100.
      setFoundingList(listRes.items || []);
      if (statsRes.ok) setFoundingStats(await statsRes.json());
    } catch { /* ignore */ }
    setFoundingLoading(false);
  }, [token, headers, fetchPaged]);

  const foundingApprove = async (id, note) => {
    if (foundingSubmitting) return; // évite le double-clic (double envoi de LOI)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/approve`, {
        method: "POST", headers,
        body: JSON.stringify({ note: note || "" }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "loi", companyName: company });
      showToast("Candidature approuvée — LOI envoyée par email", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingSendAgreement = async (id) => {
    if (foundingRowActionId) return; // évite le double-clic (double envoi de l'accord)
    setFoundingRowActionId(id);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/send-agreement`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: "agreement", companyName: company });
      showToast("Accord envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Renvoie un lien de signature FRAIS (LOI ou Accord, selon le statut actuel)
  // dans un seul email — remplace l'ancien bouton "Renvoyer l'accord" qui
  // appelait send-agreement (lequel exige status "loi_signee" et échouait donc
  // systématiquement une fois l'accord déjà envoyé), et comble l'absence totale
  // de moyen de renvoyer une LOI dont le lien a expiré ou ne s'est pas ouvert.
  const foundingResendDocuments = async (id) => {
    if (foundingRowActionId) return;
    setFoundingRowActionId(id);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/resend-documents`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      const company = foundingList.find(o => o._id === id)?.companyInfo?.legalName || "Partenaire";
      setFoundingSignLink({ id, link: data.signLink, type: data.status === "loi_envoyee" ? "loi" : "agreement", companyName: company });
      showToast("Nouveau lien de signature envoyé par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Relance une entité SANS AUCUN dossier Founding Partner (voir adminList,
  // lignes "orphanRows" — un partenaire ayant une entité PartnerBusiness mais
  // n'ayant jamais cliqué "Commencer ma candidature"). `id` est ici l'ID de
  // l'entité (PartnerBusiness), pas d'un PartnerOnboarding — il n'en existe pas.
  const foundingRelaunchBusiness = async (businessId) => {
    if (foundingRowActionId) return;
    setFoundingRowActionId(businessId);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/relaunch-business/${businessId}`, {
        method: "POST", headers,
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Invitation à démarrer sa candidature envoyée par email", "success");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingRowActionId(null); }
  };

  // Relance un dossier resté incomplet (brouillon jamais soumis, ou déjà relancé
  // une première fois) — endpoint backend existant depuis longtemps
  // (adminRequestInfo) mais jusqu'ici jamais appelé depuis cette interface : un
  // partenaire ayant sauté des étapes n'avait aucun moyen d'être notifié pour
  // compléter son dossier.
  const foundingRequestInfo = async (id, infoRequested) => {
    if (!infoRequested?.trim()) { showToast("Précisez ce qui doit être complété", "error"); return; }
    if (foundingSubmitting) return;
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/request-info`, {
        method: "POST", headers,
        body: JSON.stringify({ infoRequested }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Partenaire relancé — notification envoyée", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingReject = async (id, note) => {
    if (!note?.trim()) { showToast("Note de rejet requise", "error"); return; }
    if (foundingSubmitting) return; // évite le double-clic (double rejet)
    setFoundingSubmitting(true);
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/reject`, {
        method: "POST", headers,
        body: JSON.stringify({ note }),
      });
      if (!r.ok) { showToast("Erreur", "error"); return; }
      showToast("Dossier rejeté", "success");
      setFoundingAction(null);
      setFoundingNote("");
      loadFoundingPartners();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setFoundingSubmitting(false); }
  };

  const foundingUpdateCRM = async (id, data) => {
    try {
      const r = await fetch(`/api/partner-onboarding/admin/${id}/crm`, {
        method: "PATCH", headers,
        body: JSON.stringify(data),
      });
      const json = await r.json();
      if (!r.ok) { showToast(json.message || "Erreur CRM", "error"); return; }
      showToast("CRM mis à jour", "success");
      setFoundingCRMEdit(null);
      setFoundingList((prev) => prev.map((o) =>
        o._id === id ? { ...o, adminCRM: json.adminCRM } : o
      ));
    } catch { showToast("Erreur réseau", "error"); }
  };

  return {
    foundingAction, foundingApprove, foundingCRMEdit, foundingCRMFilter, foundingDetail,
    foundingList, foundingLoading, foundingNote, foundingReject, foundingRelaunchBusiness,
    foundingRequestInfo, foundingResendDocuments, foundingRowActionId, foundingSendAgreement, foundingSignLink,
    foundingStats, foundingSubmitting, foundingUpdateCRM, foundingView, loadFoundingPartners,
    setFoundingAction, setFoundingCRMEdit, setFoundingCRMFilter, setFoundingDetail, setFoundingNote,
    setFoundingSignLink, setFoundingView,
  };
}
