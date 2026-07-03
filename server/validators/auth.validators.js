import { z } from "zod";

const password = z.string()
  .min(8, "Mot de passe : 8 caractères minimum")
  .max(128, "Mot de passe trop long");

export const registerSchema = z.object({
  firstName: z.string().min(1).max(50).trim(),
  lastName:  z.string().min(1).max(50).trim(),
  email:     z.string().email("Email invalide").toLowerCase().trim(),
  password,
  role:      z.enum(["client", "partenaire", "chauffeur"]).optional().default("client"),
  phone:     z.string().regex(/^\+?[0-9\s\-().]{7,20}$/, "Numéro de téléphone invalide").optional(),
  country:   z.string().length(2).optional(),
});

export const loginSchema = z.object({
  email:    z.string().email().toLowerCase().trim(),
  password: z.string().min(1, "Mot de passe requis"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token:    z.string().min(1),
  password,
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
