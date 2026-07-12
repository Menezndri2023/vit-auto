import { z } from "zod";

const password = z.string()
  .min(8, "Mot de passe : 8 caractères minimum")
  .max(128, "Mot de passe trop long");

// Email et téléphone sont mutuellement facultatifs — l'un des deux est requis
// (voir register() dans authController.js : inscription "email OU téléphone").
export const registerSchema = z.object({
  firstName: z.string().min(1).max(50).trim(),
  lastName:  z.string().min(1).max(50).trim(),
  email:     z.string().email("Email invalide").toLowerCase().trim().optional(),
  password,
  role:      z.enum(["client", "partenaire", "chauffeur"]).optional().default("client"),
  phone:     z.string().regex(/^\+?[0-9\s\-().]{7,20}$/, "Numéro de téléphone invalide").optional(),
  country:   z.string().length(2).optional(),
}).refine((data) => !!data.email || !!data.phone, {
  message: "Un email ou un numéro de téléphone est requis.",
  path:    ["email"],
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
