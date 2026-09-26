/**
 * Traductions — /plans (Tarifs et abonnements) et les constantes qu'elle lit.
 *
 * Les libellés de secteur (`sect.*`) et d'outil (`outil.*`) sont traduits À
 * L'AFFICHAGE via libelleTraduit() : SECTEUR_LABELS et OUTILS_PAR_SECTEUR
 * servent aussi à l'administration, qui reste en français, et dupliquer ces
 * tables en cinq langues à la source les ferait diverger.
 */
export default {

  // ─── Secteurs d'activité ──────────────────────────────────────────────────
  "sect.loueur":      { fr: "Location", en: "Rental", ar: "تأجير", es: "Alquiler", zh: "租赁" },
  "sect.vendeur":     { fr: "Vente", en: "Sales", ar: "بيع", es: "Venta", zh: "销售" },
  "sect.exportateur": { fr: "Import / Export", en: "Import / Export", ar: "استيراد / تصدير", es: "Importación / Exportación", zh: "进口 / 出口" },
  "sect.chauffeur":   { fr: "Chauffeur", en: "Chauffeur", ar: "سائق", es: "Chófer", zh: "司机" },
  "sect.loisirs":     { fr: "Activités & loisirs", en: "Activities & leisure", ar: "أنشطة وترفيه", es: "Actividades y ocio", zh: "活动与休闲" },
  "sect.pieces":      { fr: "Pièces détachées", en: "Spare parts", ar: "قطع الغيار", es: "Repuestos", zh: "汽车配件" },

  // ─── Outils par secteur (OUTILS_PAR_SECTEUR) ──────────────────────────────
  "outil.partsImport":    { fr: "Import du catalogue par fichier (CSV, Excel, Google Sheets)", en: "Catalogue import from a file (CSV, Excel, Google Sheets)", ar: "استيراد الفهرس من ملف (CSV، Excel، Google Sheets)", es: "Importación del catálogo por archivo (CSV, Excel, Google Sheets)", zh: "通过文件导入目录（CSV、Excel、Google 表格）" },
  "outil.shippingZones":  { fr: "Frais de port par zone de pays", en: "Shipping rates by country zone", ar: "رسوم الشحن حسب منطقة البلدان", es: "Gastos de envío por zona de países", zh: "按国家分区的运费" },
  "outil.stockAlert":     { fr: "Alerte de stock bas, par référence", en: "Low-stock alert, per reference", ar: "تنبيه انخفاض المخزون، لكل مرجع", es: "Alerta de stock bajo, por referencia", zh: "按编号的低库存提醒" },
  "outil.seasonalRates":  { fr: "Tarifs saisonniers — haute et basse saison", en: "Seasonal rates — high and low season", ar: "أسعار موسمية — الموسم المرتفع والمنخفض", es: "Tarifas de temporada — alta y baja", zh: "季节性定价——旺季与淡季" },
  "outil.promotions":     { fr: "Promotions multi-paliers (−10 % à 3 jours, −20 % à 7)", en: "Tiered promotions (−10 % at 3 days, −20 % at 7)", ar: "عروض متعددة المستويات (−١٠ ٪ لثلاثة أيام، −٢٠ ٪ لسبعة)", es: "Promociones por niveles (−10 % a 3 días, −20 % a 7)", zh: "多档促销（3 天 −10 %，7 天 −20 %）" },
  "outil.fleetImport":    { fr: "Import de flotte par fichier (CSV, Excel, Google Sheets)", en: "Fleet import from a file (CSV, Excel, Google Sheets)", ar: "استيراد الأسطول من ملف (CSV، Excel، Google Sheets)", es: "Importación de flota por archivo (CSV, Excel, Google Sheets)", zh: "通过文件导入车队（CSV、Excel、Google 表格）" },
  "outil.fleetMgmt":      { fr: "Gestion de parc : planning, entretien, journal de chaque véhicule", en: "Fleet management: scheduling, servicing, per-vehicle log", ar: "إدارة الأسطول: الجدولة والصيانة وسجل لكل مركبة", es: "Gestión de flota: planificación, mantenimiento, historial por vehículo", zh: "车队管理：排期、保养、每车日志" },
  "outil.fleetApi":       { fr: "Synchronisation du parc par API depuis votre logiciel", en: "Fleet synchronisation by API from your own software", ar: "مزامنة الأسطول عبر واجهة برمجية من برنامجك", es: "Sincronización de flota por API desde tu software", zh: "通过 API 从贵司系统同步车队" },
  "outil.marketPrice":    { fr: "Prix face au marché sur chaque annonce", en: "Price against the market on every listing", ar: "مقارنة السعر بالسوق في كل إعلان", es: "Precio frente al mercado en cada anuncio", zh: "每条房源的市场比价" },
  "outil.crmSales":       { fr: "CRM intégré : demandes d'essai, leads et devis", en: "Built-in CRM: test-drive requests, leads and quotes", ar: "نظام CRM مدمج: طلبات التجربة والعملاء وعروض الأسعار", es: "CRM integrado: solicitudes de prueba, leads y presupuestos", zh: "内置 CRM：试驾申请、线索与报价" },
  "outil.showroom":       { fr: "Showroom public personnalisé", en: "Custom public showroom", ar: "صالة عرض عامة مخصصة", es: "Showroom público personalizado", zh: "定制公开展厅" },
  "outil.salesReport":    { fr: "Bilan mensuel des ventes et des essais par e-mail", en: "Monthly sales and test-drive report by email", ar: "تقرير شهري للمبيعات والتجارب عبر البريد", es: "Informe mensual de ventas y pruebas por correo", zh: "每月销售与试驾邮件报告" },
  "outil.stockApi":       { fr: "Synchronisation du stock par API", en: "Stock synchronisation by API", ar: "مزامنة المخزون عبر واجهة برمجية", es: "Sincronización de stock por API", zh: "通过 API 同步库存" },
  "outil.financeFile":    { fr: "Dossier financement et crédit intégré à la vente", en: "Financing and credit file built into the sale", ar: "ملف تمويل وائتمان مدمج في عملية البيع", es: "Expediente de financiación y crédito integrado en la venta", zh: "销售流程内置融资与信贷档案" },
  "outil.incoterms":      { fr: "Calculateur Incoterms 2020 sur chaque annonce", en: "Incoterms 2020 calculator on every listing", ar: "حاسبة إنكوترمز ٢٠٢٠ في كل إعلان", es: "Calculadora Incoterms 2020 en cada anuncio", zh: "每条房源的 2020 版国际贸易术语计算器" },
  "outil.fileTracking":   { fr: "Suivi de dossier complet : inspection, séquestre, transport", en: "Full file tracking: inspection, escrow, shipping", ar: "متابعة كاملة للملف: الفحص، الضمان، الشحن", es: "Seguimiento completo del expediente: inspección, depósito, transporte", zh: "完整案件跟踪：检验、托管、运输" },
  "outil.earlyIeLeads":   { fr: "Demandes import/export des visiteurs reçues en avance", en: "Visitors' import/export requests received ahead of others", ar: "طلبات الاستيراد/التصدير من الزوار قبل الآخرين", es: "Solicitudes de importación/exportación de visitantes recibidas antes", zh: "优先接收访客的进出口需求" },
  "outil.loiDocs":        { fr: "Documents LOI et accord partenaire", en: "LOI and partner agreement documents", ar: "مستندات خطاب النوايا واتفاقية الشريك", es: "Documentos LOI y acuerdo de socio", zh: "意向书与合作协议文件" },
  "outil.crmExport":      { fr: "CRM export multi-devises", en: "Multi-currency export CRM", ar: "نظام CRM للتصدير متعدد العملات", es: "CRM de exportación multidivisa", zh: "多币种出口 CRM" },
  "outil.resellerApi":    { fr: "API catalogue pour vos revendeurs", en: "Catalogue API for your resellers", ar: "واجهة برمجة الفهرس لموزّعيك", es: "API de catálogo para tus distribuidores", zh: "面向经销商的目录 API" },
  "outil.importCost":     { fr: "Estimation du coût d'import affichée au client", en: "Import cost estimate shown to the customer", ar: "تقدير تكلفة الاستيراد معروض للعميل", es: "Estimación del coste de importación mostrada al cliente", zh: "向客户展示进口成本估算" },
  "outil.driverSpotlight":{ fr: "Profil mis en avant dans la rubrique Chauffeurs", en: "Profile highlighted in the Chauffeurs section", ar: "إبراز الملف في قسم السائقين", es: "Perfil destacado en la sección Chóferes", zh: "在司机版块突出展示资料" },
  "outil.driverPlanning": { fr: "Planning et indisponibilités", en: "Scheduling and time off", ar: "الجدولة وأوقات عدم التوفر", es: "Planificación e indisponibilidades", zh: "排班与不可用时段" },
  "outil.driverCompany":  { fr: "Société de chauffeurs : plusieurs chauffeurs sous un même compte", en: "Chauffeur company: several drivers under one account", ar: "شركة سائقين: عدة سائقين تحت حساب واحد", es: "Empresa de chóferes: varios conductores en una sola cuenta", zh: "司机公司：一个账户管理多名司机" },
  "outil.leisureSpotlight":{ fr: "Mise en avant dans la rubrique Loisirs", en: "Highlighted in the Leisure section", ar: "إبراز في قسم الترفيه", es: "Destacado en la sección Ocio", zh: "在休闲版块突出展示" },
  "outil.leisureSlots":   { fr: "Créneaux et capacité par séance", en: "Time slots and capacity per session", ar: "الفترات الزمنية والسعة لكل جلسة", es: "Franjas horarias y capacidad por sesión", zh: "每场次的时段与容量" },
  "outil.weatherClose":   { fr: "Fermeture automatique selon la météo", en: "Automatic closure based on the weather", ar: "إغلاق تلقائي حسب الطقس", es: "Cierre automático según la meteorología", zh: "依天气自动关闭" },
  "outil.groupRates":     { fr: "Tarifs de groupe et de saison", en: "Group and seasonal rates", ar: "أسعار المجموعات والمواسم", es: "Tarifas de grupo y de temporada", zh: "团体与季节价" },
  "outil.instructorTeam": { fr: "Équipe de moniteurs sous un même compte", en: "Team of instructors under one account", ar: "فريق مدرّبين تحت حساب واحد", es: "Equipo de monitores en una sola cuenta", zh: "一个账户管理教练团队" },

  // ─── Page Tarifs : descriptions des plans ─────────────────────────────────
  "plans.desc.free":        { fr: "Le strict nécessaire pour encaisser votre première transaction, quel que soit votre métier.", en: "The bare essentials to take your first transaction, whatever your trade.", ar: "الحد الأدنى اللازم لإتمام أول معاملة لك، مهما كان نشاطك.", es: "Lo imprescindible para cobrar tu primera transacción, sea cual sea tu oficio.", zh: "完成第一笔交易所需的最低配置，适用于任何业务。" },
  "plans.desc.individuel":  { fr: "Plus de visibilité dans votre métier, pour un indépendant comme pour une petite structure.", en: "More visibility in your trade, for a freelancer or a small outfit alike.", ar: "ظهور أكبر في مجالك، للمستقل وللمنشأة الصغيرة على حد سواء.", es: "Más visibilidad en tu oficio, tanto para autónomos como para pequeñas estructuras.", zh: "提升本行业曝光，适合个人与小型机构。" },
  "plans.desc.business":    { fr: "Une structure avec une équipe, ou deux métiers sur un même compte — l'agence qui loue et vend.", en: "A team-run business, or two trades on one account — the agency that rents and sells.", ar: "منشأة بفريق عمل، أو نشاطان في حساب واحد — الوكالة التي تؤجّر وتبيع.", es: "Una estructura con equipo, o dos oficios en una cuenta — la agencia que alquila y vende.", zh: "有团队的机构，或一个账户经营两种业务——既租赁又销售的门店。" },
  "plans.desc.exportateur": { fr: "Volume, API et CRM, tous secteurs confondus — le groupe qui loue, vend et exporte.", en: "Volume, API and CRM across every sector — the group that rents, sells and exports.", ar: "حجم كبير وواجهة برمجية ونظام CRM في كل القطاعات — المجموعة التي تؤجّر وتبيع وتصدّر.", es: "Volumen, API y CRM en todos los sectores — el grupo que alquila, vende y exporta.", zh: "覆盖各业务的规模、API 与 CRM——既租赁、销售又出口的集团。" },
  "plans.desc.entreprise":  { fr: "Pour les grands réseaux, flottes multi-pays et volumes importants — tarification personnalisée.", en: "For large networks, multi-country fleets and high volumes — custom pricing.", ar: "للشبكات الكبيرة والأساطيل متعددة الدول والأحجام الكبيرة — تسعير مخصص.", es: "Para grandes redes, flotas multipaís y volúmenes altos — precios personalizados.", zh: "面向大型网络、跨国车队与大批量业务——定制定价。" },

  // ─── Page Tarifs : avantages communs ──────────────────────────────────────
  "plans.f.allSectors":   { fr: "Tous les secteurs d'activité sur un même compte", en: "Every business sector on a single account", ar: "كل قطاعات النشاط في حساب واحد", es: "Todos los sectores de actividad en una sola cuenta", zh: "一个账户涵盖全部业务板块" },
  "plans.f.oneSector":    { fr: "{n} secteur d'activité (location, vente, export, chauffeur ou loisirs)", en: "{n} business sector (rental, sales, export, chauffeur or leisure)", ar: "{n} قطاع نشاط (تأجير، بيع، تصدير، سائق أو ترفيه)", es: "{n} sector de actividad (alquiler, venta, exportación, chófer u ocio)", zh: "{n} 个业务板块（租赁、销售、出口、司机或休闲）" },
  "plans.f.nSectors":     { fr: "{n} secteurs d'activité (location, vente, export, chauffeur ou loisirs)", en: "{n} business sectors (rental, sales, export, chauffeur or leisure)", ar: "{n} قطاعات نشاط (تأجير، بيع، تصدير، سائق أو ترفيه)", es: "{n} sectores de actividad (alquiler, venta, exportación, chófer u ocio)", zh: "{n} 个业务板块（租赁、销售、出口、司机或休闲）" },
  "plans.f.unlimitedAds": { fr: "Annonces illimitées", en: "Unlimited listings", ar: "إعلانات غير محدودة", es: "Anuncios ilimitados", zh: "不限房源数量" },
  "plans.f.quotaUntil":   { fr: "Annonces illimitées jusqu'au {date}, puis {n} annonces actives par secteur", en: "Unlimited listings until {date}, then {n} active listings per sector", ar: "إعلانات غير محدودة حتى {date}، ثم {n} إعلاناً نشطاً لكل قطاع", es: "Anuncios ilimitados hasta el {date}, luego {n} anuncios activos por sector", zh: "在 {date} 之前不限房源，之后每个板块 {n} 条在线房源" },
  "plans.f.quota":        { fr: "{n} annonces actives par secteur", en: "{n} active listings per sector", ar: "{n} إعلاناً نشطاً لكل قطاع", es: "{n} anuncios activos por sector", zh: "每个板块 {n} 条在线房源" },
  "plans.f.fullProfile":  { fr: "Profil partenaire complet", en: "Complete partner profile", ar: "ملف شريك كامل", es: "Perfil de socio completo", zh: "完整的合作伙伴资料" },
  "plans.f.receiveLeads": { fr: "Réception des demandes clients", en: "Customer requests delivered to you", ar: "استقبال طلبات العملاء", es: "Recepción de solicitudes de clientes", zh: "接收客户需求" },
  "plans.f.digitalContract": { fr: "Contrat digital automatique", en: "Automatic digital contract", ar: "عقد رقمي تلقائي", es: "Contrato digital automático", zh: "自动数字合同" },
  "plans.f.topRank":      { fr: "Classement prioritaire", en: "Priority ranking", ar: "ترتيب ذو أولوية", es: "Posicionamiento prioritario", zh: "优先排序" },
  "plans.f.topRankPlus":  { fr: "Classement prioritaire renforcé", en: "Enhanced priority ranking", ar: "ترتيب ذو أولوية معزّزة", es: "Posicionamiento prioritario reforzado", zh: "强化优先排序" },
  "plans.f.advStats":     { fr: "Statistiques avancées", en: "Advanced statistics", ar: "إحصاءات متقدمة", es: "Estadísticas avanzadas", zh: "高级统计" },
  "plans.f.proBadge":     { fr: "Badge « Pro » sur vos annonces", en: "“Pro” badge on your listings", ar: "شارة «Pro» على إعلاناتك", es: "Distintivo «Pro» en tus anuncios", zh: "房源上的「Pro」标识" },
  "plans.f.proBadgeAll":  { fr: "Badge « Pro » sur toutes vos annonces", en: "“Pro” badge on all your listings", ar: "شارة «Pro» على كل إعلاناتك", es: "Distintivo «Pro» en todos tus anuncios", zh: "全部房源均带「Pro」标识" },
  "plans.f.allOf":        { fr: "Tout du plan {plan}", en: "Everything in the {plan} plan", ar: "كل ما في خطة {plan}", es: "Todo el plan {plan}", zh: "包含 {plan} 套餐全部内容" },
  "plans.f.boosts":       { fr: "{n} mises en avant incluses chaque mois", en: "{n} spotlights included every month", ar: "{n} إبرازات مشمولة كل شهر", es: "{n} destacados incluidos cada mes", zh: "每月含 {n} 次推荐位" },
  "plans.f.perfStats":    { fr: "Statistiques de performance : vues, conversion, prix face au marché", en: "Performance statistics: views, conversion, price against the market", ar: "إحصاءات الأداء: المشاهدات، التحويل، السعر مقابل السوق", es: "Estadísticas de rendimiento: vistas, conversión, precio frente al mercado", zh: "业绩统计：浏览、转化、市场比价" },
  "plans.f.statsPerAd":   { fr: "Statistiques de performance par annonce", en: "Performance statistics per listing", ar: "إحصاءات الأداء لكل إعلان", es: "Estadísticas de rendimiento por anuncio", zh: "按房源的业绩统计" },
  "plans.f.statsExport":  { fr: "Export des statistiques au format tableur", en: "Statistics export to a spreadsheet", ar: "تصدير الإحصاءات إلى جدول بيانات", es: "Exportación de estadísticas en formato hoja de cálculo", zh: "统计数据导出为表格" },
  "plans.f.noStatsExport":{ fr: "Export des statistiques", en: "Statistics export", ar: "تصدير الإحصاءات", es: "Exportación de estadísticas", zh: "统计数据导出" },
  "plans.f.support":      { fr: "Assistance sous {n} h", en: "Support within {n} h", ar: "دعم خلال {n} ساعة", es: "Asistencia en {n} h", zh: "{n} 小时内支持" },
  "plans.f.supportPrio":  { fr: "Assistance prioritaire — première réponse sous {n} h", en: "Priority support — first reply within {n} h", ar: "دعم ذو أولوية — أول ردّ خلال {n} ساعة", es: "Asistencia prioritaria — primera respuesta en {n} h", zh: "优先支持——{n} 小时内首次回复" },
  "plans.f.seat":         { fr: "{n} place en vitrine d'accueil, en rotation", en: "{n} slot in the home showcase, on rotation", ar: "{n} مكان في واجهة الصفحة الرئيسية بالتناوب", es: "{n} espacio en el escaparate de inicio, en rotación", zh: "首页橱窗 {n} 个轮播位" },
  "plans.f.seats":        { fr: "{n} places en vitrine d'accueil, en rotation", en: "{n} slots in the home showcase, on rotation", ar: "{n} أماكن في واجهة الصفحة الرئيسية بالتناوب", es: "{n} espacios en el escaparate de inicio, en rotación", zh: "首页橱窗 {n} 个轮播位" },
  "plans.f.multiUser":    { fr: "Multi-utilisateurs", en: "Multiple users", ar: "متعدد المستخدمين", es: "Multiusuario", zh: "多用户" },
  "plans.f.apiAccess":    { fr: "Accès API", en: "API access", ar: "الوصول إلى واجهة البرمجة", es: "Acceso a la API", zh: "API 接入" },
  "plans.f.apiSync":      { fr: "Accès API : synchronisez votre parc depuis votre propre logiciel", en: "API access: synchronise your fleet from your own software", ar: "الوصول إلى واجهة البرمجة: زامن أسطولك من برنامجك الخاص", es: "Acceso a la API: sincroniza tu flota desde tu propio software", zh: "API 接入：从贵司系统同步车队" },
  "plans.f.userSeats":    { fr: "{n} accès utilisateurs (gérant + agents)", en: "{n} user seats (manager + agents)", ar: "{n} حسابات مستخدمين (المدير + الوكلاء)", es: "{n} accesos de usuario (gerente + agentes)", zh: "{n} 个用户席位（管理者 + 业务员）" },
  "plans.f.userSeatsPlain": { fr: "{n} accès utilisateurs", en: "{n} user seats", ar: "{n} حسابات مستخدمين", es: "{n} accesos de usuario", zh: "{n} 个用户席位" },
  "plans.f.earlyLeads":   { fr: "Demandes clients {n} h avant les autres partenaires", en: "Customer requests {n} h before other partners", ar: "طلبات العملاء قبل الشركاء الآخرين بـ {n} ساعة", es: "Solicitudes de clientes {n} h antes que los demás socios", zh: "比其他合作伙伴提前 {n} 小时获得客户需求" },
  "plans.f.monthlyReport":{ fr: "Bilan mensuel de vos performances par e-mail", en: "Monthly performance report by email", ar: "تقرير أداء شهري عبر البريد الإلكتروني", es: "Informe mensual de rendimiento por correo", zh: "每月业绩邮件报告" },
  "plans.f.crm":          { fr: "CRM intégré (leads et devis)", en: "Built-in CRM (leads and quotes)", ar: "نظام CRM مدمج (العملاء وعروض الأسعار)", es: "CRM integrado (leads y presupuestos)", zh: "内置 CRM（线索与报价）" },
  "plans.f.unlimited":    { fr: "Fonctionnalités illimitées", en: "Unlimited features", ar: "ميزات غير محدودة", es: "Funcionalidades ilimitadas", zh: "功能不限" },
  "plans.f.multiDash":    { fr: "Tableau de bord multi-utilisateurs", en: "Multi-user dashboard", ar: "لوحة تحكم متعددة المستخدمين", es: "Panel multiusuario", zh: "多用户仪表盘" },
  "plans.f.accountMgr":   { fr: "Account manager dédié", en: "Dedicated account manager", ar: "مدير حساب مخصص", es: "Gestor de cuenta dedicado", zh: "专属客户经理" },
  "plans.f.customQuote":  { fr: "Devis manuel adapté à votre volume", en: "Manual quote matched to your volume", ar: "عرض سعر يدوي يناسب حجمك", es: "Presupuesto manual adaptado a tu volumen", zh: "按业务量人工报价" },

  // ─── Page Tarifs : divers ─────────────────────────────────────────────────
  "plans.f.shortLink":    { fr: "Lien court {lien} + QR code à imprimer", en: "Short link {lien} + printable QR code", ar: "رابط قصير {lien} + رمز QR للطباعة", es: "Enlace corto {lien} + código QR imprimible", zh: "短链接 {lien} + 可打印二维码" },
  "plans.f.viewsPerAd":   { fr: "Vues de chaque annonce", en: "Views on each listing", ar: "مشاهدات كل إعلان", es: "Vistas de cada anuncio", zh: "每条房源的浏览量" },
  "plans.freeReally":     { fr: "Ce que le palier gratuit donne déjà", en: "What the free tier already gives you", ar: "ما تمنحه الباقة المجانية أصلاً", es: "Lo que el plan gratuito ya te da", zh: "免费套餐已经提供的内容" },
  "plans.metaDesc":       { fr: "Commissions transparentes et abonnements partenaires VIT AUTO. Publier une annonce est gratuit ; vous ne payez qu'à la transaction.", en: "Transparent commissions and VIT AUTO partner subscriptions. Listing is free; you only pay on a transaction.", ar: "عمولات شفافة واشتراكات شركاء VIT AUTO. النشر مجاني؛ لا تدفع إلا عند إتمام معاملة.", es: "Comisiones transparentes y suscripciones de socios VIT AUTO. Publicar un anuncio es gratis; solo pagas al cerrar una transacción.", zh: "透明佣金与 VIT AUTO 合作伙伴订阅。发布房源免费；仅在成交时付费。" },
  "plans.currentPlan":    { fr: "Plan actuel", en: "Current plan", ar: "الخطة الحالية", es: "Plan actual", zh: "当前套餐" },
  "plans.choosePlan":     { fr: "Choisir {plan}", en: "Choose {plan}", ar: "اختر {plan}", es: "Elegir {plan}", zh: "选择 {plan}" },
  "plans.badge.recommended": { fr: "⭐ Recommandé", en: "⭐ Recommended", ar: "⭐ موصى به", es: "⭐ Recomendado", zh: "⭐ 推荐" },
  "plans.badge.volume":   { fr: "🌍 Volume", en: "🌍 Volume", ar: "🌍 حجم كبير", es: "🌍 Volumen", zh: "🌍 规模" },
  "plans.badge.quote":    { fr: "🏢 Sur devis", en: "🏢 On quotation", ar: "🏢 حسب عرض السعر", es: "🏢 Bajo presupuesto", zh: "🏢 按需报价" },
  "plans.promoPh":        { fr: "Code promo (optionnel)", en: "Promo code (optional)", ar: "رمز ترويجي (اختياري)", es: "Código promocional (opcional)", zh: "优惠码（可选）" },
  "plans.sectorTabs":     { fr: "Votre secteur d'activité", en: "Your business sector", ar: "قطاع نشاطك", es: "Tu sector de actividad", zh: "您的业务板块" },
  "plans.soonNote":       { fr: "🔜 en préparation — non inclus aujourd'hui, ne comptez pas dessus pour choisir.", en: "🔜 in the works — not included today, do not base your choice on it.", ar: "🔜 قيد الإعداد — غير مشمول اليوم، لا تبنِ اختيارك عليه.", es: "🔜 en preparación — hoy no está incluido, no lo tengas en cuenta para elegir.", zh: "🔜 开发中——目前不含此项，请勿据此做选择。" },
  "plans.founderTail":    { fr: "Taux préférentiel pendant {n} mois, retour automatique au tarif standard ensuite.", en: "Preferential rate for {n} months, automatic return to the standard rate afterwards.", ar: "سعر تفضيلي لمدة {n} شهراً، ثم العودة تلقائياً إلى السعر القياسي.", es: "Tarifa preferente durante {n} meses, con vuelta automática a la tarifa estándar después.", zh: "{n} 个月优惠费率，期满自动恢复标准费率。" },
  "plans.choose.sub2":    { fr: "Gratuit pour démarrer — les abonnements restent facultatifs : ils ouvrent des outils et de la visibilité, jamais une remise sur la commission. Même prix pour tous les métiers ; les outils affichés dépendent du vôtre.", en: "Free to start — subscriptions stay optional: they unlock tools and visibility, never a discount on commission. Same price for every trade; the tools shown depend on yours.", ar: "مجاني للبدء — الاشتراكات تبقى اختيارية: تفتح أدوات وظهوراً، لا خصماً على العمولة أبداً. السعر نفسه لكل المهن؛ والأدوات المعروضة تتبع مهنتك.", es: "Gratis para empezar — las suscripciones son opcionales: abren herramientas y visibilidad, nunca un descuento sobre la comisión. Mismo precio para todos los oficios; las herramientas mostradas dependen del tuyo.", zh: "免费起步——订阅始终可选：它带来工具与曝光，绝不减免佣金。所有业务同价；展示的工具取决于您的业务。" },

  // ─── Grille des commissions ───────────────────────────────────────────────
  "plans.comm.rental":    { fr: "Location", en: "Rental", ar: "تأجير", es: "Alquiler", zh: "租赁" },
  "plans.comm.sale":      { fr: "Vente et essai", en: "Sale and test drive", ar: "البيع والتجربة", es: "Venta y prueba", zh: "销售与试驾" },
  "plans.comm.driver":    { fr: "Chauffeur", en: "Chauffeur", ar: "سائق", es: "Chófer", zh: "司机" },
  "plans.comm.ie":        { fr: "Import/Export", en: "Import/Export", ar: "استيراد/تصدير", es: "Importación/Exportación", zh: "进口/出口" },
  "plans.comm.leisure":   { fr: "Activités et loisirs", en: "Activities and leisure", ar: "أنشطة وترفيه", es: "Actividades y ocio", zh: "活动与休闲" },
  "plans.comm.leasing":   { fr: "Leasing", en: "Leasing", ar: "تأجير تمويلي", es: "Leasing", zh: "融资租赁" },
  "plans.comm.months":    { fr: "{n} mois", en: "{n} months", ar: "{n} شهراً", es: "{n} meses", zh: "{n} 个月" },
  "plans.comm.clientFee": { fr: "Frais de service client", en: "Customer service fee", ar: "رسوم خدمة العميل", es: "Comisión de servicio al cliente", zh: "客户服务费" },
  "plans.comm.feeFormula":{ fr: "max({min}, {pct} % du montant), plafonné à {max} — à la charge du client", en: "max({min}, {pct} % of the amount), capped at {max} — paid by the customer", ar: "الأكبر بين ({min} و{pct} ٪ من المبلغ)، بحد أقصى {max} — على عاتق العميل", es: "máx({min}, {pct} % del importe), con tope de {max} — a cargo del cliente", zh: "取 {min} 与金额的 {pct} % 的较大者，上限 {max}——由客户承担" },
  "plans.ex.rental":      { fr: "Ex. location : {loue} loué → vous recevez {net} nets (standard {taux})", en: "E.g. rental: {loue} rented → you receive {net} net (standard {taux})", ar: "مثال التأجير: {loue} → تستلم {net} صافياً (القياسي {taux})", es: "Ej. alquiler: {loue} alquilado → recibes {net} netos (estándar {taux})", zh: "例·租赁：出租 {loue} → 您净得 {net}（标准 {taux}）" },
  "plans.ex.sale":        { fr: "Ex. vente : {prix} → vous recevez {net} nets (standard {taux})", en: "E.g. sale: {prix} → you receive {net} net (standard {taux})", ar: "مثال البيع: {prix} → تستلم {net} صافياً (القياسي {taux})", es: "Ej. venta: {prix} → recibes {net} netos (estándar {taux})", zh: "例·销售：{prix} → 您净得 {net}（标准 {taux}）" },
  "plans.ex.founder":     { fr: "Fondateur — location {loue} → {net} nets ({taux} réduit)", en: "Founder — rental {loue} → {net} net ({taux} reduced)", ar: "المؤسس — تأجير {loue} → {net} صافياً ({taux} مخفّض)", es: "Fundador — alquiler {loue} → {net} netos ({taux} reducido)", zh: "创始伙伴——租赁 {loue} → 净得 {net}（优惠 {taux}）" },

  // ─── Comment ça marche ────────────────────────────────────────────────────
  "plans.how1":   { fr: "Publiez votre annonce", en: "Publish your listing", ar: "انشر إعلانك", es: "Publica tu anuncio", zh: "发布您的房源" },
  "plans.how1d":  { fr: "Formulaire en 7 étapes : identité, véhicule, photos, tarif. Adresse GPS obligatoire pour la livraison.", en: "A seven-step form: identity, vehicle, photos, price. A GPS address is required for delivery.", ar: "نموذج من سبع خطوات: الهوية، المركبة، الصور، السعر. عنوان GPS مطلوب للتسليم.", es: "Formulario en 7 pasos: identidad, vehículo, fotos, tarifa. Dirección GPS obligatoria para la entrega.", zh: "七步表单：身份、车辆、照片、价格。交付需填写 GPS 地址。" },
  "plans.how2":   { fr: "Validation sous 24 h", en: "Approved within 24 hours", ar: "الموافقة خلال ٢٤ ساعة", es: "Validación en 24 h", zh: "24 小时内审核" },
  "plans.how2d":  { fr: "Notre équipe vérifie chaque annonce — photos, documents, adresse — avant publication.", en: "Our team checks every listing — photos, documents, address — before it goes live.", ar: "يتحقق فريقنا من كل إعلان — الصور والمستندات والعنوان — قبل النشر.", es: "Nuestro equipo verifica cada anuncio — fotos, documentos, dirección — antes de publicarlo.", zh: "我们的团队在发布前核验每条房源的照片、文件与地址。" },
  "plans.how3":   { fr: "Réservations sécurisées", en: "Secure bookings", ar: "حجوزات آمنة", es: "Reservas seguras", zh: "安全预订" },
  "plans.how3d":  { fr: "Contrat digital, caution, paiement chiffré et suivi GPS en temps réel.", en: "Digital contract, deposit, encrypted payment and real-time GPS tracking.", ar: "عقد رقمي، تأمين، دفع مشفّر وتتبع GPS لحظي.", es: "Contrato digital, fianza, pago cifrado y seguimiento GPS en tiempo real.", zh: "数字合同、押金、加密支付与实时 GPS 跟踪。" },
  "plans.how4":   { fr: "Revenus directs", en: "Direct earnings", ar: "دخل مباشر", es: "Ingresos directos", zh: "直接收益" },
  "plans.how4d":  { fr: "Après commission et frais de service, le montant net vous est versé via votre méthode préférée.", en: "After commission and service fees, the net amount is paid to you by your preferred method.", ar: "بعد العمولة ورسوم الخدمة، يُحوَّل المبلغ الصافي إليك بالطريقة التي تفضّلها.", es: "Tras la comisión y las tasas de servicio, el importe neto se te abona por tu método preferido.", zh: "扣除佣金与服务费后，净额按您偏好的方式支付。" },

  // ─── Paiements fermés (config/featureFlags.js) ────────────────────────────
  "pay.disabledNotice": { fr: "Paiement en ligne pas encore ouvert : votre demande part au support, qui active le plan sur votre compte.", en: "Online payment is not open yet: your request goes to support, who will activate the plan on your account.", ar: "الدفع الإلكتروني غير مفتوح بعد: يُرسَل طلبك إلى الدعم الذي يفعّل الخطة على حسابك.", es: "El pago en línea aún no está abierto: tu solicitud va al soporte, que activará el plan en tu cuenta.", zh: "在线支付尚未开放：您的申请将转交客服，由其在您的账户上启用该套餐。" },
  "pay.disabledCta":    { fr: "Demander l'activation", en: "Request activation", ar: "اطلب التفعيل", es: "Solicitar la activación", zh: "申请启用" },

  // ─── Ce que le palier GRATUIT donne déjà ──────────────────────────────────
  // Annoncé explicitement : un socle qu'on cache laisse croire que tout est
  // payant, et pousse à souscrire pour ce qu'on a déjà.
  "socle.vitrine":    { fr: "Vitrine publique et flotte complète, réservable", en: "Public storefront and full fleet, bookable", ar: "واجهة عامة وأسطول كامل قابل للحجز", es: "Escaparate público y flota completa, reservable", zh: "公开展示页与可预订的全部车辆" },
  "socle.contrat":    { fr: "Contrat digital automatique à chaque réservation", en: "Automatic digital contract on every booking", ar: "عقد رقمي تلقائي مع كل حجز", es: "Contrato digital automático en cada reserva", zh: "每笔预订自动生成数字合同" },
  "socle.messagerie": { fr: "Messagerie directe avec le client", en: "Direct messaging with the customer", ar: "مراسلة مباشرة مع العميل", es: "Mensajería directa con el cliente", zh: "与客户直接沟通" },
  "socle.revenus":    { fr: "Vos réservations et vos revenus nets, en temps réel", en: "Your bookings and net earnings, in real time", ar: "حجوزاتك وأرباحك الصافية، في الوقت الفعلي", es: "Tus reservas e ingresos netos, en tiempo real", zh: "实时查看您的预订与净收益" },
  "socle.planning":   { fr: "Planning et indisponibilités", en: "Scheduling and time off", ar: "الجدولة وأوقات عدم التوفر", es: "Planificación e indisponibilidades", zh: "排期与不可用时段" },
  "socle.creneaux":   { fr: "Créneaux et capacité par séance", en: "Time slots and capacity per session", ar: "الفترات الزمنية والسعة لكل جلسة", es: "Franjas horarias y capacidad por sesión", zh: "每场次的时段与容量" },
  "socle.meteo":      { fr: "Report automatique des sorties dépendant de la météo", en: "Automatic postponement of weather-dependent outings", ar: "تأجيل تلقائي للرحلات المرتبطة بالطقس", es: "Aplazamiento automático de salidas dependientes del tiempo", zh: "受天气影响的行程自动顺延" },
  "socle.zonesDesservies": { fr: "Zones desservies et type de disponibilité", en: "Areas served and availability type", ar: "المناطق المخدومة ونوع التوفر", es: "Zonas cubiertas y tipo de disponibilidad", zh: "服务区域与可用类型" },
  "socle.unIncoterm": { fr: "Un prix et un Incoterm par annonce d'export", en: "One price and one Incoterm per export listing", ar: "سعر واحد وإنكوترم واحد لكل إعلان تصدير", es: "Un precio y un Incoterm por anuncio de exportación", zh: "每条出口房源一个价格与一个贸易术语" },
  "socle.stock":      { fr: "Stock et références de pièces", en: "Stock and part references", ar: "المخزون ومراجع القطع", es: "Stock y referencias de piezas", zh: "库存与配件编号" },
  "socle.title":      { fr: "Inclus dans le palier gratuit", en: "Included in the free tier", ar: "مشمول في الباقة المجانية", es: "Incluido en el plan gratuito", zh: "免费套餐已包含" },
};
