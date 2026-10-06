import { describe, it, expect } from "vitest";
import {
  generateInvoicePDFBuffer, generateReceiptPDFBuffer, generateEmploymentContractPDFBuffer, generateServiceInvoicePDFBuffer,
} from "../utils/pdfGenerator.js";

// Chaque document PDF doit se générer, y compris avec des montants à
// séparateur de milliers, des statuts à émoji et des activités/pièces —
// 2026-10-05 : bandeaux vides, titres invisibles, « 12 /500 MAD », émojis
// brouillés. La vérification visuelle reste manuelle (rendu pdf.js) ; ce test
// garantit au moins qu'aucune régression n'empêche la génération.
const estPdf = (buf) => Buffer.isBuffer(buf) && buf.length > 1000 && buf.subarray(0, 5).toString() === "%PDF-";

describe("Génération des PDF", () => {
  it("facture de commission", async () => {
    const lignes = [{ bookingRef: "LOC-1", serviceType: "location", montantTransaction: 12500, commissionAmount: 1875 }, { bookingRef: "ACT-1", serviceType: "activite", montantTransaction: 4000, commissionAmount: 600 }];
    expect(estPdf(await generateInvoicePDFBuffer({ reference: "VIT-INV-1", month: 6, year: 2026, createdAt: new Date(), dueDate: new Date(), status: "pending", partner: { firstName: "A", lastName: "B" }, lines: lignes, totalCommission: 2475, devise: "MAD" }))).toBe(true);
  });

  it("reçu de réservation", async () => {
    expect(estPdf(await generateReceiptPDFBuffer({ reference: "LOC-1", type: "location", status: "pending", createdAt: new Date(), clientInfo: { firstName: "Awa", lastName: "Koné" }, vehicle: { title: "Yaris" }, location: { startDate: new Date(), endDate: new Date(), days: 1 }, montantTotal: 375000, devise: "XOF", transaction: { paymentMethod: "cash" } }))).toBe(true);
  });

  it("proposition d'embauche chauffeur", async () => {
    expect(estPdf(await generateEmploymentContractPDFBuffer({ _id: "6ac40c9d122c3cacb076c482", contractType: "cdd", status: "accepted", currency: "MAD", proposedSalary: 6500, startDate: new Date(), location: { ville: "Casablanca", country: "MA" }, driver: { firstName: "Y", lastName: "A" } }))).toBe(true);
  });

  it("facture de prestation (activité de loisirs)", async () => {
    expect(estPdf(await generateServiceInvoicePDFBuffer({ _id: "6ac40c9d122c3cacb076c482", reference: "VIT-SRV-1", serviceType: "activite", paymentMethod: "cash", grossAmount: 12500, commissionAmount: 1875, commissionRate: 0.15, netPayout: 10625, currency: "MAD" }))).toBe(true);
  });
});
