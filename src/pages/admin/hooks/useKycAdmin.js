import { useState, useCallback, useEffect } from "react";

// KYC / identités : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useKycAdmin({
  headers, showToast, token,
}) {
  // KYC Admin
  const [kycList,       setKycList]       = useState([]);
  const [kycTotal,      setKycTotal]      = useState(0);
  const [kycLimit,      setKycLimit]      = useState(50);
  const [kycLoading,    setKycLoading]    = useState(false);
  // "ALL" par défaut — un défaut sur "EN_ATTENTE" rendait un compte déjà
  // vérifié/refusé introuvable dans cet onglet tant que l'admin ne pensait pas
  // à cliquer sur le filtre correspondant (le backend gérait déjà ce cas, voir
  // getKycList, mais le défaut front ne l'exploitait pas).
  const [kycFilter,     setKycFilter]     = useState("ALL");
  const [kycSearch,     setKycSearch]     = useState("");
  const [kycDetailUser, setKycDetailUser] = useState(null);
  const [kycDetailLoading, setKycDetailLoading] = useState(false);
  const [kycReviewForm, setKycReviewForm] = useState({ decision: "VERIFIE", note: "" });
  const [kycReviewLoading, setKycReviewLoading] = useState(false);
  const [kycReviewMsg,  setKycReviewMsg]  = useState("");
  // Compteur "en attente" indépendant du filtre actuellement affiché (kycList
  // change selon kycFilter — un badge calculé dessus mentirait dès que l'admin
  // clique sur un autre filtre, voir loadKycPendingTotal ci-dessous).
  const [kycPendingTotal, setKycPendingTotal] = useState(0);

  // Bug réel corrigé (audit) : plafonné à 50, trié du plus récent au plus
  // ancien, sans aucune pagination — les dossiers les plus ANCIENS (donc les
  // plus en retard de traitement) disparaissaient silencieusement en premier
  // dès que le nombre de dossiers dépassait 50. `limit` paramétrable +
  // `kycTotal` renvoyé par le backend permettent désormais un "Charger plus"
  // réel plutôt qu'un plafond invisible.
  const loadKycList = useCallback(async (status = "", limit = kycLimit) => {
    if (!token) return;
    setKycLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set("status", status);
      const r = await fetch(`/api/kyc/admin/list?${params}`, { headers });
      if (r.ok) { const d = await r.json(); setKycList(d.users || []); setKycTotal(d.total || 0); }
    } catch { /* ignore */ }
    setKycLoading(false);
  }, [token, headers, kycLimit]);

  const loadMoreKyc = useCallback(() => {
    const next = kycLimit + 100;
    setKycLimit(next);
    // "ALL" est compris par le serveur (aucun filtre) ; le convertir en ""
    // faisait basculer « Charger plus » sur les seuls dossiers en attente.
    loadKycList(kycFilter, next);
  }, [kycLimit, kycFilter, loadKycList]);

  // Compteur "en attente" — toujours interrogé SANS filtre de statut (le backend
  // applique alors son défaut EN_ATTENTE + A_REVOIR_MANUELLEMENT, voir
  // kycController.getKycList) donc jamais affecté par le filtre choisi dans l'UI.
  const loadKycPendingTotal = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch("/api/kyc/admin/list?limit=1", { headers });
      if (r.ok) { const d = await r.json(); setKycPendingTotal(d.total || 0); }
    } catch { /* ignore */ }
  }, [token, headers]);

  useEffect(() => { loadKycPendingTotal(); }, [loadKycPendingTotal]);

  // Ouvre le dossier KYC — charge le détail complet (photos recto/verso/selfie,
  // permis de conduire...) depuis /api/kyc/admin/:userId, car la LISTE exclut
  // volontairement ces images base64 (trop lourdes pour un listing de 50 dossiers).
  const openKycDetail = useCallback(async (u) => {
    setKycDetailUser(u);
    setKycReviewForm({ decision: u.kycStatus === "VERIFIE" ? "EN_ATTENTE" : "VERIFIE", note: "" });
    setKycReviewMsg("");
    setKycDetailLoading(true);
    try {
      const r = await fetch(`/api/kyc/admin/${u._id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setKycDetailUser(d.user);
      }
    } catch { /* garde les données de la liste en cas d'échec réseau */ }
    setKycDetailLoading(false);
  }, [headers]);

  const handleKycReview = async (userId) => {
    setKycReviewLoading(true); setKycReviewMsg("");
    try {
      const r = await fetch(`/api/kyc/admin/${userId}/review`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(kycReviewForm),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        // La confirmation s'affichait DANS la fenêtre du dossier, fermée à la
        // ligne suivante : l'admin ne voyait rien et croyait la validation en
        // échec alors qu'elle était enregistrée (2026-10-06, dossier Sangare).
        // Toast global + mise à jour immédiate de la ligne dans la liste.
        const libelles = { VERIFIE: "validé", REFUSE: "refusé", A_REVOIR_MANUELLEMENT: "mis en révision", EN_ATTENTE: "remis en attente" };
        const nom = `${kycDetailUser?.firstName || ""} ${kycDetailUser?.lastName || ""}`.trim() || "Le dossier";
        showToast(`✅ Dossier KYC de ${nom} ${libelles[kycReviewForm.decision] || kycReviewForm.decision}.`);
        setKycList((liste) => liste.map((u) => (u._id === userId ? { ...u, kycStatus: kycReviewForm.decision } : u)));
        setKycReviewMsg("");
        setKycDetailUser(null);
        loadKycList(kycFilter);
        loadKycPendingTotal();
      } else {
        setKycReviewMsg(`❌ ${d.message || "Erreur."}`);
      }
    } catch { setKycReviewMsg("❌ Connexion impossible."); }
    setKycReviewLoading(false);
  };

  return {
    handleKycReview, kycDetailLoading, kycDetailUser, kycFilter, kycList,
    kycLoading, kycPendingTotal, kycReviewForm, kycReviewLoading, kycReviewMsg,
    kycSearch, kycTotal, loadKycList, loadMoreKyc, openKycDetail,
    setKycDetailUser, setKycFilter, setKycReviewForm, setKycSearch,
  };
}
