/**
 * Traductions — page /partenaires.
 *
 * La grille de commissions de cette page était la bonne (15/10, 5/3, 5/3,
 * 15/10, 15/10) — c'est la FAQ qui était fausse. Trois choses ont tout de même
 * été corrigées ici :
 *
 *  · « Frais service client : 15 DH fixe » — la page /plans annonce
 *    max(1,00 $US ; 0,5 % du montant), plafonné à 25,00 $US, et c'est ce que
 *    facture le moteur depuis le passage à l'USD (2026-07-24). Deux pages du
 *    même site donnaient deux tarifs.
 *  · les exemples chiffrés, tous en dirhams, sur une plateforme qui affiche en
 *    dollars par défaut dans 28 pays ;
 *  · « 20+ pays, 9 devises », « des milliers de clients », « Places restantes
 *    limitées » — respectivement périmé, inventé et invérifiable. La rareté
 *    des places n'existe nulle part dans le code.
 *
 * La ligne « pièces détachées » manquait à la grille : elle est ajoutée
 * (10 % standard, 7 % fondateur ; 7 % / 5 % en importation).
 */
export default {

  "part.metaTitle": { fr: "Devenir partenaire", en: "Become a partner", ar: "كن شريكاً", es: "Hazte socio", zh: "成为合作伙伴" },
  "part.metaDesc": {
    fr: "Publiez vos véhicules sur VIT AUTO et vendez ou louez dans 28 pays. Commission transparente, paiement sécurisé, contrats automatiques.",
    en: "List your vehicles on VIT AUTO and sell or rent across 28 countries. Transparent commission, secure payment, automatic contracts.",
    ar: "انشر مركباتك على VIT AUTO وبِع أو أجّر في ٢٨ دولة. عمولة واضحة ودفع آمن وعقود تلقائية.",
    es: "Publica tus vehículos en VIT AUTO y vende o alquila en 28 países. Comisión transparente, pago seguro, contratos automáticos.",
    zh: "在 VIT AUTO 发布车辆，在 28 个国家销售或出租。佣金透明、支付安全、合同自动生成。",
  },
  "part.badge":  { fr: "🤝 PROGRAMME PARTENAIRES VIT AUTO", en: "🤝 VIT AUTO PARTNER PROGRAMME", ar: "🤝 برنامج شركاء VIT AUTO", es: "🤝 PROGRAMA DE SOCIOS VIT AUTO", zh: "🤝 VIT AUTO 合作伙伴计划" },
  "part.h1a":    { fr: "Rejoignez la plateforme automobile", en: "Join the car platform", ar: "انضم إلى المنصة الأولى للسيارات", es: "Únete a la plataforma automotriz", zh: "加入这个汽车平台" },
  "part.h1b":    { fr: "qui propulse vos revenus", en: "that grows your revenue", ar: "التي تنمّي دخلك", es: "que impulsa tus ingresos", zh: "让您的收入更上一层楼" },
  "part.heroDesc": {
    fr: "Agences, concessionnaires, particuliers — publiez vos véhicules sur VIT AUTO et touchez des clients dans 28 pays. Commission transparente, paiements sécurisés.",
    en: "Agencies, dealers, private owners — list your vehicles on VIT AUTO and reach customers in 28 countries. Transparent commission, secure payments.",
    ar: "وكالات ومعارض وأفراد — انشر مركباتك على VIT AUTO وصِل إلى عملاء في ٢٨ دولة. عمولة واضحة ومدفوعات آمنة.",
    es: "Agencias, concesionarios, particulares — publica tus vehículos en VIT AUTO y llega a clientes de 28 países. Comisión transparente, pagos seguros.",
    zh: "租赁公司、经销商、个人车主——在 VIT AUTO 发布车辆，触达 28 个国家的客户。佣金透明，支付安全。",
  },
  "part.becomeCta":  { fr: "Devenir partenaire →", en: "Become a partner →", ar: "← كن شريكاً", es: "Hazte socio →", zh: "成为合作伙伴 →" },
  "part.hubCta":     { fr: "🤝 Espace Partner Hub", en: "🤝 Partner Hub", ar: "🤝 فضاء الشريك", es: "🤝 Espacio Partner Hub", zh: "🤝 合作伙伴中心" },
  "part.seeFounder": { fr: "Voir l'Offre Fondateur ⭐", en: "See the Founder offer ⭐", ar: "⭐ اطّلع على عرض المؤسس", es: "Ver la oferta Fundador ⭐", zh: "查看创始人方案 ⭐" },

  "part.mandatory":     { fr: "⭐ ÉTAPE OBLIGATOIRE", en: "⭐ MANDATORY STEP", ar: "⭐ خطوة إلزامية", es: "⭐ PASO OBLIGATORIO", zh: "⭐ 必经步骤" },
  "part.founderTitle":  { fr: "Programme Fondateur", en: "Founder programme", ar: "برنامج الشريك المؤسس", es: "Programa Fundador", zh: "创始人计划" },
  "part.founderSub":    { fr: "Le parcours obligatoire de tout nouveau partenaire", en: "The mandatory path for every new partner", ar: "المسار الإلزامي لكل شريك جديد", es: "El recorrido obligatorio de todo nuevo socio", zh: "所有新合作伙伴的必经流程" },
  "part.founderDesc": {
    fr: "En tant que partenaire fondateur, vous bénéficiez d'avantages exclusifs pendant 12 mois, d'une visibilité prioritaire et d'un accès anticipé à toutes les futures fonctionnalités.",
    en: "As a founding partner, you get exclusive benefits for 12 months, priority visibility and early access to all upcoming features.",
    ar: "بصفتك شريكاً مؤسساً، تحصل على مزايا حصرية لمدة ١٢ شهراً، وظهور ذي أولوية، ووصول مبكر إلى كل الميزات القادمة.",
    es: "Como socio fundador, disfrutas de ventajas exclusivas durante 12 meses, visibilidad prioritaria y acceso anticipado a todas las funciones futuras.",
    zh: "作为创始合作伙伴，您可享 12 个月专属权益、优先曝光，并抢先使用未来所有新功能。",
  },
  "part.f1.label": { fr: "Gratuit 12 mois", en: "Free for 12 months", ar: "مجاناً لمدة ١٢ شهراً", es: "Gratis 12 meses", zh: "12 个月免费" },
  "part.f1.desc":  { fr: "Aucun abonnement, aucune carte requise pendant un an complet.", en: "No subscription, no card required for a full year.", ar: "بلا اشتراك وبلا بطاقة طوال سنة كاملة.", es: "Sin suscripción ni tarjeta durante un año completo.", zh: "整整一年无需订阅、无需绑卡。" },
  "part.f2.label": { fr: "Commission réduite", en: "Reduced commission", ar: "عمولة مخفّضة", es: "Comisión reducida", zh: "佣金优惠" },
  "part.f2.desc":  { fr: "Pendant 12 mois, entreprise comme particulier : location 10 % (au lieu de 15 %), vente et export 3 % (au lieu de 5 %), chauffeur et loisirs 10 % (au lieu de 15 %).", en: "For 12 months, companies and individuals alike: rentals 10% (instead of 15%), sales and exports 3% (instead of 5%), chauffeur and leisure 10% (instead of 15%).", ar: "لمدة ١٢ شهراً، للشركات والأفراد على حد سواء: التأجير ١٠٪ (بدل ١٥٪)، والبيع والتصدير ٣٪ (بدل ٥٪)، والسائق والترفيه ١٠٪ (بدل ١٥٪).", es: "Durante 12 meses, empresas y particulares: alquiler 10 % (en vez de 15 %), venta y exportación 3 % (en vez de 5 %), chófer y ocio 10 % (en vez de 15 %).", zh: "12 个月内，企业与个人同享：租赁 10%（原 15%）、销售与出口 3%（原 5%）、司机与休闲 10%（原 15%）。" },
  "part.f3.label": { fr: "Badge Fondateur", en: "Founder badge", ar: "شارة المؤسس", es: "Insignia Fundador", zh: "创始人徽章" },
  "part.f3.desc":  { fr: "Mention exclusive « Partenaire Fondateur » sur toutes vos annonces.", en: "Exclusive “Founding Partner” mention on all your listings.", ar: "إشارة حصرية «شريك مؤسس» على كل إعلاناتك.", es: "Mención exclusiva «Socio Fundador» en todos tus anuncios.", zh: "您的所有车源均标注专属「创始合作伙伴」。" },
  "part.f4.label": { fr: "Mise en avant permanente", en: "Permanent boost", ar: "تمييز دائم", es: "Destacado permanente", zh: "永久推广位" },
  "part.f4.desc":  { fr: "Vos annonces apparaissent en premier dans le catalogue et les recherches.", en: "Your listings appear first in the catalogue and in searches.", ar: "تظهر إعلاناتك أولاً في الفهرس وفي نتائج البحث.", es: "Tus anuncios aparecen primero en el catálogo y en las búsquedas.", zh: "您的车源在目录与搜索结果中优先展示。" },
  "part.f5.label": { fr: "Accès anticipé", en: "Early access", ar: "وصول مبكر", es: "Acceso anticipado", zh: "抢先体验" },
  "part.f5.desc":  { fr: "Accès prioritaire aux nouvelles fonctionnalités avant tous les autres.", en: "Priority access to new features before anyone else.", ar: "أولوية الوصول إلى الميزات الجديدة قبل الجميع.", es: "Acceso prioritario a las nuevas funciones antes que nadie.", zh: "优先于他人使用新功能。" },
  // Remplace « Places restantes limitées — agissez vite » : aucune limite de
  // places n'existe dans le code, c'était une rareté fabriquée.
  "part.founderWindow": { fr: "Douze mois à compter de la signature de votre accord", en: "Twelve months from the signing of your agreement", ar: "اثنا عشر شهراً ابتداءً من توقيع اتفاقيتك", es: "Doce meses desde la firma de tu acuerdo", zh: "自协议签署之日起十二个月" },

  "part.whyTitle": { fr: "Pourquoi choisir VIT AUTO ?", en: "Why choose VIT AUTO?", ar: "لماذا تختار VIT AUTO؟", es: "¿Por qué elegir VIT AUTO?", zh: "为什么选择 VIT AUTO？" },
  "part.whySub":   { fr: "Des outils professionnels pour développer votre activité", en: "Professional tools to grow your business", ar: "أدوات احترافية لتنمية نشاطك", es: "Herramientas profesionales para hacer crecer tu negocio", zh: "助您拓展业务的专业工具" },
  "part.b1.title": { fr: "Présence internationale", en: "International reach", ar: "حضور دولي", es: "Presencia internacional", zh: "国际覆盖" },
  "part.b1.desc":  { fr: "28 pays, 15 devises. Chine, Dubaï, Europe, Afrique, Maghreb — touchez des clients partout.", en: "28 countries, 15 currencies. China, Dubai, Europe, Africa, the Maghreb — reach customers everywhere.", ar: "٢٨ دولة و١٥ عملة. الصين ودبي وأوروبا وإفريقيا والمغرب العربي — صِل إلى العملاء في كل مكان.", es: "28 países, 15 divisas. China, Dubái, Europa, África, el Magreb — llega a clientes en todas partes.", zh: "28 个国家、15 种货币。中国、迪拜、欧洲、非洲、马格里布——触达各地客户。" },
  "part.b2.title": { fr: "Contrats digitaux", en: "Digital contracts", ar: "عقود رقمية", es: "Contratos digitales", zh: "电子合同" },
  "part.b2.desc":  { fr: "Chaque réservation génère automatiquement un contrat à valeur légale.", en: "Every booking automatically generates a legally binding contract.", ar: "كل حجز يولّد تلقائياً عقداً له قيمة قانونية.", es: "Cada reserva genera automáticamente un contrato con valor legal.", zh: "每次预订自动生成具法律效力的合同。" },
  "part.b3.title": { fr: "Livraison GPS", en: "GPS delivery", ar: "التوصيل بـ GPS", es: "Entrega GPS", zh: "GPS 配送" },
  "part.b3.desc":  { fr: "Calcul automatique des frais de livraison. Plus de négociation.", en: "Delivery fees computed automatically. No more haggling.", ar: "احتساب تلقائي لرسوم التوصيل. لا مزيد من المساومة.", es: "Cálculo automático de los gastos de entrega. Se acabó negociar.", zh: "配送费用自动计算，无需再行议价。" },
  "part.b4.title": { fr: "Paiements sécurisés", en: "Secure payments", ar: "مدفوعات آمنة", es: "Pagos seguros", zh: "安全支付" },
  "part.b4.desc":  { fr: "Orange Money, Wave, MTN, carte bancaire. Virement rapide vers vous.", en: "Orange Money, Wave, MTN, bank card. Fast transfer to you.", ar: "أورنج موني وويف وMTN والبطاقة البنكية. تحويل سريع إليك.", es: "Orange Money, Wave, MTN, tarjeta bancaria. Transferencia rápida hacia ti.", zh: "Orange Money、Wave、MTN、银行卡。快速结算到账。" },
  "part.b5.title": { fr: "Tableau de bord", en: "Dashboard", ar: "لوحة التحكم", es: "Panel de control", zh: "数据面板" },
  "part.b5.desc":  { fr: "Statistiques en temps réel : vues, réservations, revenus.", en: "Real-time statistics: views, bookings, revenue.", ar: "إحصاءات فورية: المشاهدات والحجوزات والإيرادات.", es: "Estadísticas en tiempo real: visitas, reservas, ingresos.", zh: "实时统计：浏览量、预订量、收入。" },
  "part.b6.title": { fr: "Vérification clients", en: "Customer verification", ar: "التحقق من العملاء", es: "Verificación de clientes", zh: "客户核验" },
  "part.b6.desc":  { fr: "Identité et téléphone vérifiés. Réduisez les risques d'impayé.", en: "Verified identity and phone number. Fewer unpaid bookings.", ar: "هوية ورقم هاتف موثّقان. قلّل مخاطر عدم السداد.", es: "Identidad y teléfono verificados. Reduce el riesgo de impago.", zh: "身份与手机号均经验证，降低欠款风险。" },

  "part.whoTitle": { fr: "Qui peut devenir partenaire ?", en: "Who can become a partner?", ar: "من يمكنه أن يصبح شريكاً؟", es: "¿Quién puede ser socio?", zh: "谁可以成为合作伙伴？" },
  "part.w1.title": { fr: "Agences de location", en: "Rental agencies", ar: "وكالات التأجير", es: "Agencias de alquiler", zh: "租车公司" },
  "part.w1.desc":  { fr: "Multipliez vos canaux de réservation et automatisez votre gestion.", en: "Multiply your booking channels and automate your operations.", ar: "ضاعف قنوات الحجز وأتمتة إدارتك.", es: "Multiplica tus canales de reserva y automatiza tu gestión.", zh: "拓展预订渠道，实现运营自动化。" },
  "part.w2.title": { fr: "Concessionnaires & importateurs", en: "Dealers & importers", ar: "الوكلاء والمستوردون", es: "Concesionarios e importadores", zh: "经销商与进口商" },
  "part.w2.desc":  { fr: "Vendez neuf et occasion à une audience qualifiée dans 28 pays. Importez depuis la Chine ou Dubaï via Import/Export.", en: "Sell new and used to a qualified audience across 28 countries. Import from China or Dubai through Import/Export.", ar: "بِع الجديد والمستعمل لجمهور مؤهّل في ٢٨ دولة. واستورد من الصين أو دبي عبر خدمة الاستيراد والتصدير.", es: "Vende nuevo y usado a un público cualificado en 28 países. Importa desde China o Dubái con Importación/Exportación.", zh: "面向 28 个国家的优质客户销售新车与二手车。通过进出口服务从中国或迪拜进口。" },
  "part.w3.title": { fr: "Particuliers", en: "Private owners", ar: "الأفراد", es: "Particulares", zh: "个人车主" },
  "part.w3.desc":  { fr: "Monétisez votre véhicule quand vous ne l'utilisez pas.", en: "Earn from your vehicle when you are not using it.", ar: "حقّق دخلاً من مركبتك حين لا تستخدمها.", es: "Rentabiliza tu vehículo cuando no lo usas.", zh: "闲置时让您的车辆产生收益。" },
  "part.w4.title": { fr: "Chauffeurs professionnels", en: "Professional chauffeurs", ar: "السائقون المحترفون", es: "Chóferes profesionales", zh: "专业司机" },
  "part.w4.desc":  { fr: "Proposez vos services avec conducteur à des clients partout.", en: "Offer your chauffeur services to customers everywhere.", ar: "قدّم خدماتك مع سائق لعملاء في كل مكان.", es: "Ofrece tus servicios con conductor a clientes de todas partes.", zh: "向各地客户提供带司机的服务。" },

  "part.howTitle": { fr: "Comment ça marche ?", en: "How does it work?", ar: "كيف تعمل المنصة؟", es: "¿Cómo funciona?", zh: "如何运作？" },
  "part.s1.title": { fr: "Créez votre compte", en: "Create your account", ar: "أنشئ حسابك", es: "Crea tu cuenta", zh: "创建账户" },
  "part.s1.desc":  { fr: "Inscription gratuite en 2 minutes avec vos informations partenaire.", en: "Free sign-up in 2 minutes with your partner details.", ar: "تسجيل مجاني في دقيقتين ببيانات الشريك الخاصة بك.", es: "Registro gratuito en 2 minutos con tus datos de socio.", zh: "两分钟免费注册，填写合作伙伴信息。" },
  "part.s2.title": { fr: "Soumettez vos véhicules", en: "Submit your vehicles", ar: "أرسل مركباتك", es: "Envía tus vehículos", zh: "提交车辆" },
  "part.s2.desc":  { fr: "Publiez vos annonces avec photos, prix et disponibilités.", en: "Publish your listings with photos, prices and availability.", ar: "انشر إعلاناتك مع الصور والأسعار والتواريخ المتاحة.", es: "Publica tus anuncios con fotos, precios y disponibilidad.", zh: "发布车源，附照片、价格与可租日期。" },
  "part.s3.title": { fr: "Recevez des réservations", en: "Receive bookings", ar: "استقبل الحجوزات", es: "Recibe reservas", zh: "接收预订" },
  "part.s3.desc":  { fr: "Les clients réservent directement. Vous confirmez ou refusez en un clic.", en: "Customers book directly. You accept or decline in one click.", ar: "يحجز العملاء مباشرة، وتقبل أو ترفض بنقرة واحدة.", es: "Los clientes reservan directamente. Tú aceptas o rechazas con un clic.", zh: "客户直接下单，您一键确认或拒绝。" },
  "part.s4.title": { fr: "Encaissez en sécurité", en: "Get paid securely", ar: "احصل على أموالك بأمان", es: "Cobra con seguridad", zh: "安全收款" },
  "part.s4.desc":  { fr: "Paiements sécurisés, contrats digitaux automatiques, virements rapides.", en: "Secure payments, automatic digital contracts, fast transfers.", ar: "مدفوعات آمنة وعقود رقمية تلقائية وتحويلات سريعة.", es: "Pagos seguros, contratos digitales automáticos, transferencias rápidas.", zh: "支付安全、合同自动生成、快速转账。" },

  "part.commTitle": { fr: "Commissions transparentes", en: "Transparent commissions", ar: "عمولات شفافة", es: "Comisiones transparentes", zh: "佣金透明" },
  "part.commDesc": {
    fr: "Aucun frais caché. Vous savez exactement ce que vous payez. Pour la vente, VIT AUTO n'est pas une boutique en ligne : nous vous apportons des prospects qualifiés (demandes d'essai), vous restez maître du véhicule, du prix, de la négociation et de la conclusion — aucun abonnement ni frais de publication, une commission uniquement sur la vente conclue.",
    en: "No hidden fees. You know exactly what you pay. For sales, VIT AUTO is not an online shop: we bring you qualified leads (test-drive requests), you keep control of the vehicle, the price, the negotiation and the close — no subscription, no listing fee, a commission only on a completed sale.",
    ar: "لا رسوم خفية. تعرف بالضبط ما تدفعه. أما البيع، فـ VIT AUTO ليست متجراً إلكترونياً: نجلب لك عملاء محتملين مؤهلين (طلبات تجربة قيادة)، وتبقى أنت المتحكم في المركبة والسعر والتفاوض وإتمام الصفقة — بلا اشتراك وبلا رسوم نشر، وعمولة على البيع المُنجز فقط.",
    es: "Sin costes ocultos. Sabes exactamente lo que pagas. En venta, VIT AUTO no es una tienda en línea: te aportamos contactos cualificados (solicitudes de prueba), tú mantienes el control del vehículo, del precio, de la negociación y del cierre — sin suscripción ni gastos de publicación, comisión solo sobre la venta cerrada.",
    zh: "没有隐藏费用，您清楚知道支付了什么。在销售方面，VIT AUTO 不是网店：我们为您带来优质意向客户（试驾申请），车辆、价格、议价与成交均由您掌控——无订阅费、无发布费，仅在成交后收取佣金。",
  },
  "part.standard": { fr: "Standard", en: "Standard", ar: "قياسي", es: "Estándar", zh: "标准" },
  "part.founder":  { fr: "👑 Fondateur", en: "👑 Founder", ar: "👑 مؤسس", es: "👑 Fundador", zh: "👑 创始人" },
  "part.negotiated": { fr: "Négociée", en: "Negotiated", ar: "تفاوضية", es: "Negociada", zh: "面议" },
  "part.c.rental":    { fr: "Location", en: "Rental", ar: "التأجير", es: "Alquiler", zh: "租赁" },
  "part.c.rentalNote":{ fr: "Ex. 50,00 $US loué → 7,50 $US de commission (5,00 $US en Partenaire Fondateur)", en: "E.g. $50.00 rented → $7.50 commission ($5.00 as a Founding Partner)", ar: "مثال: تأجير بـ ٥٠٫٠٠ دولاراً ← عمولة ٧٫٥٠ دولاراً (٥٫٠٠ دولارات للشريك المؤسس)", es: "Ej. 50,00 US$ alquilados → 7,50 US$ de comisión (5,00 US$ como Socio Fundador)", zh: "例：租金 50.00 美元 → 佣金 7.50 美元（创始合作伙伴为 5.00 美元）" },
  "part.c.sale":      { fr: "Vente", en: "Sale", ar: "البيع", es: "Venta", zh: "销售" },
  "part.c.saleNote":  { fr: "Du prix de vente final, uniquement si la vente est conclue avec un prospect apporté par VIT AUTO (90 jours). Ex. 10 000,00 $US → 500,00 $US (300,00 $US fondateur)", en: "On the final sale price, only if the sale closes with a lead brought by VIT AUTO (90 days). E.g. $10,000.00 → $500.00 ($300.00 for founders)", ar: "من سعر البيع النهائي، وفقط إذا أُبرمت الصفقة مع عميل جلبته VIT AUTO (٩٠ يوماً). مثال: ١٠٬٠٠٠٫٠٠ دولار ← ٥٠٠٫٠٠ دولار (٣٠٠٫٠٠ دولار للمؤسس)", es: "Sobre el precio final de venta, solo si se cierra con un contacto aportado por VIT AUTO (90 días). Ej. 10 000,00 US$ → 500,00 US$ (300,00 US$ fundador)", zh: "按最终成交价计算，且仅当成交客户由 VIT AUTO 引入（90 天内）。例：10,000.00 美元 → 500.00 美元（创始人 300.00 美元）" },
  "part.c.export":     { fr: "Vente à l'export", en: "Export sale", ar: "البيع للتصدير", es: "Venta a la exportación", zh: "出口销售" },
  "part.c.exportNote": { fr: "Prélevée à la libération des fonds (séquestre)", en: "Taken when the escrowed funds are released", ar: "تُقتطع عند الإفراج عن أموال الضمان", es: "Se cobra al liberar los fondos en depósito", zh: "在托管资金放款时扣取" },
  "part.c.driver":     { fr: "Chauffeur", en: "Chauffeur", ar: "السائق", es: "Chófer", zh: "司机服务" },
  "part.c.driverNote": { fr: "Ex. 30,00 $US → 4,50 $US de commission (3,00 $US fondateur)", en: "E.g. $30.00 → $4.50 commission ($3.00 for founders)", ar: "مثال: ٣٠٫٠٠ دولاراً ← عمولة ٤٫٥٠ دولاراً (٣٫٠٠ دولارات للمؤسس)", es: "Ej. 30,00 US$ → 4,50 US$ de comisión (3,00 US$ fundador)", zh: "例：30.00 美元 → 佣金 4.50 美元（创始人 3.00 美元）" },
  "part.c.leisure":     { fr: "Activités et loisirs", en: "Activities & leisure", ar: "الأنشطة والترفيه", es: "Actividades y ocio", zh: "活动与休闲" },
  "part.c.leisureNote": { fr: "Quad, plongée, jetski… Ex. 40,00 $US → 6,00 $US (4,00 $US fondateur)", en: "Quad biking, diving, jet ski… E.g. $40.00 → $6.00 ($4.00 for founders)", ar: "دراجات رباعية وغوص وجت سكي… مثال: ٤٠٫٠٠ دولاراً ← ٦٫٠٠ دولارات (٤٫٠٠ دولارات للمؤسس)", es: "Quad, buceo, moto acuática… Ej. 40,00 US$ → 6,00 US$ (4,00 US$ fundador)", zh: "沙滩车、潜水、水上摩托……例：40.00 美元 → 6.00 美元（创始人 4.00 美元）" },
  // Ligne absente de la grille alors que le secteur existe depuis 2026-09-14.
  "part.c.parts":      { fr: "Pièces détachées", en: "Spare parts", ar: "قطع الغيار", es: "Repuestos", zh: "零配件" },
  "part.c.partsNote":  { fr: "Sur le prix de la pièce seul, jamais sur la livraison ni les frais d'importation. 7 % / 5 % pour une pièce importée à la commande.", en: "On the part's price alone, never on delivery or import charges. 7% / 5% for a part imported to order.", ar: "على ثمن القطعة وحده، لا على التوصيل ولا رسوم الاستيراد. ٧٪ / ٥٪ للقطعة المستوردة عند الطلب.", es: "Solo sobre el precio de la pieza, nunca sobre la entrega ni los gastos de importación. 7 % / 5 % para una pieza importada bajo pedido.", zh: "仅按配件价格计算，不含配送与进口费用。按需进口的配件为 7% / 5%。" },
  "part.c.insurance":     { fr: "Assurance", en: "Insurance", ar: "التأمين", es: "Seguro", zh: "保险" },
  "part.c.insuranceNote": { fr: "Selon accord partenaire", en: "According to the partner agreement", ar: "حسب اتفاقية الشريك", es: "Según el acuerdo con el socio", zh: "依合作协议而定" },
  "part.c.serviceFee":     { fr: "Frais de service client", en: "Customer service fee", ar: "رسوم خدمة العميل", es: "Gastos de servicio al cliente", zh: "客户服务费" },
  // Annonçait « 15 DH fixe », alors que /plans et le moteur appliquent
  // max(1 $US ; 0,5 %) plafonné à 25 $US, en dollars, depuis 2026-07-24.
  "part.c.serviceFeeValue":{ fr: "max(1,00 $US ; 0,5 %)", en: "max($1.00; 0.5%)", ar: "الأعلى بين ١٫٠٠ دولار و٠٫٥٪", es: "máx(1,00 US$; 0,5 %)", zh: "取 1.00 美元与 0.5% 的较高者" },
  "part.c.serviceFeeNote": { fr: "Plafonné à 25,00 $US, à la charge du client", en: "Capped at $25.00, paid by the customer", ar: "بحد أقصى ٢٥٫٠٠ دولاراً، على حساب العميل", es: "Limitado a 25,00 US$, a cargo del cliente", zh: "上限 25.00 美元，由客户承担" },

  "part.provideTitle": { fr: "Ce que vous devez fournir", en: "What you need to provide", ar: "ما يجب أن تقدّمه", es: "Lo que debes aportar", zh: "您需要提供的材料" },
  "part.p1": { fr: "Pièce d'identité valide (CNI ou passeport)", en: "Valid identity document (ID card or passport)", ar: "وثيقة هوية سارية (بطاقة وطنية أو جواز سفر)", es: "Documento de identidad válido (DNI o pasaporte)", zh: "有效身份证件（身份证或护照）" },
  "part.p2": { fr: "Numéro de téléphone vérifié pour les notifications", en: "Verified phone number for notifications", ar: "رقم هاتف موثّق لاستقبال الإشعارات", es: "Número de teléfono verificado para las notificaciones", zh: "用于接收通知的已验证手机号" },
  "part.p3": { fr: "Adresse exacte du véhicule (indispensable pour le calcul GPS de livraison)", en: "Exact vehicle address (required for the GPS delivery calculation)", ar: "العنوان الدقيق للمركبة (ضروري لاحتساب التوصيل بـ GPS)", es: "Dirección exacta del vehículo (imprescindible para el cálculo GPS de entrega)", zh: "车辆的准确地址（GPS 配送计费必需）" },
  "part.p4": { fr: "Photos réelles et récentes des véhicules publiés", en: "Real, recent photos of the vehicles you list", ar: "صور حقيقية وحديثة للمركبات المنشورة", es: "Fotos reales y recientes de los vehículos publicados", zh: "所发布车辆的真实近期照片" },
  "part.p5": { fr: "Documents en règle : assurance, carte grise, contrôle technique", en: "Valid documents: insurance, registration, roadworthiness certificate", ar: "وثائق سارية: التأمين وبطاقة التسجيل والفحص التقني", es: "Documentos en regla: seguro, permiso de circulación, inspección técnica", zh: "证件齐全：保险、行驶证、年检证明" },
  "part.p6": { fr: "Disponibilité pour confirmer les réservations dans les 24 heures", en: "Availability to confirm bookings within 24 hours", ar: "الاستعداد لتأكيد الحجوزات خلال ٢٤ ساعة", es: "Disponibilidad para confirmar las reservas en 24 horas", zh: "能在 24 小时内确认预订" },

  "part.hubBadge": { fr: "🤝 PARTNER HUB", en: "🤝 PARTNER HUB", ar: "🤝 فضاء الشريك", es: "🤝 PARTNER HUB", zh: "🤝 合作伙伴中心" },
  "part.hubTitle": { fr: "Tableau de bord partenaire professionnel", en: "Professional partner dashboard", ar: "لوحة تحكم احترافية للشريك", es: "Panel profesional para socios", zh: "专业合作伙伴管理面板" },
  "part.hubDesc":  { fr: "Gérez vos leads, créez des devis professionnels, construisez votre showroom en ligne et suivez vos performances avec le Partner Management System (PMS) de VIT AUTO.", en: "Manage your leads, build professional quotes, create your online showroom and track your performance with the VIT AUTO Partner Management System (PMS).", ar: "أدِر عملاءك المحتملين وأنشئ عروض أسعار احترافية وابنِ صالة عرضك الإلكترونية وتابع أداءك عبر نظام إدارة الشركاء (PMS) من VIT AUTO.", es: "Gestiona tus contactos, crea presupuestos profesionales, construye tu showroom en línea y sigue tu rendimiento con el Partner Management System (PMS) de VIT AUTO.", zh: "通过 VIT AUTO 的合作伙伴管理系统（PMS）管理线索、制作专业报价、搭建线上展厅并跟踪业绩。" },
  "part.hubCta2":  { fr: "Accéder au Partner Hub →", en: "Open the Partner Hub →", ar: "← ادخل إلى فضاء الشريك", es: "Acceder al Partner Hub →", zh: "进入合作伙伴中心 →" },

  "part.ieBadge": { fr: "🌍 SERVICE EXCLUSIF", en: "🌍 EXCLUSIVE SERVICE", ar: "🌍 خدمة حصرية", es: "🌍 SERVICIO EXCLUSIVO", zh: "🌍 专属服务" },
  "part.ieDesc":  { fr: "Importez des véhicules depuis la Chine, Dubaï ou l'Europe et revendez-les sur 28 marchés. Inspection, transport maritime, dédouanement — VIT AUTO gère tout avec vous.", en: "Import vehicles from China, Dubai or Europe and resell them across 28 markets. Inspection, sea freight, customs clearance — VIT AUTO handles it all with you.", ar: "استورد المركبات من الصين أو دبي أو أوروبا وأعد بيعها في ٢٨ سوقاً. الفحص والشحن البحري والتخليص الجمركي — تتولى VIT AUTO كل ذلك معك.", es: "Importa vehículos desde China, Dubái o Europa y revéndelos en 28 mercados. Inspección, transporte marítimo, despacho aduanero — VIT AUTO lo gestiona todo contigo.", zh: "从中国、迪拜或欧洲进口车辆，并在 28 个市场转售。验车、海运、清关——VIT AUTO 与您一同完成。" },
  "part.ieCta":   { fr: "Découvrir Import/Export →", en: "Discover import/export →", ar: "← اكتشف الاستيراد والتصدير", es: "Descubrir Importación/Exportación →", zh: "了解进出口 →" },

  "part.ctaTitle": { fr: "Prêt à rejoindre VIT AUTO ?", en: "Ready to join VIT AUTO?", ar: "هل أنت مستعد للانضمام إلى VIT AUTO؟", es: "¿Listo para unirte a VIT AUTO?", zh: "准备加入 VIT AUTO 了吗？" },
  "part.ctaDesc":  { fr: "L'inscription est gratuite. Le programme Fondateur (LOI + Accord) fait partie du parcours de tout partenaire.", en: "Signing up is free. The Founder programme (LOI + agreement) is part of every partner's path.", ar: "التسجيل مجاني. وبرنامج المؤسس (خطاب النوايا + الاتفاقية) جزء من مسار كل شريك.", es: "El registro es gratuito. El programa Fundador (LOI + acuerdo) forma parte del recorrido de todo socio.", zh: "注册免费。创始人计划（意向书 + 协议）是每位合作伙伴的必经流程。" },
  "part.ctaStart": { fr: "Démarrer gratuitement →", en: "Start for free →", ar: "← ابدأ مجاناً", es: "Empezar gratis →", zh: "免费开始 →" },
  "part.ctaTerms": { fr: "Lire les conditions partenaires", en: "Read the partner terms", ar: "اقرأ شروط الشركاء", es: "Leer las condiciones para socios", zh: "阅读合作伙伴条款" },
};
