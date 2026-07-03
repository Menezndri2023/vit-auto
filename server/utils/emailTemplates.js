// ══════════════════════════════════════════════════════════════════════════════
// VIT AUTO — Templates email HTML professionnels
// ══════════════════════════════════════════════════════════════════════════════

const BASE_URL = process.env.APP_URL || "https://vit-auto.com";

const COLORS = {
  primary: "#ff4d2d",
  navy:    "#0f1b3f",
  success: "#059669",
  warning: "#d97706",
  gray:    "#64748b",
  light:   "#f8fafc",
};

// ── Layout de base ─────────────────────────────────────────────────────────
function baseLayout(content, title = "VIT AUTO") {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f1f5f9; color:#0f172a; }
    .wrapper { max-width:600px; margin:0 auto; padding:20px; }
    .card { background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,.08); }
    .header { background:${COLORS.navy}; padding:28px 32px; }
    .header-logo { color:#fff; font-size:24px; font-weight:900; letter-spacing:-0.5px; }
    .header-logo span { color:${COLORS.primary}; }
    .body { padding:32px; }
    .hero { background:${COLORS.primary}; color:#fff; border-radius:12px; padding:24px; margin-bottom:24px; text-align:center; }
    .hero h1 { font-size:22px; font-weight:800; margin-bottom:6px; }
    .hero p { opacity:.9; font-size:14px; }
    h2 { font-size:18px; font-weight:700; color:${COLORS.navy}; margin-bottom:12px; }
    p { font-size:14px; line-height:1.7; color:#475569; margin-bottom:12px; }
    .btn { display:inline-block; background:${COLORS.primary}; color:#fff; text-decoration:none; padding:14px 28px; border-radius:10px; font-weight:700; font-size:15px; margin:16px 0; }
    .btn-outline { background:transparent; color:${COLORS.navy}; border:2px solid ${COLORS.navy}; }
    .info-box { background:${COLORS.light}; border-left:4px solid ${COLORS.primary}; border-radius:8px; padding:16px; margin:16px 0; }
    .info-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #e2e8f0; font-size:13px; }
    .info-row:last-child { border-bottom:none; font-weight:700; color:${COLORS.navy}; }
    .badge { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px; font-weight:700; }
    .badge-success { background:#d1fae5; color:${COLORS.success}; }
    .badge-warning { background:#fef3c7; color:${COLORS.warning}; }
    .badge-info { background:#dbeafe; color:#2563eb; }
    .divider { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
    .footer { padding:20px 32px; background:${COLORS.light}; text-align:center; }
    .footer p { font-size:12px; color:#94a3b8; margin:4px 0; }
    .footer a { color:${COLORS.primary}; text-decoration:none; }
    .social { margin:12px 0; }
    .social a { display:inline-block; margin:0 6px; background:${COLORS.navy}; color:#fff; padding:6px 14px; border-radius:999px; font-size:12px; text-decoration:none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="header-logo">VIT<span>AUTO</span></div>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        <div class="social">
          <a href="${BASE_URL}">Site Web</a>
          <a href="${BASE_URL}/catalogue">Catalogue</a>
          <a href="${BASE_URL}/help">Aide</a>
        </div>
        <p>© ${new Date().getFullYear()} VIT AUTO — Plateforme Automobile Internationale</p>
        <p>Route 1029, Hay Sidi Maârouf, Casablanca | <a href="mailto:contact@vit-auto.com">contact@vit-auto.com</a></p>
        <p style="margin-top:8px;"><a href="${BASE_URL}/cgu">CGU</a> · <a href="${BASE_URL}/privacy">Confidentialité</a> · <a href="mailto:unsubscribe@vit-auto.com?subject=Désabonnement">Se désabonner</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── 1. Confirmation d'email ──────────────────────────────────────────────────
export function emailVerificationTemplate(firstName, verifyUrl) {
  return baseLayout(`
    <div class="hero">
      <h1>Bienvenue sur VIT AUTO 🚗</h1>
      <p>Plus qu'une étape pour accéder à votre compte</p>
    </div>
    <h2>Bonjour ${firstName || ""},</h2>
    <p>Merci de vous être inscrit sur VIT AUTO. Pour activer votre compte et profiter de toutes nos fonctionnalités (location, vente, leasing, import/export), confirmez votre adresse email en cliquant sur le bouton ci-dessous :</p>
    <div style="text-align:center;">
      <a href="${verifyUrl}" class="btn">✉️ Confirmer mon email</a>
    </div>
    <div class="info-box">
      <p style="margin:0;font-size:13px;">⚠️ Ce lien expire dans <strong>24 heures</strong>. Si vous n'avez pas créé de compte, ignorez cet email.</p>
    </div>
    <hr class="divider"/>
    <p style="font-size:12px;color:#94a3b8;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/><a href="${verifyUrl}" style="color:${COLORS.primary};word-break:break-all;">${verifyUrl}</a></p>
  `, "Confirmez votre email — VIT AUTO");
}

// ── 2. Réinitialisation mot de passe ────────────────────────────────────────
export function resetPasswordTemplate(firstName, resetUrl) {
  return baseLayout(`
    <div class="hero" style="background:#0f1b3f;">
      <h1>🔐 Réinitialisation de mot de passe</h1>
      <p>Une demande a été effectuée pour votre compte</p>
    </div>
    <h2>Bonjour ${firstName || ""},</h2>
    <p>Vous avez demandé la réinitialisation de votre mot de passe VIT AUTO. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
    <div style="text-align:center;">
      <a href="${resetUrl}" class="btn">🔑 Réinitialiser mon mot de passe</a>
    </div>
    <div class="info-box">
      <p style="margin:0;font-size:13px;">⚠️ Ce lien est valable <strong>1 heure uniquement</strong>.<br/>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email — votre mot de passe reste inchangé.</p>
    </div>
  `, "Réinitialisation mot de passe — VIT AUTO");
}

// ── 3. Confirmation réservation client ──────────────────────────────────────
export function bookingConfirmationTemplate(firstName, booking) {
  const typeLabel = { location: "Location de véhicule", essai: "Essai / Vente", chauffeur: "Service Chauffeur", leasing: "Leasing" }[booking.type] || booking.type;
  const dashUrl = `${BASE_URL}/dashboard`;
  return baseLayout(`
    <div class="hero" style="background:${COLORS.success};">
      <h1>✅ Réservation envoyée !</h1>
      <p>Votre demande est en attente de confirmation du partenaire</p>
    </div>
    <h2>Bonjour ${firstName || ""},</h2>
    <p>Votre réservation sur VIT AUTO a bien été reçue. Le partenaire a été notifié et vous répondra dans les plus brefs délais.</p>
    <div class="info-box">
      <div class="info-row"><span>Référence</span><span><strong>${booking.reference || "—"}</strong></span></div>
      <div class="info-row"><span>Service</span><span><span class="badge badge-info">${typeLabel}</span></span></div>
      <div class="info-row"><span>Véhicule</span><span>${booking.vehicleName || "—"}</span></div>
      ${booking.startDate ? `<div class="info-row"><span>Début</span><span>${new Date(booking.startDate).toLocaleDateString("fr-FR")}</span></div>` : ""}
      ${booking.endDate ? `<div class="info-row"><span>Fin</span><span>${new Date(booking.endDate).toLocaleDateString("fr-FR")}</span></div>` : ""}
      <div class="info-row"><span>Total</span><span>${Number(booking.montantTotal || 0).toLocaleString("fr-FR")} XOF</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${dashUrl}" class="btn">📋 Suivre ma réservation</a>
    </div>
    <p style="font-size:13px;color:#94a3b8;">Vous serez notifié par email et sur la plateforme dès que le partenaire aura répondu.</p>
  `, "Réservation confirmée — VIT AUTO");
}

// ── 4. Notification partenaire — nouvelle commande ───────────────────────────
export function newBookingPartnerTemplate(partnerName, booking) {
  const typeLabel = { location: "Location", essai: "Essai/Vente", chauffeur: "Chauffeur", leasing: "Leasing" }[booking.type] || booking.type;
  const dashUrl = `${BASE_URL}/vendor/dashboard`;
  return baseLayout(`
    <div class="hero">
      <h1>🔔 Nouvelle commande reçue !</h1>
      <p>Un client souhaite réserver votre véhicule</p>
    </div>
    <h2>Bonjour ${partnerName || ""},</h2>
    <p>Vous avez reçu une nouvelle demande de réservation sur VIT AUTO. Connectez-vous pour accepter ou refuser cette commande.</p>
    <div class="info-box">
      <div class="info-row"><span>Référence</span><span><strong>${booking.reference || "—"}</strong></span></div>
      <div class="info-row"><span>Type</span><span><span class="badge badge-info">${typeLabel}</span></span></div>
      <div class="info-row"><span>Client</span><span>${booking.clientName || "—"}</span></div>
      <div class="info-row"><span>Tél. client</span><span>${booking.clientPhone || "—"}</span></div>
      ${booking.startDate ? `<div class="info-row"><span>Dates</span><span>${new Date(booking.startDate).toLocaleDateString("fr-FR")} → ${new Date(booking.endDate).toLocaleDateString("fr-FR")}</span></div>` : ""}
      <div class="info-row"><span>Montant</span><span><strong>${Number(booking.montantTotal || 0).toLocaleString("fr-FR")} XOF</strong></span></div>
      <div class="info-row"><span>Votre net</span><span>${Number(booking.partnerPayout || 0).toLocaleString("fr-FR")} XOF</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${dashUrl}" class="btn">⚡ Traiter maintenant</a>
    </div>
    <p style="font-size:13px;color:#94a3b8;">Répondez rapidement — les clients choisissent souvent le partenaire le plus réactif !</p>
  `, "Nouvelle commande — VIT AUTO Partenaires");
}

// ── 5. Booking accepté par le partenaire ────────────────────────────────────
export function bookingAcceptedTemplate(firstName, booking) {
  const contractUrl = `${BASE_URL}/contract/${booking.id || booking._id}`;
  return baseLayout(`
    <div class="hero" style="background:${COLORS.success};">
      <h1>🎉 Réservation acceptée !</h1>
      <p>Le partenaire a confirmé votre demande</p>
    </div>
    <h2>Bonjour ${firstName || ""},</h2>
    <p>Excellente nouvelle ! Votre réservation <strong>${booking.reference || ""}</strong> a été acceptée par le partenaire. Votre contrat digital est disponible :</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${contractUrl}" class="btn">📄 Voir mon contrat</a>
      <br/>
      <a href="${contractUrl}/pdf" class="btn btn-outline" style="margin-top:8px;">⬇️ Télécharger PDF</a>
    </div>
    <div class="info-box">
      <div class="info-row"><span>Référence</span><span><strong>${booking.reference || "—"}</strong></span></div>
      <div class="info-row"><span>Statut</span><span><span class="badge badge-success">✅ Acceptée</span></span></div>
      ${booking.startDate ? `<div class="info-row"><span>Date de début</span><span>${new Date(booking.startDate).toLocaleDateString("fr-FR")}</span></div>` : ""}
    </div>
    <p style="font-size:13px;">Préparez votre pièce d'identité et les documents requis pour le jour J.</p>
  `, "Réservation acceptée — VIT AUTO");
}

// ── 6. Transaction complétée ─────────────────────────────────────────────────
export function transactionCompletedTemplate(firstName, booking) {
  const receiptUrl = `${BASE_URL}/api/bookings/${booking.id || booking._id}/receipt`;
  return baseLayout(`
    <div class="hero" style="background:${COLORS.success};">
      <h1>🏁 Prestation terminée</h1>
      <p>Merci d'avoir choisi VIT AUTO</p>
    </div>
    <h2>Bonjour ${firstName || ""},</h2>
    <p>Votre prestation <strong>${booking.reference || ""}</strong> est maintenant terminée. Nous espérons que vous avez été satisfait(e) du service.</p>
    <div class="info-box">
      <div class="info-row"><span>Montant payé</span><span><strong>${Number(booking.transaction?.finalAmount || booking.montantTotal || 0).toLocaleString("fr-FR")} XOF</strong></span></div>
      <div class="info-row"><span>Mode de paiement</span><span>${booking.transaction?.paymentMethod || "—"}</span></div>
      <div class="info-row"><span>Date</span><span>${new Date().toLocaleDateString("fr-FR")}</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${receiptUrl}" class="btn">🧾 Télécharger mon reçu</a>
    </div>
    <p>Partagez votre expérience — votre avis aide les autres utilisateurs à choisir les meilleurs partenaires :</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/dashboard" class="btn btn-outline">⭐ Laisser un avis</a>
    </div>
  `, "Prestation terminée — VIT AUTO");
}

// ── 7. KYC soumis / vérifié ──────────────────────────────────────────────────
export function kycSubmittedTemplate(firstName, status) {
  const isPending = status === "EN_ATTENTE";
  return baseLayout(`
    <div class="hero" style="background:${isPending ? COLORS.warning : COLORS.success};">
      <h1>${isPending ? "⏳ Vérification en cours" : "✅ Identité vérifiée"}</h1>
      <p>${isPending ? "Votre dossier KYC est en cours d'analyse" : "Votre compte est maintenant certifié"}</p>
    </div>
    <h2>Bonjour ${firstName || ""},</h2>
    <p>${isPending
      ? "Nous avons bien reçu vos documents d'identité. Notre équipe les vérifie sous 24-48h. Vous recevrez une notification dès validation."
      : "Félicitations ! Votre identité a été vérifiée avec succès. Vous pouvez maintenant réserver tous les véhicules sur VIT AUTO sans restriction."
    }</p>
    ${!isPending ? `
    <div class="info-box">
      <p style="margin:0;font-size:13px;">🎯 Votre badge KYC vous permet désormais d'accéder aux véhicules premium, au leasing, et au service import/export.</p>
    </div>
    <div style="text-align:center;">
      <a href="${BASE_URL}/catalogue" class="btn">🚗 Explorer le catalogue</a>
    </div>` : ""}
  `, "Statut KYC — VIT AUTO");
}

// ── 8. Facture disponible (partenaire) ──────────────────────────────────────
export function invoiceAvailableTemplate(partnerName, invoice) {
  const invoiceUrl = `${BASE_URL}/vendor/dashboard`;
  return baseLayout(`
    <div class="hero" style="background:${COLORS.navy};">
      <h1>📄 Nouvelle facture disponible</h1>
      <p>Votre facture mensuelle de commissions est prête</p>
    </div>
    <h2>Bonjour ${partnerName || ""},</h2>
    <p>Votre facture de commissions pour le mois de <strong>${invoice.month}/${invoice.year}</strong> est disponible sur votre espace partenaire.</p>
    <div class="info-box">
      <div class="info-row"><span>Référence facture</span><span><strong>${invoice.reference || "—"}</strong></span></div>
      <div class="info-row"><span>Période</span><span>${invoice.month}/${invoice.year}</span></div>
      <div class="info-row"><span>Total commissions</span><span><strong>${Number(invoice.totalCommission || 0).toLocaleString("fr-FR")} XOF</strong></span></div>
      <div class="info-row"><span>Échéance</span><span>${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("fr-FR") : "—"}</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${invoiceUrl}" class="btn">💰 Voir mes finances</a>
    </div>
  `, "Facture mensuelle — VIT AUTO Partenaires");
}

// ── Template LOI prête à signer ──────────────────────────────────────────────
export function loiReadyTemplate(firstName, referenceNumber, signLink, expiresInDays = 7) {
  return baseLayout(`
    <div class="hero" style="background:linear-gradient(135deg,#0d2137,#1a7a8a);">
      <h1>📄 Votre LOI est prête !</h1>
      <p>Lettre d'Intention — Programme Founding Partner VIT-AUTO</p>
    </div>
    <h2>Félicitations ${firstName || ""} !</h2>
    <p>Votre candidature au <strong>Programme Founding Partner VIT-AUTO</strong> a été approuvée.
    Votre Lettre d'Intention est maintenant disponible pour signature électronique.</p>
    <div class="info-box">
      <div class="info-row"><span>Référence</span><span><strong>${referenceNumber}</strong></span></div>
      <div class="info-row"><span>Document</span><span>VA-LOI-${referenceNumber}</span></div>
      <div class="info-row"><span>Lien valable</span><span>${expiresInDays} jours</span></div>
    </div>
    <p>Cliquez sur le bouton ci-dessous pour lire et signer votre LOI. Votre signature est enregistrée avec la date, l'heure et votre adresse IP pour valeur légale.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${signLink}" class="btn" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);font-size:16px;padding:16px 36px;">✍️ Signer ma LOI</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;">Le document LOI est joint en pièce jointe à cet email pour consultation.
    Ce lien expire dans ${expiresInDays} jours. Si vous avez des questions, contactez-nous à <a href="mailto:contact@vit-auto.com">contact@vit-auto.com</a>.</p>
  `, "LOI Founding Partner — VIT-AUTO");
}

// ── Template Accord prêt à signer ────────────────────────────────────────────
export function agreementReadyTemplate(firstName, referenceNumber, signLink, expiresInDays = 7) {
  return baseLayout(`
    <div class="hero" style="background:linear-gradient(135deg,#0d2137,#059669);">
      <h1>📜 Votre Accord est prêt !</h1>
      <p>Founding Partner Agreement — VIT-AUTO</p>
    </div>
    <h2>Dernière étape, ${firstName || ""} !</h2>
    <p>Votre Lettre d'Intention a bien été signée. Il ne reste plus qu'à signer votre <strong>Accord de Partenariat Fondateur</strong> pour activer votre statut et débloquer tous vos avantages exclusifs.</p>
    <div class="info-box">
      <div class="info-row"><span>Référence</span><span><strong>${referenceNumber}</strong></span></div>
      <div class="info-row"><span>Document</span><span>VA-FPA-${referenceNumber}</span></div>
      <div class="info-row" style="background:#f0fdf4;"><span>Commission Location</span><span><strong style="color:#059669;">10% (standard 15%)</strong></span></div>
      <div class="info-row" style="background:#f0fdf4;"><span>Commission Vente</span><span><strong style="color:#059669;">2% (standard 3%)</strong></span></div>
      <div class="info-row" style="background:#f0fdf4;"><span>Abonnement Premium</span><span><strong style="color:#059669;">12 mois OFFERT</strong></span></div>
      <div class="info-row"><span>Lien valable</span><span>${expiresInDays} jours</span></div>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${signLink}" class="btn" style="background:linear-gradient(135deg,#059669,#047857);font-size:16px;padding:16px 36px;">✍️ Signer l'Accord</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;">L'accord est joint en pièce jointe pour consultation.
    Ce lien expire dans ${expiresInDays} jours. Questions ? <a href="mailto:contact@vit-auto.com">contact@vit-auto.com</a></p>
  `, "Accord Founding Partner — VIT-AUTO");
}
