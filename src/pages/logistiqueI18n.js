import { useMemo } from "react";
import { useI18n } from "../context/I18nContext";

// Outils de langue des espaces logistiques (2026-10-28) : traduction, dates
// et montants au format de la langue, noms de pays dans la langue du
// visiteur. Les libellés sont dans src/i18n/logistique.js (5 langues).

const LOCALES = { fr: "fr-FR", en: "en-GB", ar: "ar", es: "es-ES", zh: "zh-CN" };

export function useLog() {
  const { t, lang } = useI18n();
  return useMemo(() => {
    const locale = LOCALES[lang] || "fr-FR";
    let regions = null;
    try { regions = new Intl.DisplayNames([lang || "fr"], { type: "region" }); } catch { regions = null; }
    return {
      t, lang, locale,
      fmtDate: (d) => (d ? new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—"),
      fmtMontant: (n, devise) => (n == null ? "—" : `${Number(n).toLocaleString(locale)} ${devise || ""}`.trim()),
      nomPays: (code) => { if (!code) return "—"; try { return regions?.of(code) || code; } catch { return code; } },
      statut: (s) => t(`log.statut.${s}`),
      type: (c) => t(`log.type.${c}`),
      mode: (c) => t(`log.mode.${c}`),
      devis: (c) => t(`log.devis.${c}`),
      role: (c) => t(`log.role.${c}`),
      poste: (c) => t(`log.poste.${c}`),
      doc: (c) => t(`log.doc.${c}`),
      partie: (c) => t(`log.partie.${c}`),
      // La vue prestataire ne reçoit que le libellé (sans type) : on le
      // reconnaît pour le traduire.
      libCommande: (c) => {
        if (c?.type === "booking" || c?.libelle === "Commande de pièces détachées") return t("log.libCommandePiece");
        if (c?.type === "transaction" || c?.libelle === "Transaction VIT-AUTO Trade") return t("log.libTransaction");
        return c?.libelle || "";
      },
    };
  }, [t, lang]);
}
