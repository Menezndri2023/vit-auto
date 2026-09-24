import { describe, it, expect, beforeEach, vi } from "vitest";
import CommunicationLog from "../models/CommunicationLog.js";
import { estAdresseSupprimee, SEUIL_REBONDS } from "../utils/suppressionEmail.js";
import { TYPES_ALERTE_IMMEDIATE } from "../utils/adminAlertEmail.js";
import { cacheClear } from "../utils/catalogCache.js";

// ═══════════════════════════════════════════════════════════════════════════
// NE PLUS ÉCRIRE À CE QUI NE RÉPOND PAS
// ═══════════════════════════════════════════════════════════════════════════
// Relevé de production du 2026-09-24 : après le garde-fou « comptes de test »
// du 13/09, il restait 20 échecs sur 250 envois — dont 19 vers TROIS adresses
// de VIT AUTO elle-même (la boîte admin @vitauto.ci, et les deux comptes de
// démonstration Apple, qui sont fonctionnels mais sans boîte réelle). Aucun
// n'était détectable par domaine réservé. Chaque rebond dégrade la réputation
// d'envoi pour les clients qui, eux, attendent leur confirmation.

const rebond = (to, n = SEUIL_REBONDS) =>
  CommunicationLog.insertMany(
    Array.from({ length: n }, () => ({ to, channel: "email", status: "bounced", createdAt: new Date() })),
  );

describe("Suppression des adresses qui rebondissent", () => {
  beforeEach(() => cacheClear());

  it("cesse d'écrire à une adresse qui a rebondi deux fois", async () => {
    await rebond("admin@vitauto.ci");
    expect(await estAdresseSupprimee("admin@vitauto.ci")).toBe(true);
  });

  it("laisse passer une adresse qui n'a rebondi qu'une fois", async () => {
    await rebond("client@exemple.fr", 1);
    expect(await estAdresseSupprimee("client@exemple.fr")).toBe(false);
  });

  it("n'enferme personne dehors : vérification et mot de passe partent quand même", async () => {
    await rebond("bloque@exemple.fr");
    expect(await estAdresseSupprimee("bloque@exemple.fr", "password_reset")).toBe(false);
    expect(await estAdresseSupprimee("bloque@exemple.fr", "email_verification")).toBe(false);
    // Tout le reste est bien écarté.
    expect(await estAdresseSupprimee("bloque@exemple.fr", "generic_notification")).toBe(true);
  });

  it("ignore la casse — Resend ne distingue pas les majuscules", async () => {
    await rebond("mixte@exemple.fr");
    expect(await estAdresseSupprimee("MIXTE@Exemple.FR")).toBe(true);
  });

  it("un envoi groupé part tant qu'un destinataire répond encore", async () => {
    await rebond("mort@exemple.fr");
    expect(await estAdresseSupprimee(["mort@exemple.fr", "vivant@exemple.fr"])).toBe(false);
    expect(await estAdresseSupprimee(["mort@exemple.fr"])).toBe(true);
  });

  it("ne bloque rien quand le journal est illisible — un rebond vaut mieux qu'un silence", async () => {
    cacheClear();
    const espion = vi.spyOn(CommunicationLog, "aggregate").mockRejectedValueOnce(new Error("base indisponible"));
    expect(await estAdresseSupprimee("quiconque@exemple.fr")).toBe(false);
    espion.mockRestore();
  });

  it("oublie un rebond trop ancien — une boîte pleine se vide", async () => {
    await CommunicationLog.insertMany(
      Array.from({ length: 5 }, () => ({
        to: "ancien@exemple.fr", channel: "email", status: "bounced",
        createdAt: new Date(Date.now() - 200 * 86400000),
      })),
    );
    expect(await estAdresseSupprimee("ancien@exemple.fr")).toBe(false);
  });
});

describe("Alertes admin — seul l'urgent part par e-mail", () => {
  it("garde l'argent, les litiges, la sécurité et les pannes", () => {
    for (const t of ["system", "ie_dispute", "ie_payment", "report", "email_bounce"]) {
      expect(TYPES_ALERTE_IMMEDIATE.has(t)).toBe(true);
    }
  });

  // Les rapports REMPLACENT les alertes unitaires : les couper viderait la
  // boîte de tout ce qui a de la valeur. Ils ont leur type propre — le rapport
  // hebdomadaire partageait « sales_lead » avec chaque prospect individuel,
  // donc l'autoriser aurait rouvert la porte à tout le reste.
  it("garde les deux rapports, et EUX SEULS parmi les périodiques", () => {
    expect(TYPES_ALERTE_IMMEDIATE.has("rapport_admin")).toBe(true);
    expect(TYPES_ALERTE_IMMEDIATE.has("sales_lead")).toBe(false);
  });

  // Ces trois-là étaient typés « system » et passaient donc pour des pannes.
  it("écarte les dossiers administratifs, qui n'ont rien de systémique", () => {
    for (const t of ["dossier_admin", "dossier_partenaire"]) {
      expect(TYPES_ALERTE_IMMEDIATE.has(t)).toBe(false);
    }
  });

  // 30 des 54 copies admin d'un mois portaient sur des annonces à valider, et
  // l'e-mail de la notification interne les doublait — 60 messages pour 30
  // évènements. Le récapitulatif quotidien les couvre en un seul.
  it("écarte ce qui peut attendre le récapitulatif du lendemain", () => {
    for (const t of ["new_vehicle", "booking_pending_review", "kyc_submitted", "support_ticket", "new_driver", "sales_lead"]) {
      expect(TYPES_ALERTE_IMMEDIATE.has(t)).toBe(false);
    }
  });
});
