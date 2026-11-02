import { useState, useCallback } from "react";

// Demandes d'assistance et essais Pro : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useAssistance({
  headers, loadSubRequests, token,
}) {
  // File de la billetterie d'assistance — distincte des conversations : un
  // ticket porte une échéance de première réponse dérivée du palier du
  // partenaire, ce qu'un chat n'a pas.
  const [tickets,         setTickets]         = useState([]);
  // Filtre de statut de la file d'assistance : vide = demandes en cours.
  // Sans lui, les demandes résolues ou clôturées n'étaient JAMAIS visibles
  // (le serveur les exclut par défaut) — audit admin du 2026-10-05.
  const [ticketsStatut,   setTicketsStatut]   = useState("");
  const [ticketsEnRetard, setTicketsEnRetard] = useState(0);
  const [ticketOuvert,    setTicketOuvert]    = useState(null);
  const [ticketReponse,   setTicketReponse]   = useState("");

  // Essai gratuit accordé par le support. Aucune passerelle de paiement n'étant
  // branchée, c'est aujourd'hui le seul moyen de faire constater à un partenaire
  // ce qu'un palier contient.
  const [essaiRecherche, setEssaiRecherche] = useState("");
  const [essaiResultats, setEssaiResultats] = useState([]);
  const [essaiVendeur,   setEssaiVendeur]   = useState(null);
  const [essaiPalier,    setEssaiPalier]    = useState("business");
  const [essaiRetour,    setEssaiRetour]    = useState(null);

  // ── Support Client ──────────────────────────────────────────────────────────
  const chercherPartenaireEssai = useCallback(async (query) => {
    setEssaiRecherche(query);
    setEssaiVendeur(null);
    // La liste `users` du tableau de bord est PAGINÉE : s'en servir aurait
    // rendu invisibles tous les partenaires au-delà de la première page. La
    // recherche interroge donc le serveur, comme le transfert d'activité.
    if (query.trim().length < 2) { setEssaiResultats([]); return; }
    try {
      const r = await fetch(`/api/users?search=${encodeURIComponent(query.trim())}&role=partenaire&limit=6`, { headers });
      if (r.ok) { const d = await r.json(); setEssaiResultats(d.users || []); }
    } catch { /* recherche non bloquante */ }
  }, [headers]);

  const accorderEssai = useCallback(async () => {
    if (!essaiVendeur) return;
    setEssaiRetour(null);
    // Route ADMIN (`/admin/:vendorId/trial`) — l'omettre visait une route
    // inexistante et renvoyait un 404 silencieux dans l'interface.
    const r = await fetch(`/api/subscriptions/admin/${essaiVendeur._id}/trial`, {
      method: "POST", headers, body: JSON.stringify({ planTier: essaiPalier }),
    });
    const d = await r.json().catch(() => ({}));
    setEssaiRetour({ ok: r.ok, message: d.message || (r.ok ? "Essai accordé." : "Échec.") });
    if (r.ok) { setEssaiVendeur(null); setEssaiRecherche(""); setEssaiResultats([]); loadSubRequests(); }
  }, [headers, essaiVendeur, essaiPalier, loadSubRequests]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/support/admin/tickets${ticketsStatut ? `?status=${ticketsStatut}` : ""}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setTickets(d.tickets || []);
        setTicketsEnRetard(d.enRetard || 0);
      }
    } catch { /* ignore */ }
  }, [token, headers, ticketsStatut]);

  const repondreTicket = useCallback(async (id, content) => {
    if (!content?.trim()) return;
    const r = await fetch(`/api/support/tickets/${id}/messages`, {
      method: "POST", headers, body: JSON.stringify({ content }),
    });
    if (r.ok) { setTicketReponse(""); loadTickets(); }
  }, [headers, loadTickets]);

  const changerStatutTicket = useCallback(async (id, status) => {
    const r = await fetch(`/api/support/admin/tickets/${id}`, {
      method: "PATCH", headers, body: JSON.stringify({ status }),
    });
    if (r.ok) { setTicketOuvert(null); loadTickets(); }
  }, [headers, loadTickets]);

  return {
    accorderEssai, changerStatutTicket, chercherPartenaireEssai, essaiPalier, essaiRecherche,
    essaiResultats, essaiRetour, essaiVendeur, loadTickets, repondreTicket,
    setEssaiPalier, setEssaiResultats, setEssaiVendeur, setTicketOuvert, setTicketReponse,
    setTicketsStatut, ticketOuvert, ticketReponse, tickets, ticketsEnRetard,
    ticketsStatut,
  };
}
