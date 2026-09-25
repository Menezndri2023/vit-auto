/**
 * Traductions — page /faq.
 *
 * Cinq réponses ne décrivaient plus la plateforme. Corrigées ici, pas
 * seulement traduites — une FAQ fausse produit des tickets de support et,
 * pour les commissions, un désaccord contractuel :
 *
 *  · « Oui, une réservation invité est possible » — faux depuis le Booking
 *    Engine (server/routes/bookings.js : `optionalAuth` remplacé par
 *    `authenticate`). Un visiteur suivait le conseil et se heurtait à un mur.
 *  · « La confirmation est immédiate » — aucune annonce publiée n'a la
 *    réservation instantanée activée ; la demande passe par le partenaire.
 *    Même correction que la carte « Réservation en 2 minutes » de l'accueil.
 *  · « 15 % sur les locations et 3 % sur les ventes en tarif standard […]
 *    1,5 % ou 2 % sur les ventes » — la grille réellement facturée
 *    (server/scripts/setCommissionRates.mjs) est : standard location 15 %,
 *    vente et essai 5 %, export 5 %, chauffeur 15 % ; fondateur 10 %, 3 %,
 *    3 %, 10 %. Un partenaire pouvait lire 3 % et payer 5 %.
 *  · « 15 DH de base + 3 DH/km » — tarif marocain servi à tous les pays,
 *    alors que le calcul est par pays (server/services/deliveryFee.js).
 *  · « 20+ pays » — 28 pays configurés.
 */
