import { z } from "zod";

export const createBookingSchema = z.object({
  vehicleId:     z.string().min(1, "vehicleId requis"),
  startDate:     z.coerce.date(),
  endDate:       z.coerce.date(),
  pickupAddress: z.string().max(200).optional(),
  returnAddress: z.string().max(200).optional(),
  withDriver:    z.boolean().optional().default(false),
  driverId:      z.string().optional(),
  paymentMethod: z.enum(["card", "orange_money", "wave", "mtn", "moov", "cash", "virement", "applepay", "test"]),
  notes:         z.string().max(500).optional(),
}).refine((d) => d.endDate > d.startDate, {
  message: "La date de fin doit être après la date de début",
  path:    ["endDate"],
});

export const updateBookingStatusSchema = z.object({
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
  reason: z.string().max(500).optional(),
});

export const bookingQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(200).default(20),
  status:    z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
  sortBy:    z.enum(["createdAt", "updatedAt", "startDate", "montantTotal"]).default("createdAt"),
  order:     z.enum(["asc", "desc"]).default("desc"),
  startDate: z.coerce.date().optional(),
  endDate:   z.coerce.date().optional(),
});
