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

function fmtAmount(n, currency = "USD") {
  return n != null && n !== 0
    ? `${Number(n).toLocaleString("fr-FR")} ${currency}`
    : "—";
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. FACTURE PARTENAIRE
// ══════════════════════════════════════════════════════════════════════════════
function drawInvoice(doc, invoice) {
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
      doc.fillColor(NAVY).text(fmtAmount(line.montantTransaction, line.devise || invoice.devise), colMont, rowY + 4);
      doc.fillColor(BRAND).font("Helvetica-Bold").text(fmtAmount(line.commissionAmount, line.devise || invoice.devise), colComm, rowY + 4);
      doc.font("Helvetica");
      doc.moveDown(0.8);
    });
    doc.moveDown();
  }

  // ── Total ──────────────────────────────────────────────────────────────
  doc.rect(40, doc.y, doc.page.width - 80, 40).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(14)
    .text("TOTAL COMMISSIONS DUES :", 50, doc.y - 36, { width: 300 })
    .text(fmtAmount(invoice.totalCommission, invoice.devise), 0, doc.y, { align: "right", width: doc.page.width - 50 });

  footer(doc);
}

export function generateInvoicePDF(invoice, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="facture-${invoice.reference}.pdf"`);
  doc.pipe(res);
  drawInvoice(doc, invoice);
  doc.end();
}

// Variante Buffer — pour pièce jointe email (facture mensuelle de commission
// envoyée au partenaire, voir invoiceController.js).
export function generateInvoicePDFBuffer(invoice) {
  return buildPDFBuffer((doc) => drawInvoice(doc, invoice));
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
    row(doc, "Tarif journalier",  fmtAmount(contract.terms?.dailyRateXOF, contract.currency));
    row(doc, "Caution",           fmtAmount(contract.terms?.cautionXOF, contract.currency));
  }
  if (contract.type === "leasing") {
    row(doc, "Apport initial",    fmtAmount(contract.terms?.apportInitial, contract.currency));
    row(doc, "Mensualité",        fmtAmount(contract.terms?.mensualite, contract.currency));
    row(doc, "Durée leasing",     contract.terms?.dureeLeasing ? `${contract.terms.dureeLeasing} mois` : "—");
    row(doc, "Taux d'intérêt",   contract.terms?.tauxInteret ? `${contract.terms.tauxInteret}%` : "—");
  }
  doc.moveDown();

  // ── Récapitulatif financier ───────────────────────────────────────────────
  section(doc, "Récapitulatif financier");
  row(doc, "Montant de base",    fmtAmount(contract.terms?.baseXOF, contract.currency));
  row(doc, "Options",            fmtAmount(contract.terms?.optionsXOF, contract.currency));
  row(doc, "Frais de service",   fmtAmount(contract.terms?.serviceFeeXOF, contract.currency));
  row(doc, "Commission VIT AUTO", fmtAmount(contract.terms?.commissionXOF, contract.currency));
  doc.moveDown(0.3);
  doc.rect(40, doc.y, doc.page.width - 80, 26).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(12)
    .text("TOTAL À RÉGLER :", 50, doc.y - 22, { width: 250 })
    .text(fmtAmount(contract.terms?.totalXOF || contract.terms?.totalLeasing, contract.currency), 0, doc.y - 22, {
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
function drawReceipt(doc, booking) {
  const ref = booking.reference || `VIT-REC-${Date.now()}`;

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
    .text(fmtAmount(booking.montantTotal, booking.devise), 0, doc.y, { align: "right", width: doc.page.width - 50 });

  footer(doc);
}

export function generateReceiptPDF(booking, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const ref = booking.reference || `VIT-REC-${Date.now()}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recu-${ref}.pdf"`);
  doc.pipe(res);
  drawReceipt(doc, booking);
  doc.end();
}

