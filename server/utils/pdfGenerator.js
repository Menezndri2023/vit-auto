import PDFDocument from "pdfkit";

const BRAND   = "#ff4d2d";
const NAVY    = "#0f1b3f";
const GRAY    = "#64748b";
const LGRAY   = "#f8fafc";
const WHITE   = "#ffffff";

function header(doc, title, ref) {
  // Fond bleu marine en haut
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);

  // Logo texte
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(26).text("VIT AUTO", 40, 22);
  doc.fillColor(BRAND).font("Helvetica").fontSize(10).text("Plateforme Automobile", 40, 52);

  // Titre document
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(14).text(title, 0, 30, { align: "right", width: doc.page.width - 40 });
  doc.fillColor(BRAND).font("Helvetica").fontSize(10).text(ref, 0, 50, { align: "right", width: doc.page.width - 40 });

  // Reset
  doc.fillColor(NAVY);
  doc.moveDown(3.5);
}

function footer(doc) {
  const bottom = doc.page.height - 50;
  doc.moveTo(40, bottom).lineTo(doc.page.width - 40, bottom).strokeColor("#e2e8f0").lineWidth(1).stroke();
  doc.fillColor(GRAY).font("Helvetica").fontSize(8)
    .text("VIT AUTO — Plateforme Automobile Internationale | www.vit-auto.com | contact@vit-auto.com", 40, bottom + 8, { align: "center", width: doc.page.width - 80 })
    .text("Ce document est généré automatiquement et ne nécessite pas de signature manuscrite.", 40, bottom + 20, { align: "center", width: doc.page.width - 80 });
}

function section(doc, title) {
  doc.rect(40, doc.y, doc.page.width - 80, 24).fill(LGRAY);
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11)
    .text(title.toUpperCase(), 50, doc.y - 22, { baseline: "middle" });
  doc.moveDown(1.2);
  doc.fillColor(NAVY).font("Helvetica").fontSize(10);
}

function row(doc, label, value, highlight = false) {
  const y = doc.y;
  if (highlight) doc.rect(40, y, doc.page.width - 80, 20).fill("#fff8f0");
  doc.fillColor(GRAY).text(label, 50, y + 4, { continued: false, width: 200 });
  doc.fillColor(highlight ? BRAND : NAVY).font("Helvetica-Bold")
    .text(value || "—", 260, y + 4, { width: doc.page.width - 300 });
  doc.font("Helvetica").fillColor(NAVY);
  doc.moveDown(0.9);
}

