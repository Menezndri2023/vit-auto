/**
 * Traductions — pages publiques indexées par les moteurs.
 *
 * Vague 2 (2026-09-25) : les pages d'atterrissage. Ce sont elles qui portent
 * la longue traîne (« location voiture Abidjan », « importer une voiture
 * depuis la Chine ») : les laisser en français revenait à n'exister que pour
 * les requêtes francophones.
 *
 * Les libellés composés ({n} annonces, prix minimum…) sont découpés en
 * morceaux plutôt qu'assemblés en français dans le code : une phrase
 * construite par concaténation ne se traduit pas, elle se réécrit. Le singulier
 * et le pluriel sont deux clés distinctes — t() n'a pas de règle de pluriel, et
 * l'arabe comme le chinois n'en veulent pas.
 */
export default {

  // ─── Fil d'Ariane et liens partagés ───────────────────────────────────────
  "nav.importExport": { fr: "Import / Export", en: "Import / Export", ar: "الاستيراد والتصدير", es: "Importación / Exportación", zh: "进出口" },

  // ─── Page par ville : location et vente ───────────────────────────────────
  "ville.h1Rent":    { fr: "Location de voiture à {ville}", en: "Car rental in {ville}", ar: "تأجير سيارات في {ville}", es: "Alquiler de coches en {ville}", zh: "{ville}租车" },
  "ville.h1Sale":    { fr: "Voitures à vendre à {ville}",   en: "Cars for sale in {ville}", ar: "سيارات للبيع في {ville}", es: "Coches en venta en {ville}", zh: "{ville}二手车出售" },
  "ville.titleRent": { fr: "Location de voiture à {ville}", en: "Car rental in {ville}", ar: "تأجير سيارات في {ville}", es: "Alquiler de coches en {ville}", zh: "{ville}租车" },
  "ville.titleSale": { fr: "Achat de voiture à {ville}",    en: "Buy a car in {ville}", ar: "شراء سيارة في {ville}", es: "Comprar un coche en {ville}", zh: "在{ville}购车" },
  "ville.otherRent": { fr: "Louer un véhicule à {ville}",   en: "Rent a vehicle in {ville}", ar: "استأجر مركبة في {ville}", es: "Alquilar un vehículo en {ville}", zh: "在{ville}租车" },
  "ville.otherSale": { fr: "Acheter un véhicule à {ville}", en: "Buy a vehicle in {ville}", ar: "اشترِ مركبة في {ville}", es: "Comprar un vehículo en {ville}", zh: "在{ville}买车" },
  "ville.countRentOne":  { fr: "{n} véhicule à louer à {ville}",   en: "{n} vehicle to rent in {ville}",   ar: "مركبة واحدة للإيجار في {ville}",  es: "{n} vehículo en alquiler en {ville}",  zh: "{ville}有 {n} 辆车可租" },
  "ville.countRentMany": { fr: "{n} véhicules à louer à {ville}",  en: "{n} vehicles to rent in {ville}",  ar: "{n} مركبة للإيجار في {ville}",   es: "{n} vehículos en alquiler en {ville}", zh: "{ville}有 {n} 辆车可租" },
  "ville.countSaleOne":  { fr: "{n} véhicule à acheter à {ville}", en: "{n} vehicle for sale in {ville}",  ar: "مركبة واحدة للبيع في {ville}",   es: "{n} vehículo en venta en {ville}",    zh: "{ville}有 {n} 辆车出售" },
  "ville.countSaleMany": { fr: "{n} véhicules à acheter à {ville}", en: "{n} vehicles for sale in {ville}", ar: "{n} مركبة للبيع في {ville}",    es: "{n} vehículos en venta en {ville}",   zh: "{ville}有 {n} 辆车出售" },
  "ville.fromPerDay": { fr: ", à partir de {prix} par jour", en: ", from {prix} per day", ar: "، ابتداءً من {prix} لليوم", es: ", desde {prix} por día", zh: "，每日 {prix} 起" },
  "ville.from":       { fr: ", à partir de {prix}",          en: ", from {prix}",         ar: "، ابتداءً من {prix}",       es: ", desde {prix}",         zh: "，{prix} 起" },
  "ville.descTail": {
    fr: ". Réservation en ligne, contrat digital et assistance VIT AUTO.",
    en: ". Online booking, digital contract and VIT AUTO support.",
    ar: ". حجز عبر الإنترنت وعقد رقمي ودعم من VIT AUTO.",
    es: ". Reserva en línea, contrato digital y asistencia VIT AUTO.",
    zh: "。在线预订、电子合同，并享 VIT AUTO 支持服务。",
  },
  "ville.empty": {
    fr: "Aucune annonce disponible à {ville} pour le moment. Découvrez tout le catalogue VIT AUTO.",
    en: "No listings available in {ville} at the moment. Browse the full VIT AUTO catalogue.",
    ar: "لا توجد إعلانات متاحة في {ville} حالياً. تصفّح كامل فهرس VIT AUTO.",
    es: "No hay anuncios disponibles en {ville} por ahora. Descubre todo el catálogo de VIT AUTO.",
    zh: "{ville}目前暂无车源。请浏览 VIT AUTO 全部车源。",
  },
  "ville.brands":      { fr: "Marques disponibles à {ville} : {marques}.", en: "Brands available in {ville}: {marques}.", ar: "العلامات المتوفرة في {ville}: {marques}.", es: "Marcas disponibles en {ville}: {marques}.", zh: "{ville}在售品牌：{marques}。" },
  "ville.seeAll":      { fr: "Voir tout le catalogue de {ville}", en: "See the full {ville} catalogue", ar: "عرض كامل فهرس {ville}", es: "Ver todo el catálogo de {ville}", zh: "查看{ville}全部车源" },
  "ville.noListing":   { fr: "Aucune annonce publiée à {ville} pour l'instant.", en: "No listings published in {ville} yet.", ar: "لا توجد إعلانات منشورة في {ville} بعد.", es: "Aún no hay anuncios publicados en {ville}.", zh: "{ville}暂未发布车源。" },
  "ville.browseAll":   { fr: "Parcourir tout le catalogue", en: "Browse the full catalogue", ar: "تصفّح الفهرس كاملاً", es: "Explorar todo el catálogo", zh: "浏览全部车源" },
  "ville.otherCities": { fr: "Autres villes desservies", en: "Other cities served", ar: "مدن أخرى مخدومة", es: "Otras ciudades cubiertas", zh: "其他覆盖城市" },

  // ─── Page par secteur : activités & loisirs ───────────────────────────────
  "secteur.act.h1":    { fr: "Activités & loisirs à {nom}", en: "Activities & leisure in {nom}", ar: "الأنشطة والترفيه في {nom}", es: "Actividades y ocio en {nom}", zh: "{nom}的活动与休闲" },
  "secteur.act.title": { fr: "Activités & loisirs à {nom} — réservation en ligne", en: "Activities & leisure in {nom} — book online", ar: "الأنشطة والترفيه في {nom} — حجز عبر الإنترنت", es: "Actividades y ocio en {nom} — reserva en línea", zh: "{nom}的活动与休闲——在线预订" },
  "secteur.act.countOne":  { fr: "{n} activité réservable à {nom}",   en: "{n} bookable activity in {nom}",   ar: "نشاط واحد قابل للحجز في {nom}", es: "{n} actividad reservable en {nom}",  zh: "{nom}有 {n} 项活动可预订" },
  "secteur.act.countMany": { fr: "{n} activités réservables à {nom}", en: "{n} bookable activities in {nom}", ar: "{n} نشاطاً قابلاً للحجز في {nom}", es: "{n} actividades reservables en {nom}", zh: "{nom}有 {n} 项活动可预订" },
  "secteur.act.fromPerPerson": { fr: ", à partir de {prix} par personne", en: ", from {prix} per person", ar: "، ابتداءً من {prix} للشخص", es: ", desde {prix} por persona", zh: "，每人 {prix} 起" },
  "secteur.act.tail": {
    fr: ". Réservation en ligne, condition météo affichée quand elle s'applique, règlement sur place.",
    en: ". Book online, weather conditions shown where they apply, payment on site.",
    ar: ". حجز عبر الإنترنت، مع عرض شرط الطقس عند انطباقه، والدفع في الموقع.",
    es: ". Reserva en línea, condición meteorológica indicada cuando aplica, pago in situ.",
    zh: "。在线预订，适用时显示天气条件，现场付款。",
  },
  "secteur.act.empty": {
    fr: "Aucune activité publiée à {nom} pour le moment. Découvrez les activités & loisirs de tout le catalogue VIT AUTO.",
    en: "No activity published in {nom} at the moment. Browse all activities & leisure on VIT AUTO.",
    ar: "لا توجد أنشطة منشورة في {nom} حالياً. تصفّح كل الأنشطة والترفيه على VIT AUTO.",
    es: "No hay actividades publicadas en {nom} por ahora. Descubre todas las actividades y ocio de VIT AUTO.",
    zh: "{nom}目前暂无活动。请浏览 VIT AUTO 的全部活动与休闲项目。",
  },
  "secteur.act.catalogueLabel": { fr: "Toutes les activités à {nom}", en: "All activities in {nom}", ar: "كل الأنشطة في {nom}", es: "Todas las actividades en {nom}", zh: "{nom}的全部活动" },
  "secteur.act.facets":  { fr: "Types d'activités", en: "Activity types", ar: "أنواع الأنشطة", es: "Tipos de actividad", zh: "活动类型" },
  "secteur.act.others":  { fr: "Autres villes", en: "Other cities", ar: "مدن أخرى", es: "Otras ciudades", zh: "其他城市" },

  // ─── Page par secteur : pièces détachées ──────────────────────────────────
  "secteur.parts.h1":    { fr: "Pièces détachées {nom}", en: "{nom} spare parts", ar: "قطع غيار {nom}", es: "Repuestos {nom}", zh: "{nom} 零配件" },
  "secteur.parts.title": { fr: "Pièces détachées {nom} — vente directe ou importation, livrées", en: "{nom} spare parts — direct sale or import, delivered", ar: "قطع غيار {nom} — بيع مباشر أو استيراد مع التوصيل", es: "Repuestos {nom} — venta directa o importación, con entrega", zh: "{nom} 零配件——现货直售或进口订购，送货上门" },
  "secteur.parts.countOne":  { fr: "{n} pièce compatible {nom}",   en: "{n} part compatible with {nom}",   ar: "قطعة واحدة متوافقة مع {nom}",  es: "{n} pieza compatible con {nom}",  zh: "{n} 件适配 {nom} 的配件" },
  "secteur.parts.countMany": { fr: "{n} pièces compatibles {nom}", en: "{n} parts compatible with {nom}", ar: "{n} قطعة متوافقة مع {nom}",    es: "{n} piezas compatibles con {nom}", zh: "{n} 件适配 {nom} 的配件" },
  "secteur.parts.tail": {
    fr: ". En stock chez nos partenaires ou importées à la commande, toujours livrées, règlement à la réception.",
    en: ". In stock with our partners or imported to order, always delivered, payment on receipt.",
    ar: ". متوفرة لدى شركائنا أو تُستورد عند الطلب، مع التوصيل دائماً والدفع عند الاستلام.",
    es: ". En stock con nuestros socios o importadas bajo pedido, siempre entregadas, pago al recibir.",
    zh: "。合作伙伴现货或按需进口，均配送到手，收货时付款。",
  },
  "secteur.parts.empty": {
    fr: "Aucune pièce {nom} publiée pour le moment. Découvrez toutes les pièces détachées du catalogue VIT AUTO.",
    en: "No {nom} part published at the moment. Browse all spare parts on VIT AUTO.",
    ar: "لا توجد قطع {nom} منشورة حالياً. تصفّح كل قطع الغيار على VIT AUTO.",
    es: "No hay piezas {nom} publicadas por ahora. Descubre todos los repuestos del catálogo VIT AUTO.",
    zh: "目前暂无 {nom} 配件。请浏览 VIT AUTO 的全部零配件。",
  },
  "secteur.parts.catalogueLabel": { fr: "Toutes les pièces {nom}", en: "All {nom} parts", ar: "كل قطع {nom}", es: "Todas las piezas {nom}", zh: "全部 {nom} 配件" },
  "secteur.parts.facets": { fr: "Catégories disponibles", en: "Available categories", ar: "الفئات المتوفرة", es: "Categorías disponibles", zh: "可选类别" },
  "secteur.parts.others": { fr: "Autres marques", en: "Other brands", ar: "علامات أخرى", es: "Otras marcas", zh: "其他品牌" },
  "secteur.noListing": { fr: "Aucune annonce pour l'instant.", en: "No listings yet.", ar: "لا توجد إعلانات بعد.", es: "Aún no hay anuncios.", zh: "暂无内容。" },
  "secteur.browse":    { fr: "Parcourir le catalogue", en: "Browse the catalogue", ar: "تصفّح الفهرس", es: "Explorar el catálogo", zh: "浏览车源" },

  // ─── Page par pays d'origine (importation) ────────────────────────────────
  "origine.title":  { fr: "Importer une voiture depuis {pays}", en: "Import a car from {pays}", ar: "استيراد سيارة من {pays}", es: "Importar un coche desde {pays}", zh: "从{pays}进口汽车" },
  "origine.countOne":  { fr: "{n} véhicule à importer depuis {pays}",  en: "{n} vehicle to import from {pays}",  ar: "مركبة واحدة للاستيراد من {pays}", es: "{n} vehículo para importar desde {pays}",  zh: "有 {n} 辆车可从{pays}进口" },
  "origine.countMany": { fr: "{n} véhicules à importer depuis {pays}", en: "{n} vehicles to import from {pays}", ar: "{n} مركبة للاستيراد من {pays}",  es: "{n} vehículos para importar desde {pays}", zh: "有 {n} 辆车可从{pays}进口" },
  "origine.tail": {
    fr: ". Inspection avant achat, transport maritime, dédouanement et livraison gérés par VIT AUTO.",
    en: ". Pre-purchase inspection, sea freight, customs clearance and delivery handled by VIT AUTO.",
    ar: ". الفحص قبل الشراء والشحن البحري والتخليص الجمركي والتسليم — تتولاها VIT AUTO.",
    es: ". Inspección previa a la compra, transporte marítimo, despacho aduanero y entrega gestionados por VIT AUTO.",
    zh: "。购前验车、海运、清关与交付均由 VIT AUTO 负责。",
  },
  "origine.empty": {
    fr: "Importation de véhicules depuis {pays} avec VIT AUTO : inspection, transport, dédouanement et livraison. Aucune annonce en stock pour le moment.",
    en: "Vehicle import from {pays} with VIT AUTO: inspection, transport, customs clearance and delivery. No listing in stock at the moment.",
    ar: "استيراد المركبات من {pays} مع VIT AUTO: الفحص والنقل والتخليص الجمركي والتسليم. لا توجد إعلانات متوفرة حالياً.",
    es: "Importación de vehículos desde {pays} con VIT AUTO: inspección, transporte, despacho aduanero y entrega. Sin anuncios en stock por ahora.",
    zh: "通过 VIT AUTO 从{pays}进口车辆：验车、运输、清关与交付。目前暂无现车。",
  },
  "origine.sdName": { fr: "Importation de véhicules depuis {pays}", en: "Vehicle import from {pays}", ar: "استيراد المركبات من {pays}", es: "Importación de vehículos desde {pays}", zh: "从{pays}进口车辆" },
  "origine.brands": { fr: "Marques disponibles depuis {pays} : {marques}.", en: "Brands available from {pays}: {marques}.", ar: "العلامات المتوفرة من {pays}: {marques}.", es: "Marcas disponibles desde {pays}: {marques}.", zh: "可从{pays}进口的品牌：{marques}。" },
  "origine.seeAll": { fr: "Voir toutes les annonces depuis {pays}", en: "See all listings from {pays}", ar: "عرض كل الإعلانات من {pays}", es: "Ver todos los anuncios desde {pays}", zh: "查看来自{pays}的全部车源" },
  "origine.how":    { fr: "Comment fonctionne l'importation", en: "How importing works", ar: "كيف يتم الاستيراد", es: "Cómo funciona la importación", zh: "进口流程说明" },
  "origine.loading": { fr: "Chargement des annonces…", en: "Loading listings…", ar: "جارٍ تحميل الإعلانات…", es: "Cargando anuncios…", zh: "正在加载车源……" },
  "origine.noStock": { fr: "Aucune annonce en stock depuis {pays} actuellement — le corridor reste ouvert.", en: "No listing in stock from {pays} right now — the corridor stays open.", ar: "لا توجد إعلانات متوفرة من {pays} حالياً — الممر يبقى مفتوحاً.", es: "Sin anuncios en stock desde {pays} actualmente — el corredor sigue abierto.", zh: "目前暂无来自{pays}的现车——该进口通道仍然开放。" },
  "origine.allOrigins": { fr: "Voir toutes les origines", en: "See all origins", ar: "عرض كل بلدان المصدر", es: "Ver todos los orígenes", zh: "查看全部出口国" },
  "origine.otherCountries": { fr: "Autres pays d'origine", en: "Other countries of origin", ar: "بلدان مصدر أخرى", es: "Otros países de origen", zh: "其他出口国" },
};