export default {

  "faq.metaTitle": { fr: "Questions fréquentes", en: "Frequently asked questions", ar: "الأسئلة الشائعة", es: "Preguntas frecuentes", zh: "常见问题" },
  "faq.metaDesc": {
    fr: "Tout ce qu'il faut savoir avant de louer, acheter ou importer un véhicule avec VIT AUTO.",
    en: "Everything you need to know before renting, buying or importing a vehicle with VIT AUTO.",
    ar: "كل ما تحتاج معرفته قبل استئجار أو شراء أو استيراد مركبة مع VIT AUTO.",
    es: "Todo lo que necesitas saber antes de alquilar, comprar o importar un vehículo con VIT AUTO.",
    zh: "在 VIT AUTO 租车、购车或进口前需要了解的一切。",
  },
  "faq.badge":    { fr: "AIDE & SUPPORT", en: "HELP & SUPPORT", ar: "المساعدة والدعم", es: "AYUDA Y SOPORTE", zh: "帮助与支持" },
  "faq.notFound": { fr: "Vous ne trouvez pas votre réponse ?", en: "Can't find your answer?", ar: "لم تجد إجابتك؟", es: "¿No encuentras tu respuesta?", zh: "没有找到答案？" },
  "faq.callUs":   { fr: "Appelez-nous", en: "Call us", ar: "اتصل بنا", es: "Llámanos", zh: "致电我们" },
  "faq.or":       { fr: "ou", en: "or", ar: "أو", es: "o", zh: "或" },
  "faq.chatUs":   { fr: "chattez avec nous", en: "chat with us", ar: "تحدث معنا", es: "chatea con nosotros", zh: "在线咨询" },

  // ─── Réservation ──────────────────────────────────────────────────────────
  "faq.cat.booking": { fr: "📋 Réservation", en: "📋 Booking", ar: "📋 الحجز", es: "📋 Reserva", zh: "📋 预订" },
  "faq.booking.1.q": { fr: "Comment réserver un véhicule ?", en: "How do I book a vehicle?", ar: "كيف أحجز مركبة؟", es: "¿Cómo reservo un vehículo?", zh: "如何预订车辆？" },
  "faq.booking.1.a": {
    fr: "Depuis le catalogue, choisissez un véhicule, cliquez sur « Réserver » puis suivez les 3 étapes : informations personnelles, vérification d'identité et paiement. Le contrat digital est généré automatiquement ; le partenaire confirme ensuite votre demande, et vous suivez sa réponse par e-mail et dans votre espace.",
    en: "From the catalogue, pick a vehicle, click “Book” and follow the 3 steps: personal details, identity verification and payment. The digital contract is generated automatically; the partner then confirms your request, and you follow their reply by email and in your account.",
    ar: "من الفهرس، اختر مركبة واضغط «احجز» ثم اتبع الخطوات الثلاث: المعلومات الشخصية والتحقق من الهوية والدفع. يُنشأ العقد الرقمي تلقائياً، ثم يؤكد الشريك طلبك، وتتابع رده بالبريد وفي حسابك.",
    es: "Desde el catálogo, elige un vehículo, haz clic en «Reservar» y sigue los 3 pasos: datos personales, verificación de identidad y pago. El contrato digital se genera automáticamente; después el socio confirma tu solicitud y sigues su respuesta por correo y en tu cuenta.",
    zh: "在车源页选择车辆，点击「预订」并完成三步：填写个人信息、身份验证、支付。系统自动生成电子合同；随后由商家确认您的申请，您可通过邮件和账户查看答复。",
  },
  "faq.booking.2.q": { fr: "Puis-je réserver sans compte ?", en: "Can I book without an account?", ar: "هل يمكنني الحجز بدون حساب؟", es: "¿Puedo reservar sin cuenta?", zh: "没有账户可以预订吗？" },
  "faq.booking.2.a": {
    fr: "Non. Un compte est obligatoire pour toute réservation : le contrat doit être rattaché à une identité vérifiée, et c'est ce qui vous permet de suivre votre demande, de récupérer vos contrats et d'être assisté en cas de litige.",
    en: "No. An account is required for every booking: the contract must be tied to a verified identity, and that is what lets you follow your request, retrieve your contracts and be helped in case of a dispute.",
    ar: "لا. الحساب إلزامي لأي حجز: يجب أن يرتبط العقد بهوية موثّقة، وهذا ما يتيح لك متابعة طلبك واسترجاع عقودك والحصول على المساعدة عند أي نزاع.",
    es: "No. Se requiere una cuenta para toda reserva: el contrato debe vincularse a una identidad verificada, y eso es lo que te permite seguir tu solicitud, recuperar tus contratos y recibir ayuda en caso de litigio.",
    zh: "不可以。所有预订均需账户：合同必须绑定经验证的身份，您也因此能跟进申请、取回合同，并在发生纠纷时获得协助。",
  },
  "faq.booking.3.q": { fr: "Comment annuler une réservation ?", en: "How do I cancel a booking?", ar: "كيف ألغي حجزاً؟", es: "¿Cómo cancelo una reserva?", zh: "如何取消预订？" },
  "faq.booking.3.a": {
    fr: "Rendez-vous dans Tableau de bord > Mes réservations, puis cliquez sur « Annuler ». Les conditions d'annulation (remboursement, délai) sont précisées dans votre contrat digital.",
    en: "Go to Dashboard > My bookings, then click “Cancel”. The cancellation terms (refund, notice period) are set out in your digital contract.",
    ar: "اذهب إلى لوحة التحكم < حجوزاتي، ثم اضغط «إلغاء». شروط الإلغاء (الاسترداد والمهلة) موضّحة في عقدك الرقمي.",
    es: "Ve a Panel > Mis reservas y haz clic en «Cancelar». Las condiciones de cancelación (reembolso, plazo) figuran en tu contrato digital.",
    zh: "进入「仪表盘 > 我的预订」，点击「取消」。退款与时限等取消条款载于您的电子合同中。",
  },
  "faq.booking.4.q": { fr: "Quelle est la durée minimale de location ?", en: "What is the minimum rental period?", ar: "ما هي المدة الدنيا للإيجار؟", es: "¿Cuál es la duración mínima de alquiler?", zh: "最短租期是多久？" },
  "faq.booking.4.a": {
    fr: "La durée minimale est de 1 jour (24 h). Certains partenaires proposent des locations à l'heure — cela est précisé dans l'annonce.",
    en: "The minimum is 1 day (24 hours). Some partners offer hourly rentals — this is stated in the listing.",
    ar: "الحد الأدنى يوم واحد (٢٤ ساعة). بعض الشركاء يقدمون تأجيراً بالساعة، ويُذكر ذلك في الإعلان.",
    es: "La duración mínima es de 1 día (24 h). Algunos socios ofrecen alquiler por horas — se indica en el anuncio.",
    zh: "最短租期为 1 天（24 小时）。部分商家提供按小时租赁，车源页面会注明。",
  },

  // ─── Paiement ─────────────────────────────────────────────────────────────
  "faq.cat.payment": { fr: "💳 Paiement", en: "💳 Payment", ar: "💳 الدفع", es: "💳 Pago", zh: "💳 支付" },
  "faq.payment.1.q": { fr: "Quels modes de paiement acceptez-vous ?", en: "Which payment methods do you accept?", ar: "ما طرق الدفع المقبولة؟", es: "¿Qué métodos de pago aceptáis?", zh: "支持哪些支付方式？" },
  "faq.payment.1.a": {
    fr: "Orange Money, Wave, MTN Mobile Money, Moov Money, carte bancaire (Visa/Mastercard), PayPal, virement SEPA (Europe), CMI et CIH (Maroc), et espèces à la livraison chez certains partenaires.",
    en: "Orange Money, Wave, MTN Mobile Money, Moov Money, bank card (Visa/Mastercard), PayPal, SEPA transfer (Europe), CMI and CIH (Morocco), and cash on delivery with some partners.",
    ar: "أورنج موني وويف وMTN موبايل موني وموف موني والبطاقة البنكية (فيزا/ماستركارد) وباي بال والتحويل SEPA (أوروبا) وCMI وCIH (المغرب)، والدفع نقداً عند التسليم لدى بعض الشركاء.",
    es: "Orange Money, Wave, MTN Mobile Money, Moov Money, tarjeta bancaria (Visa/Mastercard), PayPal, transferencia SEPA (Europa), CMI y CIH (Marruecos), y efectivo en la entrega con algunos socios.",
    zh: "Orange Money、Wave、MTN Mobile Money、Moov Money、银行卡（Visa/Mastercard）、PayPal、SEPA 转账（欧洲）、CMI 与 CIH（摩洛哥），部分商家支持货到付款。",
  },
  "faq.payment.2.q": { fr: "Le paiement est-il sécurisé ?", en: "Is payment secure?", ar: "هل الدفع آمن؟", es: "¿El pago es seguro?", zh: "支付安全吗？" },
  "faq.payment.2.a": {
    fr: "Oui. Toutes les transactions sont chiffrées (TLS 1.3). Les données bancaires ne sont jamais stockées sur nos serveurs.",
    en: "Yes. All transactions are encrypted (TLS 1.3). Banking details are never stored on our servers.",
    ar: "نعم. جميع المعاملات مشفّرة (TLS 1.3)، ولا تُخزَّن البيانات البنكية أبداً على خوادمنا.",
    es: "Sí. Todas las transacciones están cifradas (TLS 1.3). Los datos bancarios nunca se almacenan en nuestros servidores.",
    zh: "是的。所有交易均经 TLS 1.3 加密，银行信息绝不存储于我们的服务器。",
  },
  "faq.payment.3.q": { fr: "Qu'est-ce que la caution ?", en: "What is the deposit?", ar: "ما هي الوديعة؟", es: "¿Qué es la fianza?", zh: "什么是押金？" },
  "faq.payment.3.a": {
    fr: "La caution est un dépôt de garantie remboursé intégralement après restitution du véhicule en bon état. Son montant est précisé dans chaque annonce, et il est réglé directement au partenaire : il ne fait pas partie du total payé sur VIT AUTO.",
    en: "The deposit is a security amount refunded in full once the vehicle is returned in good condition. Its amount is stated in each listing, and it is paid directly to the partner: it is not part of the total paid on VIT AUTO.",
    ar: "الوديعة مبلغ ضمان يُعاد بالكامل بعد إرجاع المركبة بحالة جيدة. يُذكر مقدارها في كل إعلان، وتُدفع مباشرة إلى الشريك: فهي ليست جزءاً من المبلغ الإجمالي المدفوع على VIT AUTO.",
    es: "La fianza es un depósito de garantía reembolsado íntegramente tras devolver el vehículo en buen estado. Su importe se indica en cada anuncio y se paga directamente al socio: no forma parte del total pagado en VIT AUTO.",
    zh: "押金是一笔保证金，车辆完好归还后全额退还。金额在每条车源中注明，并直接支付给商家：不计入在 VIT AUTO 支付的总额。",
  },
  "faq.payment.4.q": { fr: "Quand suis-je débité ?", en: "When am I charged?", ar: "متى يتم الخصم مني؟", es: "¿Cuándo se me cobra?", zh: "何时扣款？" },
  "faq.payment.4.a": {
    fr: "Vous êtes débité lors de la confirmation de la réservation. En cas d'annulation dans les conditions prévues, un remboursement est initié sous 5 à 7 jours ouvrés.",
    en: "You are charged when the booking is confirmed. If you cancel within the agreed terms, a refund is initiated within 5 to 7 business days.",
    ar: "يتم الخصم عند تأكيد الحجز. وفي حال الإلغاء وفق الشروط المتفق عليها، يُباشَر الاسترداد خلال ٥ إلى ٧ أيام عمل.",
    es: "Se te cobra al confirmar la reserva. En caso de cancelación según las condiciones previstas, el reembolso se inicia en 5 a 7 días hábiles.",
    zh: "预订确认时扣款。若按约定条件取消，将在 5 至 7 个工作日内启动退款。",
  },

  // ─── Livraison ────────────────────────────────────────────────────────────
  "faq.cat.delivery": { fr: "🚚 Livraison GPS", en: "🚚 GPS delivery", ar: "🚚 التوصيل بـ GPS", es: "🚚 Entrega GPS", zh: "🚚 GPS 配送" },
  "faq.delivery.1.q": { fr: "Comment fonctionne la livraison à domicile ?", en: "How does home delivery work?", ar: "كيف يعمل التوصيل إلى المنزل؟", es: "¿Cómo funciona la entrega a domicilio?", zh: "送车上门如何运作？" },
  "faq.delivery.1.a": {
    fr: "Sélectionnez « Livraison à domicile » lors de la réservation. Votre position GPS sert à calculer la distance réelle entre le partenaire et vous (formule de Haversine). Les frais dépendent de cette distance et du tarif de votre pays ; ils sont affichés avant la confirmation. Le partenaire se déplace ensuite avec le véhicule.",
    en: "Choose “Home delivery” when booking. Your GPS position is used to compute the real distance between you and the partner (Haversine formula). The fee depends on that distance and your country's rate, and is shown before you confirm. The partner then brings the vehicle to you.",
    ar: "اختر «التوصيل إلى المنزل» عند الحجز. يُستخدم موقعك عبر GPS لحساب المسافة الفعلية بينك وبين الشريك (صيغة هافرساين). تعتمد الرسوم على هذه المسافة وعلى تعرفة بلدك، وتُعرض قبل التأكيد. ثم يتنقل الشريك بالمركبة إليك.",
    es: "Selecciona «Entrega a domicilio» al reservar. Tu posición GPS sirve para calcular la distancia real entre el socio y tú (fórmula de Haversine). La tarifa depende de esa distancia y del precio de tu país, y se muestra antes de confirmar. El socio se desplaza después con el vehículo.",
    zh: "预订时选择「送车上门」。系统用您的 GPS 位置计算您与商家之间的实际距离（Haversine 公式）。费用取决于该距离与您所在国的费率，并在确认前显示。随后由商家将车辆送达。",
  },
  "faq.delivery.2.q": { fr: "Comment le partenaire trouve mon adresse ?", en: "How does the partner find my address?", ar: "كيف يجد الشريك عنواني؟", es: "¿Cómo encuentra el socio mi dirección?", zh: "商家如何找到我的地址？" },
  "faq.delivery.2.a": {
    fr: "Lors de la réservation, vous partagez votre position GPS ou saisissez une adresse précise. Cette information est transmise au partenaire après confirmation du paiement.",
    en: "When booking, you share your GPS position or enter a precise address. That information is passed to the partner once payment is confirmed.",
    ar: "عند الحجز، تشارك موقعك عبر GPS أو تُدخل عنواناً دقيقاً. تُرسَل هذه المعلومة إلى الشريك بعد تأكيد الدفع.",
    es: "Al reservar, compartes tu posición GPS o introduces una dirección precisa. Esa información se transmite al socio tras confirmar el pago.",
    zh: "预订时，您可共享 GPS 位置或填写准确地址。付款确认后，该信息将转交商家。",
  },
  "faq.delivery.3.q": { fr: "Puis-je retirer le véhicule en agence ?", en: "Can I pick the vehicle up at the agency?", ar: "هل يمكنني استلام المركبة من الوكالة؟", es: "¿Puedo recoger el vehículo en la agencia?", zh: "可以到店取车吗？" },
  "faq.delivery.3.a": {
    fr: "Oui. Choisissez « Retrait en agence » — c'est gratuit. L'adresse exacte du partenaire vous est communiquée après confirmation de la réservation.",
    en: "Yes. Choose “Agency pickup” — it is free. The partner's exact address is given to you once the booking is confirmed.",
    ar: "نعم. اختر «الاستلام من الوكالة» — وهو مجاني. يُبلَّغ عنوان الشريك الدقيق بعد تأكيد الحجز.",
    es: "Sí. Elige «Recogida en agencia» — es gratis. La dirección exacta del socio se te comunica tras confirmar la reserva.",
    zh: "可以。选择「到店自取」，免费。预订确认后将告知商家的准确地址。",
  },
  "faq.delivery.4.q": { fr: "Dans quelles villes livrez-vous ?", en: "Which cities do you deliver to?", ar: "في أي مدن تقومون بالتوصيل؟", es: "¿En qué ciudades entregáis?", zh: "配送覆盖哪些城市？" },
  "faq.delivery.4.a": {
    fr: "VIT AUTO opère dans 28 pays : Côte d'Ivoire, Sénégal, Ghana, Nigeria, Maroc, Algérie, Tunisie, Mali, Burkina Faso, Guinée, France, Belgique, Espagne, Suisse, et d'autres. La couverture d'une ville dépend des partenaires qui y publient : les pages par ville en donnent la liste réelle.",
    en: "VIT AUTO operates in 28 countries: Côte d'Ivoire, Senegal, Ghana, Nigeria, Morocco, Algeria, Tunisia, Mali, Burkina Faso, Guinea, France, Belgium, Spain, Switzerland and more. Coverage of a given city depends on the partners publishing there: the city pages show the real list.",
    ar: "تعمل VIT AUTO في ٢٨ دولة: كوت ديفوار والسنغال وغانا ونيجيريا والمغرب والجزائر وتونس ومالي وبوركينا فاسو وغينيا وفرنسا وبلجيكا وإسبانيا وسويسرا وغيرها. تعتمد تغطية أي مدينة على الشركاء الناشرين فيها: صفحات المدن تعرض القائمة الحقيقية.",
    es: "VIT AUTO opera en 28 países: Costa de Marfil, Senegal, Ghana, Nigeria, Marruecos, Argelia, Túnez, Malí, Burkina Faso, Guinea, Francia, Bélgica, España, Suiza y más. La cobertura de una ciudad depende de los socios que publican allí: las páginas por ciudad muestran la lista real.",
    zh: "VIT AUTO 在 28 个国家运营：科特迪瓦、塞内加尔、加纳、尼日利亚、摩洛哥、阿尔及利亚、突尼斯、马里、布基纳法索、几内亚、法国、比利时、西班牙、瑞士等。具体城市的覆盖取决于当地发布车源的商家：城市页面会显示真实清单。",
  },

  // ─── Partenaires ──────────────────────────────────────────────────────────
  "faq.cat.partners": { fr: "🤝 Partenaires", en: "🤝 Partners", ar: "🤝 الشركاء", es: "🤝 Socios", zh: "🤝 合作伙伴" },
  "faq.partners.1.q": { fr: "Comment devenir partenaire ?", en: "How do I become a partner?", ar: "كيف أصبح شريكاً؟", es: "¿Cómo me hago socio?", zh: "如何成为合作伙伴？" },
  "faq.partners.1.a": {
    fr: "Créez un compte avec le rôle « Partenaire », puis complétez le programme Founding Partner (lettre d'intention + accord de partenariat) — une étape obligatoire avant de publier. Renseignez ensuite votre identité et publiez votre première annonce ; l'adresse exacte est obligatoire pour le calcul de livraison.",
    en: "Create an account with the “Partner” role, then complete the Founding Partner programme (letter of intent + partnership agreement) — a mandatory step before publishing. Then fill in your identity and publish your first listing; the exact address is required for the delivery calculation.",
    ar: "أنشئ حساباً بدور «شريك»، ثم أكمل برنامج الشريك المؤسس (خطاب نوايا + اتفاقية شراكة) — وهي خطوة إلزامية قبل النشر. بعدها أدخل بيانات هويتك وانشر إعلانك الأول؛ العنوان الدقيق إلزامي لاحتساب التوصيل.",
    es: "Crea una cuenta con el rol «Socio» y completa el programa Founding Partner (carta de intenciones + acuerdo de colaboración) — paso obligatorio antes de publicar. Después indica tu identidad y publica tu primer anuncio; la dirección exacta es obligatoria para el cálculo de entrega.",
    zh: "以「合作伙伴」角色注册账户，然后完成 Founding Partner 计划（意向书 + 合作协议）——这是发布前的必经步骤。随后填写身份信息并发布首条车源；配送费用计算需要准确地址。",
  },
  "faq.partners.2.q": { fr: "Quelles sont les commissions ?", en: "What are the commission rates?", ar: "ما هي نسب العمولة؟", es: "¿Cuáles son las comisiones?", zh: "佣金是多少？" },
  "faq.partners.2.a": {
    fr: "Tarif standard : 15 % sur les locations, 5 % sur les ventes et demandes d'essai, 5 % sur l'export, 15 % sur les courses chauffeur, 15 % sur les activités et loisirs, 10 % sur les pièces détachées (7 % en importation). Pendant les 12 mois qui suivent la signature de l'accord Founding Partner, ces taux passent à 10 % sur les locations, 3 % sur les ventes et l'export, 10 % sur le chauffeur — puis reviennent automatiquement au tarif standard. Les abonnements n'accordent aucune remise sur la commission.",
    en: "Standard rates: 15% on rentals, 5% on sales and test-drive requests, 5% on exports, 15% on chauffeur trips, 15% on activities and leisure, 10% on spare parts (7% when imported). For the 12 months following the Founding Partner agreement, these become 10% on rentals, 3% on sales and exports, 10% on chauffeur — then revert automatically to standard. Subscriptions grant no commission discount.",
    ar: "التعرفة القياسية: ١٥٪ على التأجير، و٥٪ على البيع وطلبات تجربة القيادة، و٥٪ على التصدير، و١٥٪ على رحلات السائق، و١٥٪ على الأنشطة والترفيه، و١٠٪ على قطع الغيار (٧٪ عند الاستيراد). وخلال الاثني عشر شهراً التالية لتوقيع اتفاقية الشريك المؤسس تصبح: ١٠٪ على التأجير، و٣٪ على البيع والتصدير، و١٠٪ على السائق — ثم تعود تلقائياً إلى التعرفة القياسية. الاشتراكات لا تمنح أي خصم على العمولة.",
    es: "Tarifa estándar: 15 % en alquileres, 5 % en ventas y solicitudes de prueba, 5 % en exportación, 15 % en trayectos con chófer, 15 % en actividades y ocio, 10 % en repuestos (7 % si se importan). Durante los 12 meses posteriores a la firma del acuerdo Founding Partner, pasan a 10 % en alquileres, 3 % en ventas y exportación, 10 % en chófer — y luego vuelven automáticamente a la tarifa estándar. Las suscripciones no dan ningún descuento sobre la comisión.",
    zh: "标准费率：租赁 15%，销售与试驾申请 5%，出口 5%，司机服务 15%，活动与休闲 15%，零配件 10%（进口件 7%）。签署 Founding Partner 协议后的 12 个月内，上述费率降为租赁 10%、销售与出口 3%、司机 10%，期满自动恢复标准费率。订阅套餐不提供任何佣金折扣。",
  },
  "faq.partners.3.q": { fr: "Comment sont versés mes revenus ?", en: "How are my earnings paid out?", ar: "كيف تُدفع أرباحي؟", es: "¿Cómo se abonan mis ingresos?", zh: "我的收入如何结算？" },
  "faq.partners.3.a": {
    fr: "Après chaque réservation confirmée et terminée, le montant net (prix − commission − frais de service) est versé via la méthode de paiement renseignée dans votre profil.",
    en: "After each confirmed and completed booking, the net amount (price − commission − service fee) is paid out through the payment method set in your profile.",
    ar: "بعد كل حجز مؤكد ومكتمل، يُحوَّل المبلغ الصافي (السعر − العمولة − رسوم الخدمة) عبر وسيلة الدفع المسجّلة في ملفك.",
    es: "Tras cada reserva confirmada y finalizada, el importe neto (precio − comisión − gastos de servicio) se abona mediante el método de pago indicado en tu perfil.",
    zh: "每笔预订确认并完成后，净额（价格 − 佣金 − 服务费）将通过您在个人资料中设置的收款方式支付。",
  },
  "faq.partners.4.q": { fr: "Puis-je publier depuis l'étranger ?", en: "Can I publish from abroad?", ar: "هل يمكنني النشر من الخارج؟", es: "¿Puedo publicar desde el extranjero?", zh: "可以从国外发布吗？" },
  "faq.partners.4.a": {
    fr: "Oui. VIT AUTO est une plateforme mondiale : publiez depuis l'un des 28 pays couverts — Maroc, France, Sénégal, Côte d'Ivoire, Dubaï, Allemagne, Chine et les autres.",
    en: "Yes. VIT AUTO is a global platform: publish from any of the 28 countries covered — Morocco, France, Senegal, Côte d'Ivoire, Dubai, Germany, China and the rest.",
    ar: "نعم. VIT AUTO منصة عالمية: انشر من أي من الدول الـ٢٨ المغطاة — المغرب وفرنسا والسنغال وكوت ديفوار ودبي وألمانيا والصين وغيرها.",
    es: "Sí. VIT AUTO es una plataforma global: publica desde cualquiera de los 28 países cubiertos — Marruecos, Francia, Senegal, Costa de Marfil, Dubái, Alemania, China y los demás.",
    zh: "可以。VIT AUTO 是全球平台：您可从覆盖的 28 个国家中任一国家发布——摩洛哥、法国、塞内加尔、科特迪瓦、迪拜、德国、中国等。",
  },

  // ─── Import / Export ──────────────────────────────────────────────────────
  "faq.cat.ie": { fr: "🌍 Import / Export International", en: "🌍 International import / export", ar: "🌍 الاستيراد والتصدير الدولي", es: "🌍 Importación / exportación internacional", zh: "🌍 国际进出口" },
  "faq.ie.1.q": { fr: "Qu'est-ce que le service Import/Export ?", en: "What is the import/export service?", ar: "ما هي خدمة الاستيراد والتصدير؟", es: "¿Qué es el servicio de importación/exportación?", zh: "进出口服务是什么？" },
  "faq.ie.1.a": {
    fr: "VIT AUTO vous permet d'importer des véhicules depuis la Chine, Dubaï ou l'Europe, ou d'en exporter vers l'Afrique et le Maghreb. Nous gérons l'inspection, le transport maritime, le dédouanement et la livraison de A à Z.",
    en: "VIT AUTO lets you import vehicles from China, Dubai or Europe, or export them to Africa and the Maghreb. We handle inspection, sea freight, customs clearance and delivery from start to finish.",
    ar: "تتيح لك VIT AUTO استيراد المركبات من الصين أو دبي أو أوروبا، أو تصديرها إلى إفريقيا والمغرب العربي. نتولى الفحص والشحن البحري والتخليص الجمركي والتسليم من الألف إلى الياء.",
    es: "VIT AUTO te permite importar vehículos desde China, Dubái o Europa, o exportarlos a África y el Magreb. Gestionamos la inspección, el transporte marítimo, el despacho aduanero y la entrega de principio a fin.",
    zh: "VIT AUTO 可帮您从中国、迪拜或欧洲进口车辆，或出口至非洲与马格里布地区。验车、海运、清关与交付由我们全程负责。",
  },
  "faq.ie.2.q": { fr: "Quels sont les packs disponibles ?", en: "Which packages are available?", ar: "ما الباقات المتاحة؟", es: "¿Qué paquetes hay disponibles?", zh: "有哪些服务套餐？" },
  "faq.ie.2.a": {
    fr: "Trois formules : Silver (à partir de 299 €) pour la vérification vendeur et l'assistance achat, Gold (à partir de 599 €) avec inspection et suivi logistique, Platinum sur devis pour une gestion complète incluant dédouanement et livraison porte-à-porte.",
    en: "Three tiers: Silver (from €299) for seller verification and purchase assistance, Gold (from €599) with inspection and logistics tracking, Platinum on quotation for full handling including customs clearance and door-to-door delivery.",
    ar: "ثلاث باقات: سيلفر (ابتداءً من ٢٩٩ يورو) للتحقق من البائع ومساعدة الشراء، وجولد (ابتداءً من ٥٩٩ يورو) مع الفحص ومتابعة الشحن، وبلاتينيوم حسب عرض السعر لإدارة كاملة تشمل التخليص الجمركي والتسليم من الباب إلى الباب.",
    es: "Tres fórmulas: Silver (desde 299 €) para verificación del vendedor y asistencia en la compra, Gold (desde 599 €) con inspección y seguimiento logístico, Platinum bajo presupuesto para una gestión completa con despacho aduanero y entrega puerta a puerta.",
    zh: "三档方案：Silver（299 欧元起）含卖方核验与购车协助；Gold（599 欧元起）含验车与物流跟踪；Platinum 按需报价，提供含清关与门到门交付的全流程服务。",
  },
  "faq.ie.3.q": { fr: "Combien coûte une inspection avant achat ?", en: "How much does a pre-purchase inspection cost?", ar: "كم تكلفة الفحص قبل الشراء؟", es: "¿Cuánto cuesta una inspección previa a la compra?", zh: "购前验车的费用是多少？" },
  "faq.ie.3.a": {
    fr: "L'inspection Standard démarre à 79 €, l'inspection Premium à 199 €. Le rapport est transmis avant tout engagement d'achat.",
    en: "The Standard inspection starts at €79, the Premium inspection at €199. The report is delivered before any purchase commitment.",
    ar: "يبدأ الفحص القياسي من ٧٩ يورو، والفحص المميز من ١٩٩ يورو. يُسلَّم التقرير قبل أي التزام بالشراء.",
    es: "La inspección Estándar empieza en 79 €, la Premium en 199 €. El informe se entrega antes de cualquier compromiso de compra.",
    zh: "标准验车 79 欧元起，高级验车 199 欧元起。报告在您作出任何购买承诺前交付。",
  },
  "faq.ie.4.q": { fr: "Qui peut utiliser le service Import/Export ?", en: "Who can use the import/export service?", ar: "من يمكنه استخدام خدمة الاستيراد والتصدير؟", es: "¿Quién puede usar el servicio de importación/exportación?", zh: "谁可以使用进出口服务？" },
  "faq.ie.4.a": {
    fr: "Toute personne souhaitant acheter un véhicule à l'international, particulier comme professionnel. Les importateurs et concessionnaires bénéficient de conditions préférentielles via le plan Premium.",
    en: "Anyone wishing to buy a vehicle internationally, private individual or professional. Importers and dealers get preferential terms through the Premium plan.",
    ar: "أي شخص يرغب في شراء مركبة دولياً، فرداً كان أو محترفاً. يحصل المستوردون والوكلاء على شروط تفضيلية عبر باقة بريميوم.",
    es: "Cualquier persona que desee comprar un vehículo a nivel internacional, particular o profesional. Importadores y concesionarios obtienen condiciones preferentes con el plan Premium.",
    zh: "任何希望跨境购车的个人或企业均可使用。进口商与经销商可通过 Premium 套餐享受优惠条件。",
  },
  "faq.ie.5.q": { fr: "Depuis quels pays puis-je importer ?", en: "Which countries can I import from?", ar: "من أي بلدان يمكنني الاستيراد؟", es: "¿Desde qué países puedo importar?", zh: "可以从哪些国家进口？" },
  "faq.ie.5.a": {
    fr: "Principalement depuis la Chine (BYD, Geely, Chery…), les Émirats arabes unis (Dubaï) et l'Europe (Allemagne, France, Belgique, Pays-Bas, Espagne, Italie). La liste s'étend régulièrement.",
    en: "Mainly from China (BYD, Geely, Chery…), the United Arab Emirates (Dubai) and Europe (Germany, France, Belgium, the Netherlands, Spain, Italy). The list keeps growing.",
    ar: "بشكل أساسي من الصين (BYD وGeely وChery…) والإمارات العربية المتحدة (دبي) وأوروبا (ألمانيا وفرنسا وبلجيكا وهولندا وإسبانيا وإيطاليا). القائمة تتوسع باستمرار.",
    es: "Principalmente desde China (BYD, Geely, Chery…), los Emiratos Árabes Unidos (Dubái) y Europa (Alemania, Francia, Bélgica, Países Bajos, España, Italia). La lista se amplía con regularidad.",
    zh: "主要来自中国（比亚迪、吉利、奇瑞等）、阿联酋（迪拜）以及欧洲（德国、法国、比利时、荷兰、西班牙、意大利）。清单会持续扩展。",
  },

  // ─── Sécurité ─────────────────────────────────────────────────────────────
  "faq.cat.security": { fr: "🛡️ Sécurité & Données", en: "🛡️ Security & data", ar: "🛡️ الأمان والبيانات", es: "🛡️ Seguridad y datos", zh: "🛡️ 安全与数据" },
  "faq.security.1.q": { fr: "Comment mes données sont-elles protégées ?", en: "How is my data protected?", ar: "كيف تُحمى بياناتي؟", es: "¿Cómo se protegen mis datos?", zh: "我的数据如何受到保护？" },
  "faq.security.1.a": {
    fr: "Conformément au RGPD et à la loi marocaine 09-08, vos données sont chiffrées (TLS 1.3), ne sont jamais revendues et sont supprimables sur demande. Consultez notre politique de confidentialité.",
    en: "In line with the GDPR and Moroccan law 09-08, your data is encrypted (TLS 1.3), never resold and can be deleted on request. See our privacy policy.",
    ar: "وفقاً للائحة العامة لحماية البيانات والقانون المغربي ٠٩-٠٨، بياناتك مشفّرة (TLS 1.3) ولا تُباع أبداً ويمكن حذفها عند الطلب. راجع سياسة الخصوصية لدينا.",
    es: "Conforme al RGPD y a la ley marroquí 09-08, tus datos están cifrados (TLS 1.3), nunca se revenden y se pueden eliminar a petición. Consulta nuestra política de privacidad.",
    zh: "依据 GDPR 与摩洛哥 09-08 号法律，您的数据经 TLS 1.3 加密，绝不转售，并可应要求删除。详见我们的隐私政策。",
  },
  "faq.security.2.q": { fr: "Que se passe-t-il en cas d'accident ?", en: "What happens in case of an accident?", ar: "ماذا يحدث في حالة وقوع حادث؟", es: "¿Qué ocurre en caso de accidente?", zh: "发生事故怎么办？" },
  "faq.security.2.a": {
    fr: "Contactez immédiatement notre service client (24 h/24). Selon l'option d'assurance souscrite, la procédure de déclaration est déclenchée.",
    en: "Contact our customer service immediately (24/7). Depending on the insurance option taken out, the claim procedure is started.",
    ar: "اتصل بخدمة العملاء فوراً (على مدار الساعة). وبحسب خيار التأمين المشترك فيه، تُباشَر إجراءات التصريح.",
    es: "Contacta de inmediato con nuestro servicio de atención al cliente (24 h). Según la opción de seguro contratada, se inicia el procedimiento de declaración.",
    zh: "请立即联系我们的客服（全天候）。将根据您所投保的方案启动理赔申报流程。",
  },
  "faq.security.3.q": { fr: "Les véhicules sont-ils vérifiés ?", en: "Are the vehicles checked?", ar: "هل يتم التحقق من المركبات؟", es: "¿Se verifican los vehículos?", zh: "车辆经过核验吗？" },
  "faq.security.3.a": {
    fr: "Chaque annonce est modérée par notre équipe avant publication. Les partenaires doivent fournir des documents d'identité et de propriété vérifiés.",
    en: "Every listing is reviewed by our team before publication. Partners must provide verified identity and ownership documents.",
    ar: "تخضع كل إعلان لمراجعة فريقنا قبل النشر. وعلى الشركاء تقديم وثائق هوية وملكية موثّقة.",
    es: "Cada anuncio es moderado por nuestro equipo antes de publicarse. Los socios deben aportar documentos de identidad y propiedad verificados.",
    zh: "每条车源在发布前均由我们的团队审核。商家须提供经核验的身份与所有权证件。",
  },
  "faq.security.4.q": { fr: "Ma position GPS est-elle stockée ?", en: "Is my GPS position stored?", ar: "هل يُخزَّن موقعي عبر GPS؟", es: "¿Se almacena mi posición GPS?", zh: "我的 GPS 位置会被保存吗？" },
  "faq.security.4.a": {
    fr: "Votre position GPS n'est collectée que lors d'une réservation avec livraison, avec votre consentement explicite, et uniquement pour calculer les frais et guider la livraison. Elle est supprimée après 90 jours.",
    en: "Your GPS position is only collected for a booking with delivery, with your explicit consent, and solely to compute the fee and guide the delivery. It is deleted after 90 days.",
    ar: "لا يُجمع موقعك عبر GPS إلا عند حجز مع توصيل، وبموافقتك الصريحة، وفقط لاحتساب الرسوم وتوجيه التسليم. ويُحذف بعد ٩٠ يوماً.",
    es: "Tu posición GPS solo se recoge en una reserva con entrega, con tu consentimiento explícito, y únicamente para calcular la tarifa y guiar la entrega. Se elimina a los 90 días.",
    zh: "仅在含配送的预订中、经您明确同意后才会采集 GPS 位置，且仅用于计算费用与指引配送。90 天后删除。",
  },
};
