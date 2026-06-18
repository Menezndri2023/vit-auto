/**
 * Traductions VIT AUTO — FR / EN / AR
 * Structure plate : clé → valeur string (ou fonction pour les interpolations)
 */

const translations = {

  // ─── Navigation ──────────────────────────────────────────────────────────
  "nav.home":        { fr: "Accueil",       en: "Home",        ar: "الرئيسية"        },
  "nav.catalogue":   { fr: "Catalogue",     en: "Catalogue",   ar: "الفهرس"          },
  "nav.services":    { fr: "Services",      en: "Services",    ar: "الخدمات"         },
  "nav.publish":     { fr: "Publier",       en: "Publish",     ar: "نشر"             },
  "nav.mySpace":     { fr: "Mon espace",    en: "My Space",    ar: "فضائي"           },
  "nav.plans":       { fr: "Tarifs",        en: "Pricing",     ar: "الأسعار"         },
  "nav.dashboard":   { fr: "Tableau de bord", en: "Dashboard", ar: "لوحة التحكم"    },
  "nav.profile":     { fr: "Profil",        en: "Profile",     ar: "الملف الشخصي"    },
  "nav.login":       { fr: "Connexion",     en: "Sign In",     ar: "تسجيل الدخول"    },
  "nav.register":    { fr: "Inscription",   en: "Sign Up",     ar: "إنشاء حساب"      },
  "nav.logout":      { fr: "Déconnexion",   en: "Sign Out",    ar: "تسجيل الخروج"    },
  "nav.help":        { fr: "Centre d'aide", en: "Help Center", ar: "مركز المساعدة"   },
  "nav.becomePartner": { fr: "Devenez partenaire", en: "Become a Partner", ar: "كن شريكاً" },

  // ─── Hero ─────────────────────────────────────────────────────────────────
  "hero.title":      { fr: "La plateforme automobile internationale", en: "The International Car Platform", ar: "المنصة الدولية للسيارات" },
  "hero.subtitle":   { fr: "Location, vente et leasing dans plusieurs pays", en: "Car rental, sales & leasing across multiple countries", ar: "تأجير وبيع السيارات في عدة دول" },
  "hero.cta.rent":   { fr: "Louer maintenant",   en: "Rent Now",   ar: "استأجر الآن"   },
  "hero.cta.buy":    { fr: "Acheter un véhicule", en: "Buy a Car",  ar: "اشترِ سيارة"  },

  // ─── Catalogue ────────────────────────────────────────────────────────────
  "catalogue.title":     { fr: "Catalogue",             en: "Catalogue",           ar: "الفهرس"         },
  "catalogue.all":       { fr: "Tous",                  en: "All",                 ar: "الكل"           },
  "catalogue.rent":      { fr: "Location",              en: "For Rent",            ar: "للإيجار"        },
  "catalogue.sale":      { fr: "Vente",                 en: "For Sale",            ar: "للبيع"          },
  "catalogue.noResult":  { fr: "Aucun véhicule trouvé", en: "No vehicle found",    ar: "لا توجد نتائج"  },
  "catalogue.search":    { fr: "Rechercher...",         en: "Search...",           ar: "بحث..."         },

  // ─── Véhicule / Card ─────────────────────────────────────────────────────
  "vehicle.perDay":     { fr: "/ jour",          en: "/ day",          ar: "/ يوم"           },
  "vehicle.available":  { fr: "Disponible",      en: "Available",      ar: "متاح"            },
  "vehicle.reserved":   { fr: "Réservé",         en: "Reserved",       ar: "محجوز"           },
  "vehicle.details":    { fr: "Détails",         en: "Details",        ar: "التفاصيل"        },
  "vehicle.book":       { fr: "Réserver",        en: "Book Now",       ar: "احجز الآن"       },
  "vehicle.testDrive":  { fr: "Essai gratuit",   en: "Free Test Drive", ar: "تجربة مجانية"  },
  "vehicle.purchase":   { fr: "Achat",           en: "Purchase",       ar: "الشراء"          },
  "vehicle.seats":      { fr: "places",          en: "seats",          ar: "مقاعد"           },

  // ─── Réservation ─────────────────────────────────────────────────────────
  "booking.title":      { fr: "Réservez votre véhicule",   en: "Book your vehicle",    ar: "احجز سيارتك"     },
  "booking.trial":      { fr: "Demander un essai",         en: "Request a Test Drive", ar: "طلب تجربة قيادة" },
  "booking.step1":      { fr: "1. Réservation",            en: "1. Booking",           ar: "١. الحجز"         },
  "booking.step2":      { fr: "2. Vérification",           en: "2. Verification",      ar: "٢. التحقق"        },
  "booking.step3":      { fr: "3. Paiement",               en: "3. Payment",           ar: "٣. الدفع"         },
  "booking.delivery":   { fr: "Livraison à domicile",      en: "Home Delivery",        ar: "توصيل للمنزل"    },
  "booking.pickup":     { fr: "Retrait en agence",         en: "Agency Pickup",        ar: "الاستلام من الوكالة" },
  "booking.distance":   { fr: "Distance",                  en: "Distance",             ar: "المسافة"         },
  "booking.deliveryFee":{ fr: "Frais de livraison",        en: "Delivery Fee",         ar: "رسوم التوصيل"    },
  "booking.calculating":{ fr: "Calcul en cours…",          en: "Calculating…",         ar: "جاري الحساب..."  },
  "booking.gpsDetect":  { fr: "Détecter ma position GPS",  en: "Detect my GPS position", ar: "تحديد موقعي"  },

  // ─── Paiement ─────────────────────────────────────────────────────────────
  "payment.title":      { fr: "Paiement",            en: "Payment",             ar: "الدفع"            },
  "payment.method":     { fr: "Méthode de paiement", en: "Payment Method",      ar: "طريقة الدفع"      },
  "payment.total":      { fr: "Total à payer",       en: "Total to Pay",        ar: "المبلغ الإجمالي"  },
  "payment.confirm":    { fr: "Confirmer le paiement", en: "Confirm Payment",   ar: "تأكيد الدفع"      },
  "payment.success":    { fr: "Paiement réussi",     en: "Payment Successful",  ar: "تم الدفع بنجاح"   },

  // ─── Auth ─────────────────────────────────────────────────────────────────
  "auth.email":         { fr: "Adresse e-mail",  en: "Email address",    ar: "البريد الإلكتروني" },
  "auth.password":      { fr: "Mot de passe",    en: "Password",         ar: "كلمة المرور"       },
  "auth.firstName":     { fr: "Prénom",          en: "First Name",       ar: "الاسم الأول"       },
  "auth.lastName":      { fr: "Nom",             en: "Last Name",        ar: "اسم العائلة"       },
  "auth.phone":         { fr: "Téléphone",       en: "Phone",            ar: "الهاتف"            },
  "auth.country":       { fr: "Pays",            en: "Country",          ar: "الدولة"            },
  "auth.partnerType":   { fr: "Type de partenaire", en: "Partner Type",  ar: "نوع الشريك"        },
  "auth.loginBtn":      { fr: "Se connecter",    en: "Sign In",          ar: "تسجيل الدخول"      },
  "auth.registerBtn":   { fr: "S'inscrire",      en: "Sign Up",          ar: "إنشاء حساب"        },
  "auth.forgotPwd":     { fr: "Mot de passe oublié ?", en: "Forgot password?", ar: "نسيت كلمة المرور؟" },

  // ─── Types de partenaire ──────────────────────────────────────────────────
  "partner.agency":     { fr: "Agence de location",    en: "Car Rental Agency", ar: "وكالة تأجير سيارات" },
  "partner.dealer":     { fr: "Concessionnaire",        en: "Car Dealer",        ar: "تاجر سيارات"        },
  "partner.individual": { fr: "Particulier",            en: "Individual",        ar: "فرد"                 },
  "partner.fleet":      { fr: "Gestionnaire de flotte", en: "Fleet Manager",     ar: "مدير أسطول"         },
  "partner.leasing_co": { fr: "Société de leasing",    en: "Leasing Company",   ar: "شركة تمويل"         },

  // ─── Général ──────────────────────────────────────────────────────────────
  "common.save":        { fr: "Enregistrer",    en: "Save",       ar: "حفظ"      },
  "common.cancel":      { fr: "Annuler",        en: "Cancel",     ar: "إلغاء"    },
  "common.confirm":     { fr: "Confirmer",      en: "Confirm",    ar: "تأكيد"    },
  "common.loading":     { fr: "Chargement…",   en: "Loading…",   ar: "تحميل..."  },
  "common.error":       { fr: "Erreur",         en: "Error",      ar: "خطأ"      },
  "common.success":     { fr: "Succès",         en: "Success",    ar: "نجح"      },
  "common.back":        { fr: "Retour",         en: "Back",       ar: "رجوع"     },
  "common.next":        { fr: "Suivant",        en: "Next",       ar: "التالي"   },
  "common.close":       { fr: "Fermer",         en: "Close",      ar: "إغلاق"   },
  "common.km":          { fr: "km",             en: "km",         ar: "كم"       },
  "common.selectCountry": { fr: "Choisir un pays", en: "Select a country", ar: "اختر دولة" },
  "common.selectLang":  { fr: "Langue",         en: "Language",   ar: "اللغة"    },
};

export default translations;
