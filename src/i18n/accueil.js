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
    fr: "La plateforme automobile du Maroc — location, vente, chauffeurs, et import depuis la Chine, Dubaï ou l'Europe.",
    en: "Morocco's automotive platform — rental, sales, chauffeurs, and imports from China, Dubai or Europe.",
    ar: "منصة السيارات في المغرب — تأجير وبيع وسائقون، واستيراد من الصين أو دبي أو أوروبا.",
    es: "La plataforma automovilística de Marruecos — alquiler, venta, chóferes e importación desde China, Dubái o Europa.",
    zh: "摩洛哥汽车平台——租车、售车、司机服务，以及从中国、迪拜或欧洲进口。",
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
  "footer.worldwide":     { fr: "La plateforme automobile du Maroc", en: "Morocco's automotive platform", ar: "منصة السيارات في المغرب", es: "La plataforma automovilística de Marruecos", zh: "摩洛哥汽车平台" },
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
    fr: "Location, vente et import de véhicules au Maroc",
    en: "Vehicle rental, sales and import in Morocco",
    ar: "تأجير وبيع واستيراد السيارات في المغرب",
    es: "Alquiler, venta e importación de vehículos en Marruecos",
    zh: "摩洛哥租车、售车与汽车进口",
  },
  "home.metaDesc": {
    fr: "Louez, achetez ou importez votre véhicule au Maroc : agences et particuliers, chauffeurs privés, et import depuis la Chine, Dubaï ou l'Europe avec des professionnels suivis par VIT AUTO.",
    en: "Rent, buy or import your vehicle in Morocco: agencies and private sellers, chauffeurs, and imports from China, Dubai or Europe with professionals tracked by VIT AUTO.",
    ar: "استأجر أو اشترِ أو استورد سيارتك في المغرب: وكالات وأفراد، سائقون خاصون، واستيراد من الصين أو دبي أو أوروبا مع محترفين تتابعهم VIT AUTO.",
    es: "Alquila, compra o importa tu vehículo en Marruecos: agencias y particulares, chóferes privados e importación desde China, Dubái o Europa con profesionales supervisados por VIT AUTO.",
    zh: "在摩洛哥租车、买车或进口车辆：车行与个人卖家、私人司机，以及由 VIT AUTO 跟进的中国、迪拜或欧洲进口服务。",
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
  "why.title2": { fr: "au Maroc, et au-delà", en: "in Morocco, and beyond", ar: "في المغرب وما بعده", es: "en Marruecos, y más allá", zh: "立足摩洛哥，连接世界" },
  "why.sub": {
    fr: "De Casablanca à Marrakech — louez, achetez ou importez votre véhicule au Maroc, avec des partenaires identifiés.",
    en: "From Casablanca to Marrakech — rent, buy or import your vehicle in Morocco, with identified partners.",
    ar: "من الدار البيضاء إلى مراكش — استأجر أو اشترِ أو استورد سيارتك في المغرب مع شركاء معروفي الهوية.",
    es: "De Casablanca a Marrakech — alquila, compra o importa tu vehículo en Marruecos, con socios identificados.",
    zh: "从卡萨布兰卡到马拉喀什——在摩洛哥租车、买车或进口车辆，合作方身份明确。",
  },
  "why.f1.title": { fr: "Le Maroc d'abord", en: "Morocco first", ar: "المغرب أولاً", es: "Marruecos primero", zh: "以摩洛哥为先" },
  "why.f1.desc": {
    fr: "Des centaines de véhicules à louer ou à acheter au Maroc, et des exportateurs en Chine, aux Émirats et en Europe pour importer le vôtre.",
    en: "Hundreds of vehicles to rent or buy in Morocco, and exporters in China, the UAE and Europe to import yours.",
    ar: "مئات السيارات للإيجار أو الشراء في المغرب، ومصدّرون في الصين والإمارات وأوروبا لاستيراد سيارتك.",
    es: "Cientos de vehículos para alquilar o comprar en Marruecos, y exportadores en China, los Emiratos y Europa para importar el tuyo.",
    zh: "摩洛哥数百辆车可租可买，另有中国、阿联酋和欧洲的出口商助您进口。",
  },
  "why.f2.title": { fr: "Livraison GPS précise", en: "Precise GPS delivery", ar: "توصيل دقيق بنظام GPS", es: "Entrega GPS precisa", zh: "GPS 精准配送" },
  "why.f2.desc": {
    fr: "Votre véhicule livré à domicile grâce au calcul GPS en temps réel. Frais transparents dès la réservation — distance réelle, zéro surprise.",
    en: "Your vehicle delivered to your door through real-time GPS calculation. Transparent fees from the moment you book — real distance, no surprises.",
    ar: "مركبتك تُسلَّم إلى باب منزلك بحساب GPS فوري. رسوم واضحة منذ الحجز — مسافة حقيقية بلا مفاجآت.",
    es: "Tu vehículo entregado a domicilio gracias al cálculo GPS en tiempo real. Tarifas transparentes desde la reserva — distancia real, sin sorpresas.",
    zh: "通过实时 GPS 计算，将车辆送到您家门口。下单即显示透明费用——按实际距离计算，绝无隐藏收费。",
  },
  "why.f3.title": { fr: "Paiement sécurisé", en: "Secure payment", ar: "دفع آمن", es: "Pago seguro", zh: "安全支付" },
  "why.f3.desc": {
    fr: "Vous réglez directement le partenaire, par les moyens qu'il accepte (Orange Money, Wave, carte, virement…). VIT AUTO ne détient jamais vos fonds, et le site est entièrement chiffré.",
    en: "You pay the partner directly, by the methods they accept (Orange Money, Wave, card, transfer…). VIT AUTO never holds your money, and the whole site is encrypted.",
    ar: "تدفع للشريك مباشرة بالوسائل التي يقبلها (أورنج موني، ويف، البطاقة، التحويل…). لا تحتفظ VIT AUTO بأموالك أبداً، والموقع مشفّر بالكامل.",
    es: "Pagas directamente al socio, con los medios que acepta (Orange Money, Wave, tarjeta, transferencia…). VIT AUTO nunca retiene tu dinero y todo el sitio está cifrado.",
    zh: "您直接向商家付款，使用其接受的方式（Orange Money、Wave、银行卡、转账等）。VIT AUTO 从不经手您的资金，全站加密。",
  },
  "why.f4.title": { fr: "Import accompagné", en: "Guided import", ar: "استيراد بمرافقة", es: "Importación acompañada", zh: "进口全程协助" },
  "why.f4.desc": {
    fr: "Commandez depuis la Chine, Dubaï ou l'Europe. VIT AUTO vous met en relation avec des exportateurs, inspecteurs, transporteurs et transitaires, et suit votre dossier jusqu'à la livraison.",
    en: "Order from China, Dubai or Europe. VIT AUTO connects you with exporters, inspectors, carriers and freight forwarders, and tracks your file through to delivery.",
    ar: "اطلب من الصين أو دبي أو أوروبا. تضعك VIT AUTO على تواصل مع المصدّرين والمفتشين والناقلين ووكلاء العبور، وتتابع ملفك حتى التسليم.",
    es: "Pide desde China, Dubái o Europa. VIT AUTO te pone en contacto con exportadores, inspectores, transportistas y transitarios, y sigue tu expediente hasta la entrega.",
    zh: "可从中国、迪拜或欧洲下单。VIT AUTO 为您对接出口商、验车机构、承运商与货代，并跟进您的订单直至交付。",
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
    fr: "Les partenaires « vérifiés » ont fait contrôler par VIT AUTO leur identité et leurs documents d'entreprise (registre, identifiant fiscal).",
    en: "\"Verified\" partners have had their identity and company documents (registration, tax ID) checked by VIT AUTO.",
    ar: "الشركاء «الموثّقون» خضعت هويتهم ووثائق شركاتهم (السجل التجاري، الرقم الضريبي) لتدقيق VIT AUTO.",
    es: "Los socios «verificados» han hecho comprobar por VIT AUTO su identidad y los documentos de su empresa (registro, identificación fiscal).",
    zh: "「已认证」商家的身份及企业证件（工商注册、税号）已由 VIT AUTO 审核。",
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
    fr: "Chaque réservation sur VIT AUTO est encadrée — identités vérifiées, site chiffré, contrats signés.",
    en: "Every booking on VIT AUTO is framed — verified identities, encrypted site, signed contracts.",
    ar: "كل حجز على VIT AUTO مؤطَّر — هويات موثّقة، موقع مشفّر، عقود موقّعة.",
    es: "Cada reserva en VIT AUTO está respaldada — identidades verificadas, sitio cifrado, contratos firmados.",
    zh: "VIT AUTO 上的每笔预订都有保障——身份已核验、全站加密、合同已签署。",
  },
  "trust.t1.title": { fr: "Identités vérifiées", en: "Verified identities", ar: "هويات موثّقة", es: "Identidades verificadas", zh: "身份认证" },
  "trust.t1.desc": {
    fr: "Chaque compte est vérifié par pièce d'identité (CNI ou passeport). Clients et partenaires sont authentifiés avant toute transaction.",
    en: "Every account is verified with an identity document (ID card or passport). Customers and partners are authenticated before any transaction.",
    ar: "يُوثَّق كل حساب بوثيقة هوية (بطاقة وطنية أو جواز سفر). يتم التحقق من العملاء والشركاء قبل أي معاملة.",
    es: "Cada cuenta se verifica con un documento de identidad (DNI o pasaporte). Clientes y socios se autentican antes de cualquier transacción.",
    zh: "每个账户均通过身份证件（身份证或护照）验证。客户与合作伙伴在交易前完成认证。",
  },
  "trust.t2.title": { fr: "Caution transparente", en: "Transparent deposit", ar: "وديعة واضحة", es: "Fianza transparente", zh: "押金透明" },
  "trust.t2.desc": {
    fr: "Le montant de la caution est indiqué avant la réservation et versé au partenaire, selon ses conditions. Il est restitué au retour du véhicule.",
    en: "The deposit amount is shown before you book and is paid to the partner, under their terms. It is returned when the vehicle comes back.",
    ar: "يُعرض مبلغ الوديعة قبل الحجز ويُدفع للشريك وفق شروطه، ويُعاد عند إرجاع المركبة.",
    es: "El importe de la fianza se indica antes de reservar y se paga al socio, según sus condiciones. Se devuelve al devolver el vehículo.",
    zh: "押金金额在预订前显示，按合作伙伴的条款支付给合作伙伴，车辆归还时退还。",
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
    fr: "Ajoutez une annonce en quelques minutes — location, vente, chauffeur ou import/export. Vos clients au Maroc vous trouvent et vous contactent directement.",
    en: "Add a listing in minutes — rental, sale, chauffeur or import/export. Customers in Morocco find you and contact you directly.",
    ar: "أضف إعلاناً في دقائق — تأجير أو بيع أو سائق أو استيراد/تصدير. يجدك عملاؤك في المغرب ويتواصلون معك مباشرة.",
    es: "Añade un anuncio en minutos — alquiler, venta, chófer o importación/exportación. Tus clientes en Marruecos te encuentran y te contactan directamente.",
    zh: "几分钟即可发布信息——租车、售车、司机或进出口。摩洛哥的客户会直接找到并联系您。",
  },
  "vendor.descVisitor": {
    fr: "Rejoignez les agences et particuliers qui publient sur VIT AUTO au Maroc et en France. Publication gratuite, clients vérifiés.",
    en: "Join the agencies and private sellers listing on VIT AUTO in Morocco and France. Free listing, verified customers.",
    ar: "انضم إلى الوكالات والأفراد الذين ينشرون على VIT AUTO في المغرب وفرنسا. نشر مجاني، عملاء موثّقون.",
    es: "Únete a las agencias y particulares que publican en VIT AUTO en Marruecos y Francia. Publicación gratuita, clientes verificados.",
    zh: "加入在摩洛哥和法国发布车辆的车行与个人卖家。免费发布，客户已核验。",
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
    fr: "Location et achat au Maroc, import depuis la Chine, Dubaï ou l'Europe avec des professionnels vérifiés. Les modalités de paiement de chaque transaction sont précisées avant sa confirmation.",
    en: "Rental and purchase in Morocco, imports from China, Dubai or Europe with verified professionals. Payment terms for each transaction are set out before it is confirmed.",
    ar: "تأجير وشراء في المغرب، واستيراد من الصين أو دبي أو أوروبا مع محترفين موثّقين. تُحدَّد شروط الدفع لكل معاملة قبل تأكيدها.",
    es: "Alquiler y compra en Marruecos, importación desde China, Dubái o Europa con profesionales verificados. Las condiciones de pago de cada operación se precisan antes de confirmarla.",
    zh: "在摩洛哥租车、购车，并通过已核验的专业方从中国、迪拜或欧洲进口。每笔交易的付款方式在确认前明确说明。",
  },
  "routecta.h1": { fr: "Location & achat", en: "Rental & purchase", ar: "تأجير وشراء", es: "Alquiler y compra", zh: "租赁与购买" },
  "routecta.h2": { fr: "Import Chine · Dubaï · Europe", en: "Import China · Dubai · Europe", ar: "استيراد من الصين · دبي · أوروبا", es: "Importación China · Dubái · Europa", zh: "自中国 · 迪拜 · 欧洲进口" },
  "routecta.h3": { fr: "Paiement sécurisé", en: "Secure payment", ar: "دفع آمن", es: "Pago seguro", zh: "安全支付" },
  "routecta.h4": { fr: "Livraison GPS", en: "GPS delivery", ar: "توصيل بـ GPS", es: "Entrega GPS", zh: "GPS 配送" },
  "routecta.ctaCatalogue": { fr: "Explorer le catalogue", en: "Explore the catalogue", ar: "استكشف الفهرس", es: "Explorar el catálogo", zh: "浏览车源" },
  "routecta.ctaIE": { fr: "Import / Export →", en: "Import / Export →", ar: "← الاستيراد والتصدير", es: "Importación / Exportación →", zh: "进出口 →" },
};