function fmtXOF(n) {
  return n != null && n !== 0
    ? `${Number(n).toLocaleString("fr-FR")} XOF`
    : "—";
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. FACTURE PARTENAIRE
// ══════════════════════════════════════════════════════════════════════════════
export function generateInvoicePDF(invoice, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="facture-${invoice.reference}.pdf"`);
  doc.pipe(res);

  header(doc, "FACTURE DE COMMISSION", invoice.reference);

  // ── Période ──────────────────────────────────────────────────────────────
  section(doc, "Période de facturation");
  row(doc, "Période", `${["", "Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][invoice.month] || ""} ${invoice.year}`);
  row(doc, "Date d'émission", fmtDate(invoice.createdAt || new Date()));
  row(doc, "Échéance", fmtDate(invoice.dueDate));
  row(doc, "Statut", invoice.status === "paid" ? "✅ Payée" : invoice.status === "overdue" ? "⚠️ En retard" : "🕐 À payer");
  doc.moveDown();

  // ── Partenaire ──────────────────────────────────────────────────────────
  if (invoice.partner) {
    section(doc, "Informations partenaire");
    row(doc, "Nom", `${invoice.partner.firstName || ""} ${invoice.partner.lastName || ""}`.trim());
    row(doc, "Email", invoice.partner.email);
    row(doc, "Téléphone", invoice.partner.phone);
    doc.moveDown();
  }

  // ── Lignes de commission ─────────────────────────────────────────────────
  if (invoice.lines?.length > 0) {
    section(doc, "Détail des commissions");
    const colRef  = 50;
    const colType = 180;
    const colMont = 310;
    const colComm = 450;

    // En-tête tableau
    doc.rect(40, doc.y, doc.page.width - 80, 22).fill(NAVY);
    doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(9);
    doc.text("Référence",     colRef,  doc.y - 18);
    doc.text("Type",          colType, doc.y - 18 + doc.currentLineHeight(-18));
    doc.text("Montant",       colMont, doc.y);
    doc.text("Commission",    colComm, doc.y);
    doc.fillColor(NAVY).font("Helvetica").fontSize(9);
    doc.moveDown(0.5);

    invoice.lines.forEach((line, i) => {
      const rowY = doc.y;
      if (i % 2 === 0) doc.rect(40, rowY, doc.page.width - 80, 18).fill("#f8fafc");
      doc.fillColor(GRAY).text(line.bookingRef || "—",    colRef,  rowY + 4);
      doc.fillColor(NAVY).text(line.serviceType || "—",   colType, rowY + 4);
      doc.fillColor(NAVY).text(fmtXOF(line.montantTransaction), colMont, rowY + 4);
      doc.fillColor(BRAND).font("Helvetica-Bold").text(fmtXOF(line.commissionAmount), colComm, rowY + 4);
      doc.font("Helvetica");
      doc.moveDown(0.8);
    });
    doc.moveDown();
  }

  // ── Total ──────────────────────────────────────────────────────────────
  doc.rect(40, doc.y, doc.page.width - 80, 40).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(14)
    .text("TOTAL COMMISSIONS DUES :", 50, doc.y - 36, { width: 300 })
    .text(fmtXOF(invoice.totalCommission), 0, doc.y, { align: "right", width: doc.page.width - 50 });

  footer(doc);
  doc.end();
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. CONTRAT LOCATION / VENTE / LEASING
// ══════════════════════════════════════════════════════════════════════════════
export function generateContractPDF(contract, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const typeLabels = {
    location:  "CONTRAT DE LOCATION",
    essai:     "BON DE RENDEZ-VOUS",
    chauffeur: "CONTRAT DE CHAUFFEUR",
    leasing:   "CONTRAT DE LEASING",
  };
  const ref = contract.reference || `VIT-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="contrat-${ref}.pdf"`);
  doc.pipe(res);

  header(doc, typeLabels[contract.type] || "CONTRAT", ref);

  // ── Parties ──────────────────────────────────────────────────────────────
  doc.rect(40, doc.y, (doc.page.width - 90) / 2, 110).fill(LGRAY).stroke("#e2e8f0");
  const leftX = 50;
  const rightX = (doc.page.width / 2) + 10;
  const topY = doc.y - 108;

  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("CLIENT (LOCATAIRE)", leftX, topY + 6);
  doc.font("Helvetica").fontSize(9).fillColor(GRAY);
  doc.text(`${contract.client?.firstName || ""} ${contract.client?.lastName || ""}`, leftX, topY + 20);
  doc.text(contract.client?.email  || "—", leftX, topY + 32);
  doc.text(contract.client?.phone  || "—", leftX, topY + 44);
  if (contract.client?.idType) doc.text(`${contract.client.idType?.toUpperCase()} : ${contract.client.idNumber || "—"}`, leftX, topY + 56);

  doc.rect(rightX - 10, doc.y - 110 + 2, (doc.page.width - 90) / 2, 110).fill(LGRAY).stroke("#e2e8f0");
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("PARTENAIRE (LOUEUR)", rightX, topY + 6);
  doc.font("Helvetica").fontSize(9).fillColor(GRAY);
  doc.text(contract.vendor?.name  || "—", rightX, topY + 20);
  doc.text(contract.vendor?.email || "—", rightX, topY + 32);
  doc.text(contract.vendor?.phone || "—", rightX, topY + 44);

  doc.moveDown(5.5);

  // ── Véhicule ─────────────────────────────────────────────────────────────
  section(doc, "Véhicule concerné");
  row(doc, "Véhicule",     contract.vehicle?.name  || "—");
  row(doc, "Marque",       contract.vehicle?.brand || "—");
  row(doc, "Année",        contract.vehicle?.year?.toString() || "—");
  row(doc, "Couleur",      contract.vehicle?.color || "—");
  row(doc, "Kilométrage",  contract.vehicle?.mileage ? `${Number(contract.vehicle.mileage).toLocaleString("fr-FR")} km` : "—");
  doc.moveDown();

  // ── Conditions ───────────────────────────────────────────────────────────
  section(doc, "Conditions de la prestation");
  if (contract.type === "location" || contract.type === "leasing") {
    row(doc, "Date de début",     fmtDate(contract.terms?.startDate));
    row(doc, "Date de fin",       fmtDate(contract.terms?.endDate));
    row(doc, "Durée",             contract.terms?.days ? `${contract.terms.days} jour(s)` : "—");
    row(doc, "Lieu de prise",     contract.terms?.pickupLocation || "—");
    row(doc, "Lieu de retour",    contract.terms?.returnLocation || "—");
    row(doc, "Tarif journalier",  fmtXOF(contract.terms?.dailyRateXOF));
    row(doc, "Caution",           fmtXOF(contract.terms?.cautionXOF));
  }
  if (contract.type === "leasing") {
    row(doc, "Apport initial",    fmtXOF(contract.terms?.apportInitial));
    row(doc, "Mensualité",        fmtXOF(contract.terms?.mensualite));
    row(doc, "Durée leasing",     contract.terms?.dureeLeasing ? `${contract.terms.dureeLeasing} mois` : "—");
    row(doc, "Taux d'intérêt",   contract.terms?.tauxInteret ? `${contract.terms.tauxInteret}%` : "—");
  }
  doc.moveDown();

  // ── Récapitulatif financier ───────────────────────────────────────────────
  section(doc, "Récapitulatif financier");
  row(doc, "Montant de base",    fmtXOF(contract.terms?.baseXOF));
  row(doc, "Options",            fmtXOF(contract.terms?.optionsXOF));
  row(doc, "Frais de service",   fmtXOF(contract.terms?.serviceFeeXOF));
  row(doc, "Commission VIT AUTO", fmtXOF(contract.terms?.commissionXOF));
  doc.moveDown(0.3);
  doc.rect(40, doc.y, doc.page.width - 80, 26).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(12)
    .text("TOTAL À RÉGLER :", 50, doc.y - 22, { width: 250 })
    .text(fmtXOF(contract.terms?.totalXOF || contract.terms?.totalLeasing), 0, doc.y - 22, {
      align: "right", width: doc.page.width - 50,
    });
  doc.moveDown(2);

  // ── Mentions légales ─────────────────────────────────────────────────────
  doc.rect(40, doc.y, doc.page.width - 80, 1).fill("#e2e8f0");
  doc.moveDown(0.5);
  doc.fillColor(GRAY).font("Helvetica").fontSize(8)
    .text(
      "Ce contrat a été généré automatiquement par la plateforme VIT AUTO conformément aux conditions générales d'utilisation. " +
      "Le client reconnaît avoir pris connaissance des conditions générales de location et s'engage à respecter le véhicule mis à " +
      "disposition. Tout dommage causé au véhicule sera prélevé sur la caution. La sous-location est strictement interdite. " +
      "En cas de litige, les parties conviennent de recourir à la médiation VIT AUTO avant toute procédure judiciaire.",
      40, doc.y, { width: doc.page.width - 80, align: "justify" }
    );

  doc.moveDown(1.5);

  // ── Signatures ───────────────────────────────────────────────────────────
  const sigY = doc.y;
  doc.rect(40, sigY, 200, 70).fill(LGRAY).stroke("#e2e8f0");
  doc.rect(doc.page.width - 240, sigY, 200, 70).fill(LGRAY).stroke("#e2e8f0");

  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9)
    .text("SIGNATURE CLIENT", 50, sigY + 6)
    .text("SIGNATURE PARTENAIRE", doc.page.width - 230, sigY + 6);

  if (contract.isSigned && contract.clientSignature) {
    try {
      const sigData = contract.clientSignature.replace(/^data:image\/\w+;base64,/, "");
      const sigBuf  = Buffer.from(sigData, "base64");
      doc.image(sigBuf, 50, sigY + 18, { width: 160, height: 44, fit: [160, 44] });
    } catch { /* image invalide */ }
    doc.fillColor(BRAND).font("Helvetica").fontSize(8)
      .text(`Signé le ${fmtDate(contract.signedAt)}`, 50, sigY + 55);
  } else {
    doc.fillColor(GRAY).font("Helvetica-Oblique").fontSize(9)
      .text("Signature électronique requise", 50, sigY + 35);
  }
  doc.fillColor(GRAY).font("Helvetica-Oblique").fontSize(9)
    .text("Signature + cachet", doc.page.width - 230, sigY + 35);

  footer(doc);
  doc.end();
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — retourne un Buffer (pour email attachment ou réponse HTTP)
// ══════════════════════════════════════════════════════════════════════════════
function buildPDFBuffer(builderFn) {
  return new Promise((resolve, reject) => {
    const pdfDoc = new PDFDocument({ margin: 40, size: "A4", autoFirstPage: true });
    const chunks = [];
    pdfDoc.on("data",  (c) => chunks.push(c));
    pdfDoc.on("end",   ()  => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
    builderFn(pdfDoc);
    pdfDoc.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. DOCUMENT ONBOARDING (LOI / ACCORD) — Buffer pour email ou téléchargement
// ══════════════════════════════════════════════════════════════════════════════
export function buildOnboardingPDFBuffer(content, docTitle, ref, signatureBlock = null) {
  return buildPDFBuffer((pdfDoc) => {
    header(pdfDoc, docTitle, ref);

    // Corps du document en monospace (préserve le formatage ASCII)
    pdfDoc
      .font("Courier")
      .fontSize(7.5)
      .fillColor("#1e293b")
      .text(content || "", 40, pdfDoc.y, {
        width: pdfDoc.page.width - 80,
        lineGap: 1.5,
        paragraphGap: 0,
      });

    // Bloc signature électronique (si le document a déjà été signé)
    if (signatureBlock) {
      pdfDoc.moveDown(2);
      const sy = pdfDoc.y;
      pdfDoc.rect(40, sy, pdfDoc.page.width - 80, 70).fill("#f0fdf4").stroke("#bbf7d0");
      pdfDoc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9)
        .text("✅ SIGNATURE ÉLECTRONIQUE ENREGISTRÉE", 50, sy + 8);
      pdfDoc.font("Helvetica").fontSize(8).fillColor(GRAY);
      pdfDoc.text(`Signataire : ${signatureBlock.signerName || "—"}`, 50, sy + 22);
      if (signatureBlock.signerPosition) pdfDoc.text(`Poste : ${signatureBlock.signerPosition}`, 50, sy + 33);
      pdfDoc.text(`Date : ${signatureBlock.signedAt ? new Date(signatureBlock.signedAt).toLocaleString("fr-FR") : "—"}`, 50, sy + 44);
      if (signatureBlock.documentHash) {
        pdfDoc.text(`Hash SHA-256 : ${signatureBlock.documentHash.slice(0, 32)}…`, 50, sy + 55);
      }
    }

    footer(pdfDoc);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. REÇU DE PAIEMENT
// ══════════════════════════════════════════════════════════════════════════════
export function generateReceiptPDF(booking, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const ref = booking.reference || `VIT-REC-${Date.now()}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recu-${ref}.pdf"`);
  doc.pipe(res);

  header(doc, "REÇU DE PAIEMENT", ref);

  section(doc, "Transaction");
  row(doc, "Référence",      ref);
  row(doc, "Date",           fmtDate(booking.paidAt || booking.updatedAt));
  row(doc, "Statut",         booking.status === "completed" ? "✅ Payé" : "⏳ En attente");
  row(doc, "Mode de paiement", booking.transaction?.paymentMethod || booking.paidWith || "—");
  doc.moveDown();

  section(doc, "Client");
  row(doc, "Nom",   `${booking.clientInfo?.firstName || ""} ${booking.clientInfo?.lastName || ""}`.trim());
  row(doc, "Email", booking.clientInfo?.email || "—");
  row(doc, "Tél",   booking.clientInfo?.phone || "—");
  doc.moveDown();

  section(doc, "Prestation");
  row(doc, "Type",     booking.type === "location" ? "Location de véhicule" : booking.type === "essai" ? "Essai / Vente" : booking.type === "chauffeur" ? "Service Chauffeur" : booking.type || "—");
  row(doc, "Véhicule", booking.vehicle?.title || "—");
  if (booking.location?.startDate) {
    row(doc, "Période",  `${fmtDate(booking.location.startDate)} → ${fmtDate(booking.location.endDate)}`);
    row(doc, "Durée",    `${booking.location.days || "?"} jour(s)`);
  }
  doc.moveDown();

  doc.rect(40, doc.y, doc.page.width - 80, 40).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(14)
    .text("MONTANT TOTAL :", 50, doc.y - 36, { width: 300 })
    .text(fmtXOF(booking.montantTotal), 0, doc.y, { align: "right", width: doc.page.width - 50 });

  footer(doc);
  doc.end();
}
