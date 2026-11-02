import { useState, useCallback } from "react";

// Commissions et factures : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useCommissionsFactures({
  fetchPaged, headers, token,
}) {
  // Commissions & Factures
  const [commissions,      setCommissions]      = useState([]);
  const [commissionsStats, setCommissionsStats] = useState(null);
  const [invoices,         setInvoices]         = useState([]);
  const [invoicesStats,    setInvoicesStats]    = useState(null);
  const [invoiceLoading,   setInvoiceLoading]   = useState(false);
  const [invoiceYear,      setInvoiceYear]      = useState(new Date().getFullYear());
  const [invoiceMonth,     setInvoiceMonth]     = useState("");

  const [generateForm,     setGenerateForm]     = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const [generating,       setGenerating]       = useState(false);

  const loadCommissions = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ year: invoiceYear });
      if (invoiceMonth) params.set("month", invoiceMonth);
      const r = await fetch(`/api/invoices/commissions?${params}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setCommissions(d.bookings || []);
        setCommissionsStats({ total: d.totalCommissions, transactions: d.totalTransactions, count: d.count });
      }
    } catch { /* ignore */ }
  }, [token, headers, invoiceYear, invoiceMonth]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    setInvoiceLoading(true);
    try {
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items } = await fetchPaged("/api/invoices", { limit: 5000, pageSize: 100, key: "invoices" });
      setInvoices(items);
      const r = await fetch("/api/invoices?limit=1", { headers });
      if (r.ok) {
        const d = await r.json();
        setInvoicesStats({ totalPaid: d.totalPaid, totalPending: d.totalPending });
      }
    } catch { /* ignore */ }
    setInvoiceLoading(false);
  }, [token, headers, fetchPaged]);

  // Factures de PRESTATION (une par commande terminée, voir issueServiceInvoice
  // dans bookingController.js) — distinctes des factures mensuelles de commission
  // ci-dessus (ce que le partenaire doit à VIT AUTO) : ici, ce que le partenaire
  // a encaissé/à percevoir, enregistré côté admin pour supervision.
  const [serviceInvoicesAdmin, setServiceInvoicesAdmin] = useState([]);
  const [serviceInvoicesAdminLoading, setServiceInvoicesAdminLoading] = useState(false);
  const loadServiceInvoicesAdmin = useCallback(async () => {
    if (!token) return;
    setServiceInvoicesAdminLoading(true);
    try {
      // Toutes les pages (fetchPaged) : la 1re page de 100 seulement rendait
      // les enregistrements plus anciens inaccessibles (audit du 2026-10-05).
      const { items } = await fetchPaged("/api/service-invoices", { limit: 5000, pageSize: 100, key: "invoices" });
      setServiceInvoicesAdmin(items);
    } catch { /* ignore */ }
    setServiceInvoicesAdminLoading(false);
  }, [token, fetchPaged]);

  return {
    commissions, commissionsStats, generateForm, generating, invoiceLoading,
    invoiceMonth, invoiceYear, invoices, invoicesStats, loadCommissions,
    loadInvoices, loadServiceInvoicesAdmin, serviceInvoicesAdmin, serviceInvoicesAdminLoading, setGenerateForm,
    setGenerating, setInvoiceMonth, setInvoiceYear,
  };
}
