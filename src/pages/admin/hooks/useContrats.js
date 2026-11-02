import { useState, useCallback } from "react";

// Contrats de réservation : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useContrats({
  headers, token,
}) {
  // Journal d'audit
  // Contrats de réservation (Contract) — aucun écran admin n'existait : la
  // donnée n'était consultable que par le partenaire propriétaire, alors que
  // c'est une pièce contractuelle (identité client, montants, signature).
  const [contracts,        setContracts]        = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);

  // ── Journal d'audit ──────────────────────────────────────────────────────────
  const loadContracts = useCallback(async () => {
    if (!token) return;
    setContractsLoading(true);
    try {
      const r = await fetch("/api/contracts/mine", { headers });
      if (r.ok) setContracts((await r.json()).contracts || []);
    } catch { /* ignore */ }
    setContractsLoading(false);
  }, [token, headers]);

  return {
    contracts, contractsLoading, loadContracts,
  };
}
