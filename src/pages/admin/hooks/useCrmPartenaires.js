import { useState, useCallback, useEffect } from "react";

// CRM partenaires : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useCrmPartenaires({
  CRM_PAR_PAGE, headers, showToast, token,
}) {
  // ── CRM Partenaires (pipeline de prospection à 9 étapes) ──────────────────
  const [crmList,      setCrmList]      = useState([]);
  const [crmStats,     setCrmStats]     = useState(null);
  const [crmLoading,   setCrmLoading]   = useState(false);
  const [crmView,      setCrmView]      = useState("liste"); // "liste" | "pipeline"
  const [crmFilter,    setCrmFilter]    = useState({ statut: "", pays: "", secteur: "", assignedTo: "", source: "", aRelancer: false });
  const [crmPage,      setCrmPage]      = useState(1);
  const [crmTotal,     setCrmTotal]     = useState(0);
  const [crmErreur,    setCrmErreur]    = useState("");
  const [crmDoublons,  setCrmDoublons]  = useState(null); // correspondances signalées à la création
  const [crmSearch,    setCrmSearch]    = useState("");
  const [crmDetail,    setCrmDetail]    = useState(null); // dossier ouvert (modal détail)
  const [crmDetailData, setCrmDetailData] = useState(null); // { crm, liveStats }
  const [crmEditData,  setCrmEditData]  = useState(null); // formulaire d'édition du détail
  const [crmCreating,  setCrmCreating]  = useState(false);
  const [crmNewForm,   setCrmNewForm]   = useState({
    entreprise: "", pays: "", ville: "", secteur: "",
    contactNom: "", contactTel: "", contactEmail: "", website: "",
    source: "", assignedTo: "", priority: "medium",
  });
  const [crmSubmitting, setCrmSubmitting] = useState(false);
  const [crmLinkUserId, setCrmLinkUserId] = useState("");

  // ── CRM Partenaires (pipeline de prospection à 9 étapes) ──────────────────
  const loadPartnerCrm = useCallback(async () => {
    if (!token) return;
    setCrmLoading(true);
    setCrmErreur("");
    try {
      const params = new URLSearchParams({ limit: String(CRM_PAR_PAGE), page: String(crmPage) });
      if (crmFilter.statut)     params.set("statut", crmFilter.statut);
      if (crmFilter.pays)       params.set("pays", crmFilter.pays);
      if (crmFilter.secteur)    params.set("secteur", crmFilter.secteur);
      if (crmFilter.assignedTo) params.set("assignedTo", crmFilter.assignedTo);
      if (crmFilter.source)     params.set("source", crmFilter.source);
      if (crmFilter.aRelancer)  params.set("aRelancer", "1");
      if (crmSearch)            params.set("search", crmSearch);
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/partner-crm/admin/list?${params}`, { headers }),
        fetch("/api/partner-crm/admin/stats",           { headers }),
      ]);
      // Une erreur s'affiche comme une erreur — jamais comme « aucun prospect ».
      if (listRes.ok) {
        const l = await listRes.json();
        setCrmList(l.items || []);
        setCrmTotal(l.total || 0);
      } else {
        setCrmErreur((await listRes.json().catch(() => ({}))).message || `Chargement impossible (${listRes.status}).`);
      }
      if (statsRes.ok) setCrmStats(await statsRes.json());
    } catch { setCrmErreur("Erreur réseau : la liste n'a pas pu être chargée."); }
    setCrmLoading(false);
  }, [token, headers, crmFilter, crmSearch, crmPage, CRM_PAR_PAGE]);
  // Nouveau filtre ou nouvelle recherche : retour à la première page.
  useEffect(() => { setCrmPage(1); }, [crmFilter, crmSearch]);

  const crmCreateProspect = async (confirmerDoublon = false) => {
    if (crmSubmitting) return;
    if (!crmNewForm.entreprise.trim()) { showToast("Le nom de l'entreprise est requis", "error"); return; }
    setCrmSubmitting(true);
    try {
      const r = await fetch("/api/partner-crm/admin", {
        method: "POST", headers,
        body: JSON.stringify({ ...crmNewForm, confirmerDoublon }),
      });
      const data = await r.json();
      if (r.status === 409 && data.code === "DOUBLON_POSSIBLE") { setCrmDoublons(data.doublons || []); return; }
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Prospect créé", "success");
      setCrmDoublons(null);
      setCrmCreating(false);
      setCrmNewForm({ entreprise: "", pays: "", ville: "", secteur: "", contactNom: "", contactTel: "", contactEmail: "", website: "", source: "", assignedTo: "", priority: "medium" });
      loadPartnerCrm();
    } catch { showToast("Erreur réseau", "error"); }
    finally { setCrmSubmitting(false); }
  };

  const crmAdvanceStatut = async (id, statut) => {
    try {
      const r = await fetch(`/api/partner-crm/admin/${id}/statut`, {
        method: "PATCH", headers,
        body: JSON.stringify({ statut }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast(`Étape → ${statut}`, "success");
      setCrmList((prev) => prev.map((c) => c._id === id ? { ...c, statut, dateInscription: data.dateInscription || c.dateInscription } : c));
      loadPartnerCrm();
    } catch { showToast("Erreur réseau", "error"); }
  };

  const crmOpenDetail = async (id) => {
    setCrmDetail(id);
    setCrmDetailData(null);
    setCrmEditData(null);
    try {
      const r = await fetch(`/api/partner-crm/admin/${id}`, { headers });
      if (r.ok) {
        const data = await r.json();
        setCrmDetailData(data);
        setCrmEditData({
          entreprise: data.crm.entreprise || "", pays: data.crm.pays || "", ville: data.crm.ville || "",
          secteur: data.crm.secteur || "", contactNom: data.crm.contactNom || "", contactTel: data.crm.contactTel || "",
          contactEmail: data.crm.contactEmail || "", website: data.crm.website || "",
          internalNotes: data.crm.internalNotes || "", source: data.crm.source || "",
          prochaineAction: data.crm.prochaineAction || "",
          priority: data.crm.priority || "medium", assignedTo: data.crm.assignedTo?._id || "",
          lastContactDate: data.crm.lastContactDate ? new Date(data.crm.lastContactDate).toISOString().slice(0, 10) : "",
          lastContactChannel: data.crm.lastContactChannel || "",
          nextFollowUpDate: data.crm.nextFollowUpDate ? new Date(data.crm.nextFollowUpDate).toISOString().slice(0, 10) : "",
          commissionTaux: data.crm.commission?.taux ?? "", commissionNotes: data.crm.commission?.notes || "",
          contratReference: data.crm.contrat?.reference || "", contratUrl: data.crm.contrat?.url || "",
          services: (data.crm.services || []).join(", "),
        });
      }
    } catch { showToast("Erreur réseau", "error"); }
  };

  const crmSaveDetail = async () => {
    if (!crmDetail || !crmEditData) return;
    setCrmSubmitting(true);
    try {
      const r = await fetch(`/api/partner-crm/admin/${crmDetail}`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          ...crmEditData,
          services: crmEditData.services.split(",").map((s) => s.trim()).filter(Boolean),
          commission: { taux: crmEditData.commissionTaux === "" ? null : Number(crmEditData.commissionTaux), notes: crmEditData.commissionNotes },
          contrat: { reference: crmEditData.contratReference, url: crmEditData.contratUrl },
        }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Prospect mis à jour", "success");
      loadPartnerCrm();
      crmOpenDetail(crmDetail);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setCrmSubmitting(false); }
  };

  const crmLinkAccount = async () => {
    if (!crmDetail || !crmLinkUserId.trim()) return;
    setCrmSubmitting(true);
    try {
      const r = await fetch(`/api/partner-crm/admin/${crmDetail}/link`, {
        method: "PATCH", headers,
        body: JSON.stringify({ userId: crmLinkUserId.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { showToast(data.message || "Erreur", "error"); return; }
      showToast("Compte lié avec succès", "success");
      setCrmLinkUserId("");
      loadPartnerCrm();
      crmOpenDetail(crmDetail);
    } catch { showToast("Erreur réseau", "error"); }
    finally { setCrmSubmitting(false); }
  };

  return {
    crmAdvanceStatut, crmCreateProspect, crmCreating, crmDetail, crmDetailData,
    crmDoublons, crmEditData, crmErreur, crmFilter, crmLinkAccount,
    crmLinkUserId, crmList, crmLoading, crmNewForm, crmOpenDetail,
    crmPage, crmSaveDetail, crmSearch, crmStats, crmSubmitting,
    crmTotal, crmView, loadPartnerCrm, setCrmCreating, setCrmDetail,
    setCrmDoublons, setCrmEditData, setCrmFilter, setCrmLinkUserId, setCrmNewForm,
    setCrmPage, setCrmSearch, setCrmView,
  };
}