// Variante Buffer — pour pièce jointe email (voir queue/workers/pdf.worker.js,
// job "receipt" déclenché après validation d'une transaction, cash ou en ligne).
export function generateReceiptPDFBuffer(booking) {
  return buildPDFBuffer((doc) => drawReceipt(doc, booking));
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. CONTRAT D'EMBAUCHE CHAUFFEUR CDD/CDI (DriverEmployment)
// ══════════════════════════════════════════════════════════════════════════════
// Document récapitulatif des conditions proposées et acceptées — ne remplace
// pas un contrat de travail en bonne et due forme (mentions légales locales,
// cotisations sociales...), volontairement hors périmètre d'une marketplace :
// sert de trace écrite des conditions négociées via la plateforme, à formaliser
// ensuite entre les parties.
const DEFAULT_EMPLOYMENT_CONDITIONS = [
  "1. Le chauffeur s'engage à exécuter sa mission avec professionnalisme, ponctualité et respect du code de la route.",
  "2. L'employeur s'engage à régler la rémunération convenue selon la périodicité définie d'un commun accord.",
  "3. La période d'essai, le préavis et les conditions de rupture sont à définir entre les parties conformément au droit du travail applicable.",
  "4. Toute modification substantielle des conditions ci-dessus doit faire l'objet d'un avenant écrit signé des deux parties.",
  "5. VIT AUTO n'est ni employeur ni partie au contrat de travail : sa responsabilité se limite à la mise en relation.",
].join("\n");

function drawEmploymentContract(doc, request) {
  const ref = `VIT-EMP-${request._id.toString().slice(-8).toUpperCase()}`;
  header(doc, request.contractType === "cdi" ? "PROPOSITION D'EMBAUCHE — CDI" : "PROPOSITION D'EMBAUCHE — CDD", ref);

  // ── Parties ──────────────────────────────────────────────────────────────
  doc.rect(40, doc.y, (doc.page.width - 90) / 2, 100).fill(LGRAY).stroke("#e2e8f0");
  const leftX = 50;
  const rightX = (doc.page.width / 2) + 10;
  const topY = doc.y - 98;

  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("EMPLOYEUR", leftX, topY + 6);
  doc.font("Helvetica").fontSize(9).fillColor(GRAY);
  doc.text(`${request.employerInfo?.firstName || ""} ${request.employerInfo?.lastName || ""}`, leftX, topY + 20);
  doc.text(request.employerInfo?.email || "—", leftX, topY + 32);
  doc.text(request.employerInfo?.phone || "—", leftX, topY + 44);

  doc.rect(rightX - 10, doc.y - 100 + 2, (doc.page.width - 90) / 2, 100).fill(LGRAY).stroke("#e2e8f0");
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("CHAUFFEUR", rightX, topY + 6);
  doc.font("Helvetica").fontSize(9).fillColor(GRAY);
  doc.text(`${request.driver?.firstName || ""} ${request.driver?.lastName || ""}`, rightX, topY + 20);
  doc.text(request.driver?.phone || "—", rightX, topY + 32);

  doc.moveDown(5);

  // ── Conditions du contrat ─────────────────────────────────────────────────
  section(doc, "Conditions proposées");
  row(doc, "Type de contrat", request.contractType.toUpperCase());
  row(doc, "Date de début", fmtDate(request.startDate));
  if (request.contractType === "cdd") row(doc, "Date de fin", fmtDate(request.endDate));
  row(doc, "Salaire mensuel", fmtAmount(request.proposedSalary, request.currency), true);
  row(doc, "Horaires / rythme", request.workSchedule || "—");
  if (request.location?.ville) row(doc, "Lieu de mission", [request.location.ville, request.location.country].filter(Boolean).join(", "));
  doc.moveDown();

  if (request.missionDescription) {
    section(doc, "Description du poste");
    doc.fillColor(NAVY).font("Helvetica").fontSize(9)
      .text(request.missionDescription, 50, doc.y, { width: doc.page.width - 100, align: "justify" });
    doc.moveDown();
  }

  // ── Statut ───────────────────────────────────────────────────────────────
  doc.moveDown(0.5);
  doc.rect(40, doc.y, doc.page.width - 80, 26).fill(request.status === "accepted" ? "#059669" : NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(11)
    .text(request.status === "accepted" ? "✓ PROPOSITION ACCEPTÉE PAR LE CHAUFFEUR" : "PROPOSITION EN ATTENTE", 0, doc.y - 20, { align: "center", width: doc.page.width });
  doc.moveDown(2);

  // ── Clauses du contrat — texte par défaut, personnalisable par l'admin lors
  // du traitement de la demande (voir driverEmploymentController.processEmploymentRequest) ──
  section(doc, "Clauses du contrat");
  doc.fillColor(NAVY).font("Helvetica").fontSize(9)
    .text(request.contractConditions || DEFAULT_EMPLOYMENT_CONDITIONS, 50, doc.y, { width: doc.page.width - 100, align: "justify" });
  doc.moveDown();

  // ── Mentions légales ─────────────────────────────────────────────────────
  doc.rect(40, doc.y, doc.page.width - 80, 1).fill("#e2e8f0");
  doc.moveDown(0.5);
  doc.fillColor(GRAY).font("Helvetica").fontSize(8)
    .text(
      "Ce document récapitule les conditions d'embauche proposées via la plateforme VIT AUTO et acceptées par le chauffeur " +
      "concerné. Il ne constitue pas un contrat de travail en bonne et due forme : la rédaction du contrat définitif " +
      "(mentions légales, cotisations sociales, clauses spécifiques) et sa signature restent à la charge des deux parties, " +
      "en dehors de la plateforme. VIT AUTO n'intervient ni comme employeur ni comme intermédiaire d'embauche.",
      40, doc.y, { width: doc.page.width - 80, align: "justify" }
    );

  footer(doc);
}

export function generateEmploymentContractPDF(request, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const ref = `contrat-embauche-${request._id.toString().slice(-8)}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${ref}.pdf"`);
  doc.pipe(res);
  drawEmploymentContract(doc, request);
  doc.end();
}

// Variante Buffer — pour pièce jointe email envoyée aux deux parties à l'acceptation.
export function generateEmploymentContractPDFBuffer(request) {
  return buildPDFBuffer((doc) => drawEmploymentContract(doc, request));
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. FACTURE DE PRESTATION AU PARTENAIRE (ServiceInvoice) — après service rendu
// ══════════════════════════════════════════════════════════════════════════════
// Distincte de generateInvoicePDF (facture MENSUELLE que le partenaire doit à
// VIT AUTO) : ici, document remis au partenaire juste après une commande
// terminée, détaillant ce qu'IL a encaissé/à percevoir pour cette prestation.
const PAYMENT_METHOD_LABELS = {
  cash: "Espèces", card: "Carte bancaire", orange_money: "Orange Money",
  wave: "Wave", mtn: "MTN Mobile Money", moov: "Moov Money",
  virement: "Virement bancaire", paypal: "PayPal", applepay: "Apple Pay", test: "Test",
};

function drawServiceInvoice(doc, invoice) {
  const ref = invoice.reference || `VIT-SRV-${invoice._id.toString().slice(-8).toUpperCase()}`;
  header(doc, "FACTURE DE PRESTATION", ref);

  section(doc, "Prestation");
  row(doc, "Commande",         invoice.bookingReference || "—");
  row(doc, "Type de service",  { location: "Location", essai: "Essai/Vente", chauffeur: "Mission chauffeur", leasing: "Leasing" }[invoice.serviceType] || invoice.serviceType || "—");
  row(doc, "Terminée le",      fmtDate(invoice.serviceCompletedAt));
  row(doc, "Moyen de paiement", PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod || "—");
  doc.moveDown();

  section(doc, "Récapitulatif financier");
  row(doc, "Montant brut",         fmtAmount(invoice.grossAmount, invoice.currency));
  row(doc, "Commission VIT AUTO",  `${fmtAmount(invoice.commissionAmount, invoice.currency)} (${Math.round((invoice.commissionRate || 0) * 100)}%)`);
  doc.moveDown(0.3);
  doc.rect(40, doc.y, doc.page.width - 80, 26).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(12)
    .text("NET À PERCEVOIR :", 50, doc.y - 22, { width: 250 })
    .text(fmtAmount(invoice.netPayout, invoice.currency), 0, doc.y - 22, { align: "right", width: doc.page.width - 50 });
  doc.moveDown(2);

  doc.rect(40, doc.y, doc.page.width - 80, 1).fill("#e2e8f0");
  doc.moveDown(0.5);
  doc.fillColor(GRAY).font("Helvetica").fontSize(8)
    .text(
      "Ce document récapitule la répartition financière de la prestation ci-dessus, générée automatiquement par VIT AUTO " +
      "à l'issue de la commande. Il ne remplace pas une facture fiscale émise par le partenaire lui-même si la réglementation " +
      "locale l'exige.",
      40, doc.y, { width: doc.page.width - 80, align: "justify" }
    );

  footer(doc);
}

export function generateServiceInvoicePDF(invoice, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const ref = invoice.reference || `facture-${invoice._id}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${ref}.pdf"`);
  doc.pipe(res);
  drawServiceInvoice(doc, invoice);
  doc.end();
}

// Variante Buffer — pièce jointe email envoyée au partenaire après service.
export function generateServiceInvoicePDFBuffer(invoice) {
  return buildPDFBuffer((doc) => drawServiceInvoice(doc, invoice));
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. REÇU GÉNÉRIQUE (assurance, service, Import/Export) — jusqu'ici seul un
// Booking (location/vente/essai/chauffeur) produisait un reçu PDF téléchargeable
// par le client. Un client payant une prime d'assurance, un devis de service, ou
// un acompte/solde Import/Export n'avait aucun reçu — manque réel trouvé en audit.
// ══════════════════════════════════════════════════════════════════════════════
function drawGenericReceipt(doc, data) {
  const ref = data.reference || `VIT-REC-${Date.now()}`;
  header(doc, "REÇU DE PAIEMENT", ref);

  section(doc, "Transaction");
  row(doc, "Référence",       ref);
  row(doc, "Date",            fmtDate(data.paidAt || new Date()));
  row(doc, "Mode de paiement", data.method || "—");
  doc.moveDown();

  section(doc, "Client");
  row(doc, "Nom",   data.clientName  || "—");
  row(doc, "Email", data.clientEmail || "—");
  doc.moveDown();

  section(doc, "Prestation");
  row(doc, "Type", data.title || "—");
  if (data.description) row(doc, "Détail", data.description);
  doc.moveDown();

  doc.rect(40, doc.y, doc.page.width - 80, 40).fill(NAVY);
  doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(14)
    .text("MONTANT PAYÉ :", 50, doc.y - 36, { width: 300 })
    .text(fmtAmount(data.amount, data.currency), 0, doc.y, { align: "right", width: doc.page.width - 50 });

  footer(doc);
}

export function generateGenericReceiptPDF(data, res) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const ref = data.reference || `VIT-REC-${Date.now()}`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recu-${ref}.pdf"`);
  doc.pipe(res);
  drawGenericReceipt(doc, data);
  doc.end();
}