// ── Libellés métier affichés sur les pages publiques ────────────────────────
//
// Les tables françaises d'origine (constants/activityTypes.js et
// constants/spareParts.js) restent la référence des écrans internes ; ces clés
// ne servent qu'à l'affichage public, via i18n/libelles.js.
export const LIBELLES_METIER = {
  "activity.QUAD":         { fr: "Quad",              en: "Quad biking",       ar: "دراجة رباعية",        es: "Quad",                  zh: "沙滩车" },
  "activity.SURF":         { fr: "Surf",              en: "Surfing",           ar: "ركوب الأمواج",        es: "Surf",                  zh: "冲浪" },
  "activity.MONTGOLFIERE": { fr: "Montgolfière",      en: "Hot-air balloon",   ar: "منطاد هوائي",         es: "Globo aerostático",     zh: "热气球" },
  "activity.JETSKI":       { fr: "Jetski",            en: "Jet ski",           ar: "جت سكي",              es: "Moto acuática",         zh: "水上摩托" },
  "activity.JET_PRIVE":    { fr: "Jet privé",         en: "Private jet",       ar: "طائرة خاصة",          es: "Jet privado",           zh: "私人飞机" },
  "activity.BATEAU":       { fr: "Bateau",            en: "Boat",              ar: "قارب",                es: "Barco",                 zh: "游船" },
  "activity.KARTING":      { fr: "Karting",           en: "Go-karting",        ar: "كارتينغ",             es: "Karting",               zh: "卡丁车" },
  "activity.PAINTBALL":    { fr: "Paintball",         en: "Paintball",         ar: "بينتبول",             es: "Paintball",             zh: "彩弹射击" },
  "activity.PLONGEE":      { fr: "Plongée",           en: "Diving",            ar: "الغوص",               es: "Buceo",                 zh: "潜水" },
  "activity.PARACHUTE":    { fr: "Parachute",         en: "Skydiving",         ar: "القفز بالمظلة",       es: "Paracaidismo",          zh: "跳伞" },
  "activity.PARAPENTE":    { fr: "Parapente",         en: "Paragliding",       ar: "الطيران الشراعي",     es: "Parapente",             zh: "滑翔伞" },
  "activity.CROISIERE":    { fr: "Croisière / Yacht", en: "Cruise / Yacht",    ar: "رحلة بحرية / يخت",    es: "Crucero / Yate",        zh: "游轮 / 游艇" },
  "activity.AUTRE":        { fr: "Autre activité",    en: "Other activity",    ar: "نشاط آخر",            es: "Otra actividad",        zh: "其他活动" },

  "part.MOTEUR":               { fr: "Moteur",                 en: "Engine",                  ar: "المحرك",              es: "Motor",                   zh: "发动机" },
  "part.TRANSMISSION":         { fr: "Transmission / boîte",   en: "Transmission / gearbox",  ar: "ناقل الحركة",         es: "Transmisión / caja",      zh: "变速箱" },
  "part.FREINAGE":             { fr: "Freinage",               en: "Braking",                 ar: "الفرامل",             es: "Frenos",                  zh: "制动系统" },
  "part.SUSPENSION_DIRECTION": { fr: "Suspension / direction", en: "Suspension / steering",   ar: "التعليق والتوجيه",    es: "Suspensión / dirección",  zh: "悬挂与转向" },
  "part.ELECTRIQUE":           { fr: "Électrique / batterie",  en: "Electrical / battery",    ar: "الكهرباء والبطارية",  es: "Eléctrico / batería",     zh: "电气与电池" },
  "part.CARROSSERIE":          { fr: "Carrosserie",            en: "Bodywork",                ar: "الهيكل",              es: "Carrocería",              zh: "车身" },
  "part.ECLAIRAGE":            { fr: "Éclairage",              en: "Lighting",                ar: "الإضاءة",             es: "Iluminación",             zh: "灯光" },
  "part.REFROIDISSEMENT":      { fr: "Refroidissement",        en: "Cooling",                 ar: "التبريد",             es: "Refrigeración",           zh: "冷却系统" },
  "part.ECHAPPEMENT":          { fr: "Échappement",            en: "Exhaust",                 ar: "العادم",              es: "Escape",                  zh: "排气系统" },
  "part.FILTRES_ENTRETIEN":    { fr: "Filtres / entretien",    en: "Filters / servicing",     ar: "الفلاتر والصيانة",    es: "Filtros / mantenimiento", zh: "滤清器与保养" },
  "part.PNEUS_JANTES":         { fr: "Pneus / jantes",         en: "Tyres / wheels",          ar: "الإطارات والجنوط",    es: "Neumáticos / llantas",    zh: "轮胎与轮毂" },
  "part.INTERIEUR":            { fr: "Intérieur",              en: "Interior",                ar: "المقصورة الداخلية",   es: "Interior",                zh: "内饰" },
  "part.CLIMATISATION":        { fr: "Climatisation",          en: "Air conditioning",        ar: "التكييف",             es: "Aire acondicionado",      zh: "空调" },
  "part.ACCESSOIRES":          { fr: "Accessoires",            en: "Accessories",             ar: "الإكسسوارات",         es: "Accesorios",              zh: "配件" },
  "part.AUTRE":                { fr: "Autre",                  en: "Other",                   ar: "أخرى",                es: "Otro",                    zh: "其他" },
};
