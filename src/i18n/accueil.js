/**
 * Traductions — chrome commun (pied de page) et page d'accueil.
 *
 * Séparé de translations.js pour que le fichier central ne devienne pas
 * illisible : les clés y sont ajoutées par vagues, une par surface traduite.
 * Même structure plate : clé → { fr, en, ar, es, zh }.
 *
 * Toute clé ajoutée ici DOIT avoir les cinq langues — i18n.completude.test.js
 * échoue sinon, et une page qui déclare `traduite` sans couvrir ses textes
 * mentirait aux moteurs de recherche.
 */
export default {

  // ─── Pied de page ─────────────────────────────────────────────────────────
  "footer.tagline": {
    fr: "La passerelle automobile internationale — location, vente, import et export entre l'Afrique, l'Europe, la Chine et le Moyen-Orient.",
    en: "The international automotive gateway — rental, sales, import and export between Africa, Europe, China and the Middle East.",
    ar: "البوابة الدولية للسيارات — تأجير وبيع واستيراد وتصدير بين إفريقيا وأوروبا والصين والشرق الأوسط.",
    es: "La pasarela automotriz internacional — alquiler, venta, importación y exportación entre África, Europa, China y Oriente Medio.",
    zh: "国际汽车门户——连接非洲、欧洲、中国与中东的租赁、销售、进口与出口平台。",
  },
  "footer.colServices":   { fr: "Services",            en: "Services",            ar: "الخدمات",              es: "Servicios",              zh: "服务" },
  "footer.colNav":        { fr: "Navigation",          en: "Navigation",          ar: "التنقل",               es: "Navegación",             zh: "导航" },
  "footer.colLegal":      { fr: "Légal & Confiance",   en: "Legal & Trust",       ar: "القانون والثقة",       es: "Legal y confianza",      zh: "法律与信任" },
  "footer.contact":       { fr: "Contact",             en: "Contact",             ar: "اتصل بنا",             es: "Contacto",               zh: "联系我们" },
  "footer.svcRent":       { fr: "Location de véhicules", en: "Vehicle rental",    ar: "تأجير المركبات",       es: "Alquiler de vehículos",  zh: "车辆租赁" },
  "footer.svcSale":       { fr: "Vente de véhicules",  en: "Vehicle sales",       ar: "بيع المركبات",         es: "Venta de vehículos",     zh: "车辆销售" },
  "footer.svcDriver":     { fr: "Service chauffeur",   en: "Chauffeur service",   ar: "خدمة السائق",          es: "Servicio de chófer",     zh: "司机服务" },
  "footer.svcLeisure":    { fr: "Activités & loisirs", en: "Activities & leisure", ar: "الأنشطة والترفيه",    es: "Actividades y ocio",     zh: "活动与休闲" },
  "footer.svcParts":      { fr: "Pièces détachées",    en: "Spare parts",         ar: "قطع الغيار",           es: "Repuestos",              zh: "零配件" },
  "footer.svcIE":         { fr: "Import / Export international", en: "International import / export", ar: "الاستيراد والتصدير الدولي", es: "Importación / exportación internacional", zh: "国际进出口" },
  "footer.svcIEListings": { fr: "Annonces Import / Export", en: "Import / export listings", ar: "إعلانات الاستيراد والتصدير", es: "Anuncios de importación / exportación", zh: "进出口车源" },
  "footer.navBecomePartner": { fr: "Devenir partenaire", en: "Become a partner",  ar: "كن شريكاً",            es: "Ser socio",              zh: "成为合作伙伴" },
  "footer.navWhy":        { fr: "Pourquoi VIT AUTO ?",  en: "Why VIT AUTO?",      ar: "لماذا VIT AUTO؟",      es: "¿Por qué VIT AUTO?",     zh: "为什么选择 VIT AUTO？" },
  "footer.navFaq":        { fr: "FAQ",                 en: "FAQ",                 ar: "الأسئلة الشائعة",      es: "Preguntas frecuentes",   zh: "常见问题" },
  "footer.legalCgu":      { fr: "Conditions d'utilisation", en: "Terms of use",   ar: "شروط الاستخدام",       es: "Condiciones de uso",     zh: "使用条款" },
  "footer.legalCgv":      { fr: "Conditions de vente",  en: "Terms of sale",      ar: "شروط البيع",           es: "Condiciones de venta",   zh: "销售条款" },
  "footer.legalPartners": { fr: "Conditions partenaires", en: "Partner terms",    ar: "شروط الشركاء",         es: "Condiciones para socios", zh: "合作伙伴条款" },
  "footer.legalPrivacy":  { fr: "Politique de confidentialité", en: "Privacy policy", ar: "سياسة الخصوصية",  es: "Política de privacidad", zh: "隐私政策" },
  "footer.legalCookies":  { fr: "Politique Cookies",    en: "Cookie policy",      ar: "سياسة ملفات الارتباط", es: "Política de cookies",   zh: "Cookie 政策" },
  "footer.legalTrust":    { fr: "Confiance & Conformité", en: "Trust & compliance", ar: "الثقة والامتثال",    es: "Confianza y cumplimiento", zh: "信任与合规" },
  "footer.legalMentions": { fr: "Mentions légales",     en: "Legal notice",       ar: "الإشعار القانوني",     es: "Aviso legal",            zh: "法律声明" },
  "footer.hours":         { fr: "Ouvert 7j/7 · 24h/24", en: "Open 24/7",          ar: "مفتوح ٢٤/٧",           es: "Abierto 24/7",           zh: "全天候营业" },
  "footer.rights":        { fr: "Tous droits réservés.", en: "All rights reserved.", ar: "جميع الحقوق محفوظة.", es: "Todos los derechos reservados.", zh: "版权所有。" },
  "footer.worldwide":     { fr: "Plateforme automobile mondiale", en: "Global automotive platform", ar: "منصة سيارات عالمية", es: "Plataforma automotriz global", zh: "全球汽车平台" },
  "footer.shortCgu":      { fr: "CGU",                  en: "Terms",              ar: "الشروط",               es: "Términos",               zh: "条款" },
  "footer.shortCgv":      { fr: "CGV",                  en: "Sales",              ar: "شروط البيع",           es: "Venta",                  zh: "销售条款" },
  "footer.shortMentions": { fr: "Mentions légales",     en: "Legal",              ar: "قانوني",               es: "Aviso legal",            zh: "法律声明" },
  "footer.shortPrivacy":  { fr: "Confidentialité",      en: "Privacy",            ar: "الخصوصية",             es: "Privacidad",             zh: "隐私" },
  "footer.shortCookies":  { fr: "Cookies",              en: "Cookies",            ar: "ملفات الارتباط",       es: "Cookies",                zh: "Cookie" },
  "footer.shortPartners": { fr: "Partenaires",          en: "Partners",           ar: "الشركاء",              es: "Socios",                 zh: "合作伙伴" },
  "footer.ariaPhone":     { fr: "Téléphone",            en: "Phone",              ar: "الهاتف",               es: "Teléfono",               zh: "电话" },

  // ─── Accueil : titre et description pour les moteurs ─────────────────────
  // Ces deux clés alimentent <title>, la meta description et l'aperçu de
  // partage. Sans elles, /en/ et /ar/ porteraient le titre français d'origine
  // tout en déclarant hreflang="en" / "ar".
  "home.metaTitle": {
    fr: "Location, vente et import de véhicules à l'international",
    en: "International vehicle rental, sales and import",
    ar: "تأجير وبيع واستيراد المركبات دولياً",
    es: "Alquiler, venta e importación de vehículos a nivel internacional",
    zh: "国际车辆租赁、销售与进口",
  },
  "home.metaDesc": {
    fr: "Louez, achetez, importez ou exportez un véhicule dans 28 pays. Inspection, transport, dédouanement et livraison gérés de bout en bout, avec paiement sécurisé.",
    en: "Rent, buy, import or export a vehicle across 28 countries. Inspection, transport, customs clearance and delivery handled end to end, with secure payment.",
    ar: "استأجر أو اشترِ أو استورد أو صدّر مركبة في ٢٨ دولة. الفحص والنقل والتخليص الجمركي والتسليم تُدار بالكامل، مع دفع آمن.",
    es: "Alquila, compra, importa o exporta un vehículo en 28 países. Inspección, transporte, despacho aduanero y entrega gestionados de principio a fin, con pago seguro.",
    zh: "在 28 个国家租赁、购买、进口或出口车辆。验车、运输、清关与交付全程包办，支付安全可靠。",
  },

  // ─── Accueil : bandes de mise en avant ────────────────────────────────────
  "home.leisureTitle":    { fr: "Activités et loisirs", en: "Activities & leisure", ar: "الأنشطة والترفيه",   es: "Actividades y ocio",     zh: "活动与休闲" },
  "home.leisureSub":      { fr: "Plongée, quad, jetski — à faire près de chez vous.", en: "Diving, quad biking, jet ski — things to do near you.", ar: "الغوص والدراجات الرباعية والجت سكي — قريباً منك.", es: "Buceo, quad, moto acuática — cerca de ti.", zh: "潜水、沙滩车、水上摩托——就在您附近。" },
  "home.leisureAll":      { fr: "Toutes les activités", en: "All activities",     ar: "كل الأنشطة",           es: "Todas las actividades",  zh: "全部活动" },
  "home.partnersTitle":   { fr: "Partenaires à la une", en: "Featured partners",  ar: "شركاء مميزون",         es: "Socios destacados",      zh: "精选合作伙伴" },
  "home.partnersSub":     { fr: "Les professionnels les plus actifs sur VIT AUTO.", en: "The most active professionals on VIT AUTO.", ar: "أكثر المحترفين نشاطاً على VIT AUTO.", es: "Los profesionales más activos en VIT AUTO.", zh: "VIT AUTO 上最活跃的专业商家。" },

  // ─── Pourquoi VIT AUTO (section d'accueil) ────────────────────────────────
  "why.tag":    { fr: "⭐ POURQUOI VIT AUTO",   en: "⭐ WHY VIT AUTO",        ar: "⭐ لماذا VIT AUTO",      es: "⭐ POR QUÉ VIT AUTO",     zh: "⭐ 为什么选择 VIT AUTO" },
  "why.title1": { fr: "La passerelle automobile", en: "The automotive gateway", ar: "الجسر الدولي للسيارات", es: "La pasarela automotriz", zh: "汽车桥梁" },
  "why.title2": { fr: "entre tous les continents", en: "between every continent", ar: "بين جميع القارات",  es: "entre todos los continentes", zh: "连接各大洲" },
  "why.sub": {
    fr: "De Shanghai à Abidjan, de Dubaï à Casablanca — la plateforme internationale pour louer, acheter, importer ou exporter un véhicule d'exception.",
    en: "From Shanghai to Abidjan, from Dubai to Casablanca — the international platform to rent, buy, import or export an exceptional vehicle.",
    ar: "من شنغهاي إلى أبيدجان، ومن دبي إلى الدار البيضاء — المنصة الدولية لتأجير أو شراء أو استيراد أو تصدير مركبة استثنائية.",
    es: "De Shanghái a Abiyán, de Dubái a Casablanca — la plataforma internacional para alquilar, comprar, importar o exportar un vehículo excepcional.",
    zh: "从上海到阿比让，从迪拜到卡萨布兰卡——租赁、购买、进口或出口优质车辆的国际平台。",
  },
  "why.f1.title": { fr: "Plateforme mondiale", en: "Global platform", ar: "منصة عالمية", es: "Plataforma global", zh: "全球平台" },
  "why.f1.desc": {
    fr: "Chine, Dubaï, Europe, Afrique, Maghreb — VIT AUTO opère sur les 5 grands marchés automobiles internationaux. Achetez ou importez depuis n'importe quel pays.",
    en: "China, Dubai, Europe, Africa, the Maghreb — VIT AUTO operates across the 5 major international car markets. Buy or import from any country.",
    ar: "الصين ودبي وأوروبا وإفريقيا والمغرب العربي — تعمل VIT AUTO في أكبر خمسة أسواق دولية للسيارات. اشترِ أو استورد من أي بلد.",
    es: "China, Dubái, Europa, África, el Magreb — VIT AUTO opera en los 5 grandes mercados automotrices internacionales. Compra o importa desde cualquier país.",
    zh: "中国、迪拜、欧洲、非洲、马格里布——VIT AUTO 覆盖五大国际汽车市场。从任何国家购车或进口。",
  },
  "why.f2.title": { fr: "Livraison GPS précise", en: "Precise GPS delivery", ar: "توصيل دقيق بنظام GPS", es: "Entrega GPS precisa", zh: "GPS 精准配送" },
  "why.f2.desc": {
    fr: "Votre véhicule livré à domicile grâce au calcul GPS en temps réel. Frais transparents dès la réservation — distance réelle, zéro surprise.",
    en: "Your vehicle delivered to your door through real-time GPS calculation. Transparent fees from the moment you book — real distance, no surprises.",
    ar: "مركبتك تُسلَّم إلى باب منزلك بحساب GPS فوري. رسوم واضحة منذ الحجز — مسافة حقيقية بلا مفاجآت.",
    es: "Tu vehículo entregado a domicilio gracias al cálculo GPS en tiempo real. Tarifas transparentes desde la reserva — distancia real, sin sorpresas.",
    zh: "通过实时 GPS 计算，将车辆送到您家门口。下单即显示透明费用——按实际距离计算，绝无隐藏收费。",
  },
  "why.f3.title": { fr: "Paiement 100 % sécurisé", en: "100% secure payment", ar: "دفع آمن ١٠٠٪", es: "Pago 100 % seguro", zh: "100% 安全支付" },
  "why.f3.desc": {
    fr: "Orange Money, Wave, Carte bancaire, CMI… Toutes les transactions sont chiffrées TLS 1.3. Vos données bancaires ne transitent jamais sur nos serveurs.",
    en: "Orange Money, Wave, bank card, CMI… Every transaction is TLS 1.3 encrypted. Your banking details never pass through our servers.",
    ar: "أورنج موني وويف والبطاقة البنكية وCMI… جميع المعاملات مشفّرة بـ TLS 1.3. بيانات بطاقتك لا تمر أبداً عبر خوادمنا.",
    es: "Orange Money, Wave, tarjeta bancaria, CMI… Todas las transacciones están cifradas con TLS 1.3. Tus datos bancarios nunca pasan por nuestros servidores.",
    zh: "Orange Money、Wave、银行卡、CMI……所有交易均采用 TLS 1.3 加密。您的银行信息绝不经过我们的服务器。",
  },
  "why.f4.title": { fr: "Import clé en main", en: "Turnkey import", ar: "استيراد متكامل", es: "Importación llave en mano", zh: "一站式进口" },
  "why.f4.desc": {
    fr: "Commandez depuis la Chine, Dubaï ou l'Europe. Inspection, transport maritime, dédouanement et livraison pris en charge par VIT AUTO de A à Z.",
    en: "Order from China, Dubai or Europe. Inspection, sea freight, customs clearance and delivery all handled by VIT AUTO from start to finish.",
    ar: "اطلب من الصين أو دبي أو أوروبا. الفحص والشحن البحري والتخليص الجمركي والتسليم — تتكفل VIT AUTO بكل شيء من الألف إلى الياء.",
    es: "Pide desde China, Dubái o Europa. Inspección, transporte marítimo, despacho de aduanas y entrega, todo gestionado por VIT AUTO de principio a fin.",
    zh: "从中国、迪拜或欧洲下单。验车、海运、清关与交付，VIT AUTO 全程包办。",
  },
  "why.f5.title": { fr: "Réservation en 2 minutes", en: "Book in 2 minutes", ar: "احجز في دقيقتين", es: "Reserva en 2 minutos", zh: "两分钟完成预订" },
  "why.f5.desc": {
    fr: "Réservez en ligne à toute heure. Le contrat est généré automatiquement et signable en ligne ; vous suivez la réponse du partenaire par e-mail et dans votre espace. Aucune paperasse, aucun déplacement.",
    en: "Book online at any hour. The contract is generated automatically and can be signed online; you follow the partner's reply by email and in your account. No paperwork, no trips.",
    ar: "احجز عبر الإنترنت في أي وقت. يُنشأ العقد تلقائياً ويمكن توقيعه إلكترونياً، وتتابع رد الشريك بالبريد وفي حسابك. بلا أوراق وبلا تنقّل.",
    es: "Reserva en línea a cualquier hora. El contrato se genera automáticamente y se firma en línea; sigues la respuesta del socio por correo y en tu cuenta. Sin papeleo ni desplazamientos.",
    zh: "随时在线预订。合同自动生成并可在线签署；您可通过邮件和账户跟进商家答复。无需纸质材料，无需跑腿。",
  },
  "why.f6.title": { fr: "Partenaires vérifiés", en: "Verified partners", ar: "شركاء موثّقون", es: "Socios verificados", zh: "认证合作伙伴" },
  "why.f6.desc": {
    fr: "Chaque partenaire est contrôlé — identité, documents du véhicule, assurance. Vous louez et achetez en toute confiance, sur 5 continents.",
    en: "Every partner is checked — identity, vehicle documents, insurance. You rent and buy with confidence, across 5 continents.",
    ar: "كل شريك يخضع للتدقيق — الهوية ووثائق المركبة والتأمين. تستأجر وتشتري بثقة تامة في خمس قارات.",
    es: "Cada socio es verificado — identidad, documentos del vehículo, seguro. Alquilas y compras con total confianza, en 5 continentes.",
    zh: "每位合作伙伴均经审核——身份、车辆证件、保险。您可在五大洲放心租车与购车。",
  },
  "why.stepsTitle": { fr: "Comment ça marche ?", en: "How does it work?", ar: "كيف تعمل المنصة؟", es: "¿Cómo funciona?", zh: "如何运作？" },
  "why.s1.label": { fr: "Recherchez", en: "Search",  ar: "ابحث",   es: "Busca",    zh: "搜索" },
  "why.s1.desc":  { fr: "Filtrez par ville, type, état et budget", en: "Filter by city, type, condition and budget", ar: "صفِّ حسب المدينة والنوع والحالة والميزانية", es: "Filtra por ciudad, tipo, estado y presupuesto", zh: "按城市、类型、车况和预算筛选" },
  "why.s2.label": { fr: "Réservez",   en: "Book",    ar: "احجز",   es: "Reserva",  zh: "预订" },
  "why.s2.desc":  { fr: "Complétez en 3 étapes, payez sécurisé", en: "Complete in 3 steps, pay securely", ar: "أكمل في ٣ خطوات وادفع بأمان", es: "Completa en 3 pasos y paga de forma segura", zh: "三步完成，安全支付" },
  "why.s3.label": { fr: "Recevez",    en: "Receive", ar: "استلم",  es: "Recibe",   zh: "接车" },
  "why.s3.desc":  { fr: "Livraison GPS à domicile ou retrait agence", en: "GPS delivery to your door or agency pickup", ar: "توصيل بـ GPS إلى المنزل أو استلام من الوكالة", es: "Entrega GPS a domicilio o recogida en agencia", zh: "GPS 送车上门或到店自取" },
  "why.s4.label": { fr: "Profitez",   en: "Enjoy",   ar: "استمتع", es: "Disfruta", zh: "享受" },
  "why.s4.desc":  { fr: "Contrat digital, support 7j/7", en: "Digital contract, support 7 days a week", ar: "عقد رقمي ودعم طوال أيام الأسبوع", es: "Contrato digital, soporte los 7 días", zh: "电子合同，全周客服支持" },

  // ─── Sécurité & Confiance (section d'accueil) ─────────────────────────────
  "trust.tag":    { fr: "🛡️ SÉCURITÉ & CONFIANCE", en: "🛡️ SECURITY & TRUST", ar: "🛡️ الأمان والثقة", es: "🛡️ SEGURIDAD Y CONFIANZA", zh: "🛡️ 安全与信任" },
  "trust.title1": { fr: "Vous êtes entre de", en: "You are in", ar: "أنت في", es: "Estás en", zh: "您可以" },
  "trust.title2": { fr: "bonnes mains", en: "good hands", ar: "أيدٍ أمينة", es: "buenas manos", zh: "完全放心" },
  "trust.sub": {
    fr: "Chaque réservation sur VIT AUTO est protégée de bout en bout — identités vérifiées, paiements chiffrés, contrats signés.",
    en: "Every booking on VIT AUTO is protected end to end — verified identities, encrypted payments, signed contracts.",
    ar: "كل حجز على VIT AUTO محمي من البداية إلى النهاية — هويات موثّقة ومدفوعات مشفّرة وعقود موقّعة.",
    es: "Cada reserva en VIT AUTO está protegida de principio a fin — identidades verificadas, pagos cifrados, contratos firmados.",
    zh: "VIT AUTO 上的每一笔预订都受到全程保护——身份认证、加密支付、签署合同。",
  },
  "trust.t1.title": { fr: "Identités vérifiées", en: "Verified identities", ar: "هويات موثّقة", es: "Identidades verificadas", zh: "身份认证" },
  "trust.t1.desc": {
    fr: "Chaque compte est vérifié par pièce d'identité (CNI ou passeport). Clients et partenaires sont authentifiés avant toute transaction.",
    en: "Every account is verified with an identity document (ID card or passport). Customers and partners are authenticated before any transaction.",
    ar: "يُوثَّق كل حساب بوثيقة هوية (بطاقة وطنية أو جواز سفر). يتم التحقق من العملاء والشركاء قبل أي معاملة.",
    es: "Cada cuenta se verifica con un documento de identidad (DNI o pasaporte). Clientes y socios se autentican antes de cualquier transacción.",
    zh: "每个账户均通过身份证件（身份证或护照）验证。客户与合作伙伴在交易前完成认证。",
  },
  "trust.t2.title": { fr: "Caution sécurisée", en: "Secured deposit", ar: "وديعة مؤمَّنة", es: "Fianza asegurada", zh: "押金保障" },
  "trust.t2.desc": {
    fr: "La caution est gérée automatiquement via notre système de paiement sécurisé. Elle est restituée immédiatement après retour du véhicule.",
    en: "The deposit is handled automatically through our secure payment system. It is returned immediately after the vehicle comes back.",
    ar: "تُدار الوديعة تلقائياً عبر نظام الدفع الآمن لدينا، وتُعاد فور إرجاع المركبة.",
    es: "La fianza se gestiona automáticamente mediante nuestro sistema de pago seguro. Se devuelve inmediatamente tras la devolución del vehículo.",
    zh: "押金通过我们的安全支付系统自动管理，车辆归还后立即退还。",
  },
  "trust.t3.title": { fr: "Contrat digital", en: "Digital contract", ar: "عقد رقمي", es: "Contrato digital", zh: "电子合同" },
  "trust.t3.desc": {
    fr: "Un contrat électronique signé numériquement est généré à chaque réservation. Valeur juridique reconnue en Afrique et en Europe.",
    en: "A digitally signed electronic contract is generated for every booking. Legally recognised in Africa and in Europe.",
    ar: "يُنشأ عقد إلكتروني موقّع رقمياً مع كل حجز، وله قيمة قانونية معترف بها في إفريقيا وأوروبا.",
    es: "Se genera un contrato electrónico firmado digitalmente en cada reserva. Con valor jurídico reconocido en África y Europa.",
    zh: "每次预订均生成电子签署合同，在非洲与欧洲具有法律效力。",
  },
  "trust.t4.title": { fr: "Support 7j/7", en: "Support 7 days a week", ar: "دعم طوال الأسبوع", es: "Soporte los 7 días", zh: "全周客服" },
  "trust.t4.desc": {
    fr: "Notre équipe est disponible 7j/7 par chat, téléphone et WhatsApp. Incident, question ou réclamation — nous répondons en moins d'1h.",
    en: "Our team is available 7 days a week by chat, phone and WhatsApp. Incident, question or complaint — we reply in under an hour.",
    ar: "فريقنا متاح طوال أيام الأسبوع عبر الدردشة والهاتف وواتساب. حادث أو سؤال أو شكوى — نردّ في أقل من ساعة.",
    es: "Nuestro equipo está disponible los 7 días por chat, teléfono y WhatsApp. Incidencia, duda o reclamación — respondemos en menos de 1 h.",
    zh: "我们的团队每周七天通过在线聊天、电话和 WhatsApp 提供服务。无论事故、咨询还是投诉，一小时内回复。",
  },
  "trust.certifLabel": { fr: "Certifications & standards :", en: "Certifications & standards:", ar: "الشهادات والمعايير:", es: "Certificaciones y estándares:", zh: "认证与标准：" },
  "trust.certEncryption": { fr: "Chiffrement",    en: "Encryption",     ar: "التشفير",      es: "Cifrado",         zh: "加密" },
  "trust.certCompliance": { fr: "Conformité",     en: "Compliance",     ar: "الامتثال",     es: "Cumplimiento",    zh: "合规" },
  "trust.certPasswords":  { fr: "Mots de passe",  en: "Passwords",      ar: "كلمات المرور", es: "Contraseñas",     zh: "密码" },
  "trust.certAuth":       { fr: "Authentification", en: "Authentication", ar: "المصادقة",   es: "Autenticación",   zh: "身份验证" },
  "trust.certHosting":    { fr: "Hébergeurs",     en: "Hosting",        ar: "الاستضافة",    es: "Alojamiento",     zh: "托管服务" },

  // ─── Bannière partenaire (accueil) ────────────────────────────────────────
  "vendor.tagPartner": { fr: "🚀 ESPACE PARTENAIRE", en: "🚀 PARTNER SPACE", ar: "🚀 فضاء الشريك", es: "🚀 ESPACIO DE SOCIO", zh: "🚀 合作伙伴空间" },
  "vendor.tagVisitor": { fr: "🤝 DEVENEZ PARTENAIRE", en: "🤝 BECOME A PARTNER", ar: "🤝 كن شريكاً", es: "🤝 SÉ NUESTRO SOCIO", zh: "🤝 成为合作伙伴" },
  "vendor.titlePartner": { fr: "Publiez votre prochain véhicule", en: "Publish your next vehicle", ar: "انشر مركبتك التالية", es: "Publica tu próximo vehículo", zh: "发布您的下一辆车" },
  "vendor.titleVisitor": { fr: "Vendez ou importez à l'international", en: "Sell or import internationally", ar: "بِع أو استورد دولياً", es: "Vende o importa a nivel internacional", zh: "面向国际销售或进口" },
  "vendor.descPartner": {
    fr: "Ajoutez une annonce en quelques minutes — location, vente, chauffeur ou import/export. Visibilité dans 20+ pays, paiements automatisés.",
    en: "Add a listing in minutes — rental, sale, chauffeur or import/export. Visibility in 20+ countries, automated payments.",
    ar: "أضف إعلاناً في دقائق — تأجير أو بيع أو سائق أو استيراد وتصدير. ظهور في أكثر من ٢٠ دولة ومدفوعات آلية.",
    es: "Añade un anuncio en minutos — alquiler, venta, chófer o importación/exportación. Visibilidad en más de 20 países, pagos automatizados.",
    zh: "几分钟内发布车源——租赁、销售、司机或进出口。覆盖 20 多个国家，自动结算。",
  },
  "vendor.descVisitor": {
    fr: "Rejoignez des centaines de partenaires sur 20+ pays — Afrique, Europe, Chine, Dubaï. Publication gratuite, clients vérifiés, revenus automatiques.",
    en: "Join hundreds of partners across 20+ countries — Africa, Europe, China, Dubai. Free listings, verified customers, automated earnings.",
    ar: "انضم إلى مئات الشركاء في أكثر من ٢٠ دولة — إفريقيا وأوروبا والصين ودبي. نشر مجاني وعملاء موثّقون وأرباح آلية.",
    es: "Únete a cientos de socios en más de 20 países — África, Europa, China, Dubái. Publicación gratuita, clientes verificados, ingresos automáticos.",
    zh: "加入 20 多个国家的数百家合作伙伴——非洲、欧洲、中国、迪拜。免费发布、客户认证、自动收款。",
  },
  "vendor.ctaPartner": { fr: "Publier une annonce →", en: "Publish a listing →", ar: "← انشر إعلاناً", es: "Publicar un anuncio →", zh: "发布车源 →" },
  "vendor.ctaVisitor": { fr: "Commencer gratuitement →", en: "Start for free →", ar: "← ابدأ مجاناً", es: "Empezar gratis →", zh: "免费开始 →" },
  "vendor.statCountries":    { fr: "Pays couverts",        en: "Countries covered", ar: "دولة مغطاة",        es: "Países cubiertos",   zh: "覆盖国家" },
  "vendor.statCountriesSub": { fr: "Afrique · Europe · Asie", en: "Africa · Europe · Asia", ar: "إفريقيا · أوروبا · آسيا", es: "África · Europa · Asia", zh: "非洲 · 欧洲 · 亚洲" },
  "vendor.statFees":         { fr: "Frais de publication", en: "Listing fees",      ar: "رسوم النشر",        es: "Gastos de publicación", zh: "发布费用" },
  "vendor.statFeesSub":      { fr: "toujours gratuit",     en: "always free",       ar: "مجاني دائماً",      es: "siempre gratis",     zh: "永久免费" },
  "vendor.statValidation":   { fr: "Validation",           en: "Approval",          ar: "المصادقة",          es: "Validación",         zh: "审核" },
  "vendor.statValidationSub":{ fr: "annonce en ligne",     en: "listing goes live", ar: "الإعلان على الإنترنت", es: "anuncio en línea", zh: "车源上线" },

  // ─── Appel à l'action final (accueil) ─────────────────────────────────────
  "routecta.badge":  { fr: "🌍 MARCHÉ AUTOMOBILE MONDIAL", en: "🌍 GLOBAL CAR MARKET", ar: "🌍 سوق السيارات العالمي", es: "🌍 MERCADO AUTOMOTRIZ MUNDIAL", zh: "🌍 全球汽车市场" },
  "routecta.title1": { fr: "Votre véhicule, depuis n'importe", en: "Your vehicle, from any", ar: "مركبتك، من أي", es: "Tu vehículo, desde cualquier", zh: "您的座驾，来自" },
  "routecta.title2": { fr: "quel pays du monde", en: "country in the world", ar: "بلد في العالم", es: "país del mundo", zh: "世界任何国家" },
  "routecta.desc": {
    fr: "Location, achat, import depuis la Chine, Dubaï ou l'Europe — inspection, transport, dédouanement et livraison gérés de bout en bout, avec paiement séquestré jusqu'à la remise du véhicule.",
    en: "Rental, purchase, import from China, Dubai or Europe — inspection, transport, customs clearance and delivery handled end to end, with funds held in escrow until the vehicle is handed over.",
    ar: "تأجير وشراء واستيراد من الصين أو دبي أو أوروبا — الفحص والنقل والتخليص الجمركي والتسليم تُدار بالكامل، مع حجز المبلغ في حساب ضمان حتى تسلُّم المركبة.",
    es: "Alquiler, compra e importación desde China, Dubái o Europa — inspección, transporte, despacho aduanero y entrega gestionados de principio a fin, con pago en depósito hasta la entrega del vehículo.",
    zh: "从中国、迪拜或欧洲租车、购车、进口——验车、运输、清关与交付全程包办，款项托管至交车为止。",
  },
  "routecta.h1": { fr: "Location & achat", en: "Rental & purchase", ar: "تأجير وشراء", es: "Alquiler y compra", zh: "租赁与购买" },
  "routecta.h2": { fr: "Import Chine · Dubaï · Europe", en: "Import China · Dubai · Europe", ar: "استيراد من الصين · دبي · أوروبا", es: "Importación China · Dubái · Europa", zh: "自中国 · 迪拜 · 欧洲进口" },
  "routecta.h3": { fr: "Paiement séquestré", en: "Escrow payment", ar: "دفع بضمان", es: "Pago en depósito", zh: "款项托管" },
  "routecta.h4": { fr: "Livraison GPS", en: "GPS delivery", ar: "توصيل بـ GPS", es: "Entrega GPS", zh: "GPS 配送" },
  "routecta.ctaCatalogue": { fr: "Explorer le catalogue", en: "Explore the catalogue", ar: "استكشف الفهرس", es: "Explorar el catálogo", zh: "浏览车源" },
  "routecta.ctaIE": { fr: "Import / Export →", en: "Import / Export →", ar: "← الاستيراد والتصدير", es: "Importación / Exportación →", zh: "进出口 →" },
};
