import { z } from "zod";
import { ACTIVITIES, ENTITY_TYPES } from "../constants/partnerTaxonomy.js";

const password = z.string()
  .min(8, "Mot de passe : 8 caractères minimum")
  .max(128, "Mot de passe trop long");

// Email et téléphone sont mutuellement facultatifs — l'un des deux est requis
// (voir register() dans authController.js : inscription "email OU téléphone").
export const registerSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName:  z.string().min(1).max(100).trim(),
  email:     z.string().email("Email invalide").toLowerCase().trim().optional(),
  password,
  role:      z.enum(["client", "partenaire", "chauffeur"]).optional().default("client"),
  phone:     z.string().regex(/^\+?[0-9\s\-().]{7,20}$/, "Numéro de téléphone invalide").optional(),
  country:   z.string().length(2).optional(),
  // z.object() sans .passthrough() supprime silencieusement toute clé non
  // déclarée ici — birthDate et sellerType étaient absents malgré leur usage
  // dans register() (authController.js), qui ne les recevait donc jamais.
  // Pour birthDate en particulier : toute inscription échouait avec "Date de
  // naissance requise" depuis l'ajout de la vérification d'âge (2026-07-16).
  // Le format/la plage d'âge restent validés dans le controller, pas ici.
  birthDate: z.string().optional(),
  // sellerType : déprécié, toléré pour compat avec un éventuel vieux client —
  // activity/entityType (voir server/constants/partnerTaxonomy.js) sont le
  // nouveau couple canonique, requis côté controller si role==="partenaire".
  sellerType: z.enum(["particulier", "professionnel", "entreprise"]).optional(),
  activity:   z.enum(ACTIVITIES).optional(),
  entityType: z.enum(ENTITY_TYPES).optional(),
}).refine((data) => !!data.email || !!data.phone, {
  message: "Un email ou un numéro de téléphone est requis.",
  path:    ["email"],
});

// birthDate/country/role/sellerType ne sont envoyés que depuis Register.jsx
// (création de compte) — un appel depuis Login.jsx n'envoie que `credential`
// (voir oauthGoogle() dans authController.js pour la logique connexion vs
// inscription selon leur présence).
export const oauthGoogleSchema = z.object({
  credential: z.string().min(10, "Jeton Google invalide"),
  birthDate:  z.string().optional(),
  country:    z.string().length(2).optional(),
  role:       z.enum(["client", "partenaire"]).optional(),
  sellerType: z.enum(["particulier", "professionnel", "entreprise"]).optional(),
  activity:   z.enum(ACTIVITIES).optional(),
  entityType: z.enum(ENTITY_TYPES).optional(),
});

// identifier : email OU téléphone, saisi dans un champ unique (Login.jsx) — le
// controller détecte le type (présence d'un "@").
export const loginSchema = z.object({
  identifier: z.string().min(3, "Email ou téléphone requis").trim(),
  password:   z.string().min(1, "Mot de passe requis"),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(3, "Email ou téléphone requis").trim(),
});

// Deux chemins : par lien email (token) ou par OTP SMS (phone + otp) — voir
// resetPassword() dans authController.js.
export const resetPasswordSchema = z.object({
  token:    z.string().min(1).optional(),
  phone:    z.string().min(3).optional(),
  otp:      z.string().length(6).optional(),
  password,
}).refine((data) => !!data.token || (!!data.phone && !!data.otp), {
  message: "Token ou (téléphone + code OTP) requis.",
  path:    ["token"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     password,
});

export const verifyOtpSchema = z.object({
  userId: z.string().min(1),
  code:   z.string().length(6, "Code OTP à 6 chiffres"),
});

export const twoFAVerifySchema = z.object({
  userId: z.string().min(1),
  token:  z.string().length(6, "Code TOTP à 6 chiffres"),
});

export const twoFAEnableSchema = z.object({
  token: z.string().length(6, "Code TOTP à 6 chiffres requis pour activer"),
});

export const twoFADisableSchema = z.object({
  token:    z.string().length(6).optional(),
  password: z.string().min(1, "Mot de passe requis pour désactiver le 2FA"),
});
