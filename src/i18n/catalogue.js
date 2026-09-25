/**
 * Traductions — reliquat du catalogue et de la fiche véhicule.
 *
 * Ces deux pages passaient déjà largement par t() (94 et 61 appels) : il n'y
 * restait que des libellés isolés, mais ce sont ceux d'une fiche produit —
 * « Année », « Kilométrage », « Boîte de vitesses ». Un seul d'entre eux
 * suffisait à trahir la page.
 */
export default {

  // ─── Catalogue ────────────────────────────────────────────────────────────
  "catalogue.metaTitle": { fr: "Catalogue de véhicules", en: "Vehicle catalogue", ar: "فهرس المركبات", es: "Catálogo de vehículos", zh: "车辆目录" },
  "catalogue.metaDesc": {
    fr: "Louez ou achetez un véhicule parmi les annonces vérifiées de VIT AUTO : voitures, SUV, utilitaires, chauffeurs privés et activités, dans 28 pays.",
    en: "Rent or buy a vehicle from VIT AUTO's verified listings: cars, SUVs, vans, private chauffeurs and activities, across 28 countries.",
    ar: "استأجر أو اشترِ مركبة من إعلانات VIT AUTO الموثّقة: سيارات ودفع رباعي ومركبات نفعية وسائقون خاصون وأنشطة، في ٢٨ دولة.",
    es: "Alquila o compra un vehículo entre los anuncios verificados de VIT AUTO: coches, SUV, furgonetas, chóferes privados y actividades, en 28 países.",
    zh: "在 VIT AUTO 的认证车源中租车或购车：轿车、SUV、厢式车、私人司机与活动，覆盖 28 个国家。",
  },
  "catalogue.weatherDependent": { fr: "· 🌤️ selon météo", en: "· 🌤️ weather permitting", ar: "· 🌤️ حسب الطقس", es: "· 🌤️ según el tiempo", zh: "· 🌤️ 视天气而定" },
  "catalogue.leisureByCity":    { fr: "Activités & loisirs par ville", en: "Activities & leisure by city", ar: "الأنشطة والترفيه حسب المدينة", es: "Actividades y ocio por ciudad", zh: "按城市浏览活动与休闲" },
  "catalogue.partsByBrand":     { fr: "Pièces détachées par marque", en: "Spare parts by brand", ar: "قطع الغيار حسب العلامة", es: "Repuestos por marca", zh: "按品牌浏览零配件" },
  "catalogue.yourCountry":      { fr: "votre pays", en: "your country", ar: "بلدك", es: "tu país", zh: "您所在的国家" },
  "catalogue.electric":         { fr: "Électrique", en: "Electric", ar: "كهربائية", es: "Eléctrico", zh: "电动" },

  // ─── Fiche véhicule ───────────────────────────────────────────────────────
  // Année, kilométrage et état réutilisent les clés vehicle.* déjà présentes
  // dans translations.js — elles étaient appelées avec un repli français mort
  // (`t("vehicle.year") || "Année"` : t() ne renvoie jamais de valeur fausse,
  // il renvoie la clé). Le repli est supprimé côté page.
  "fiche.gearbox":     { fr: "Boîte de vitesses", en: "Gearbox", ar: "ناقل الحركة", es: "Caja de cambios", zh: "变速箱" },
  "fiche.interior":    { fr: "Intérieur", en: "Interior", ar: "المقصورة الداخلية", es: "Interior", zh: "内饰" },
  "fiche.electronics": { fr: "Électronique", en: "Electronics", ar: "الإلكترونيات", es: "Electrónica", zh: "电子系统" },
  "fiche.generalNotes":{ fr: "Observations générales :", en: "General observations:", ar: "ملاحظات عامة:", es: "Observaciones generales:", zh: "总体说明：" },
  "fiche.instantBook": { fr: "⚡ Réservation instantanée", en: "⚡ Instant booking", ar: "⚡ حجز فوري", es: "⚡ Reserva instantánea", zh: "⚡ 即时预订" },
  "fiche.fromDays7":   { fr: "(dès 7 jours)", en: "(from 7 days)", ar: "(ابتداءً من ٧ أيام)", es: "(desde 7 días)", zh: "（7 天起）" },
  "fiche.fromDays30":  { fr: "(dès 30 jours)", en: "(from 30 days)", ar: "(ابتداءً من ٣٠ يوماً)", es: "(desde 30 días)", zh: "（30 天起）" },
  "fiche.seasonal":    { fr: "🗓️ Tarif variable selon la période — voir le détail aux dates choisies", en: "🗓️ Rate varies by period — see the detail for your dates", ar: "🗓️ السعر يتغير حسب الفترة — راجع التفاصيل للتواريخ المختارة", es: "🗓️ Tarifa variable según el periodo — consulta el detalle en tus fechas", zh: "🗓️ 价格随时段浮动——选定日期后查看明细" },
  "fiche.classicCredit":     { fr: "Crédit classique", en: "Classic credit", ar: "قرض تقليدي", es: "Crédito clásico", zh: "传统信贷" },
  "fiche.classicCreditDesc": { fr: "Financement bancaire — propriété immédiate", en: "Bank financing — immediate ownership", ar: "تمويل بنكي — تملّك فوري", es: "Financiación bancaria — propiedad inmediata", zh: "银行融资——即刻拥有产权" },
  "fiche.monthly":     { fr: "Mensualité", en: "Monthly payment", ar: "القسط الشهري", es: "Cuota mensual", zh: "月供" },
  "fiche.duration":    { fr: "Durée", en: "Term", ar: "المدة", es: "Duración", zh: "期限" },
  "fiche.askCredit":   { fr: "💳 Demander ce crédit", en: "💳 Apply for this credit", ar: "💳 اطلب هذا القرض", es: "💳 Solicitar este crédito", zh: "💳 申请该信贷" },
  "fiche.default":     { fr: "défaut", en: "default", ar: "افتراضي", es: "predeterminado", zh: "默认" },
  "fiche.buyImport":   { fr: "🚢 Acheter à l'import", en: "🚢 Buy on import", ar: "🚢 اشترِ عبر الاستيراد", es: "🚢 Comprar en importación", zh: "🚢 进口购买" },
  "fiche.addedToCart": { fr: "Véhicule ajouté au panier.", en: "Vehicle added to the cart.", ar: "تمت إضافة المركبة إلى السلة.", es: "Vehículo añadido al carrito.", zh: "车辆已加入购物车。" },
  "fiche.alreadyInCart": { fr: "🛒 Déjà dans le panier", en: "🛒 Already in the cart", ar: "🛒 موجودة في السلة", es: "🛒 Ya está en el carrito", zh: "🛒 已在购物车中" },

  // ─── Rapport d'inspection (fiche véhicule et annonce Import/Export) ───────
  "insp.title":       { fr: "Rapport d'inspection", en: "Inspection report", ar: "تقرير الفحص", es: "Informe de inspección", zh: "检测报告" },
  "insp.engine":      { fr: "Moteur", en: "Engine", ar: "المحرك", es: "Motor", zh: "发动机" },
  "insp.suspension":  { fr: "Suspension", en: "Suspension", ar: "نظام التعليق", es: "Suspensión", zh: "悬挂" },
  "insp.brakes":      { fr: "Freins", en: "Brakes", ar: "الفرامل", es: "Frenos", zh: "刹车" },
  "insp.tires":       { fr: "Pneus", en: "Tyres", ar: "الإطارات", es: "Neumáticos", zh: "轮胎" },
  "insp.bodywork":    { fr: "Carrosserie", en: "Bodywork", ar: "الهيكل", es: "Carrocería", zh: "车身" },
  "insp.battery":     { fr: "Batterie (VE)", en: "Battery (EV)", ar: "البطارية (كهربائية)", es: "Batería (VE)", zh: "电池（电动车）" },
  "insp.excellent":   { fr: "Excellent", en: "Excellent", ar: "ممتاز", es: "Excelente", zh: "优秀" },
  "insp.bon":         { fr: "Bon", en: "Good", ar: "جيد", es: "Bueno", zh: "良好" },
  "insp.moyen":       { fr: "Moyen", en: "Average", ar: "متوسط", es: "Regular", zh: "一般" },
  "insp.mauvais":     { fr: "Mauvais", en: "Poor", ar: "سيئ", es: "Malo", zh: "较差" },
  "insp.na":          { fr: "N/A", en: "N/A", ar: "غير متاح", es: "N/D", zh: "不适用" },
  "cart.add":         { fr: "🛒 Ajouter au panier", en: "🛒 Add to cart", ar: "🛒 أضف إلى السلة", es: "🛒 Añadir al carrito", zh: "🛒 加入购物车" },
};
