import { useState, useCallback } from "react";

// Santé système : état et actions sortis d'AdminPanel.jsx le 2026-11-02, à l'identique.
export default function useSanteSysteme({
  headers,
}) {
  // ── Santé système (2026-09) — /api/health existait déjà, jamais affiché
  // ailleurs qu'en curl manuel. Pas de nouvel endpoint : juste une vue.
  const [systemHealth,        setSystemHealth]        = useState(null);
  const [systemHealthLoading, setSystemHealthLoading]  = useState(false);
  const loadSystemHealth = useCallback(async () => {
    setSystemHealthLoading(true);
    try {
      // /api/health renvoie 503 quand le système est DÉGRADÉ — soit le seul cas
      // que cet écran de diagnostic doit couvrir. En ne lisant que les réponses
      // 2xx, l'admin voyait « impossible de joindre /api/health » alors que la
      // réponse contenait précisément « database: disconnected ».
      // En-tête d'authentification indispensable depuis que /api/health ne
      // renvoie le détail qu'à un administrateur (le public n'obtient plus que
      // l'état de santé, pour ne pas divulguer l'inventaire du service).
      const r = await fetch("/api/health", { headers });
      const d = await r.json().catch(() => null);
      if (d) setSystemHealth(d);
      else setSystemHealth({ status: "unreachable", error: `HTTP ${r.status}` });
    } catch { setSystemHealth({ status: "unreachable", error: "réseau injoignable" }); }
    setSystemHealthLoading(false);
  }, [headers]);

  return {
    loadSystemHealth, systemHealth, systemHealthLoading,
  };
}
