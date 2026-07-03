import { z } from "zod";

const CURRENCIES = ["XOF", "EUR", "USD", "GHS", "NGN", "MAD", "DZD", "EGP"];
const VEHICLE_TYPES = ["sedan", "suv", "pickup", "van", "bus", "truck", "moto", "autre"];
const FUEL_TYPES = ["essence", "diesel", "electrique", "hybride", "gpl"];
const TRANSMISSION = ["manuelle", "automatique"];

export const createVehicleSchema = z.object({
  make:         z.string().min(1).max(60).trim(),
  model:        z.string().min(1).max(60).trim(),
  year:         z.number().int().min(1950).max(new Date().getFullYear() + 1),
  type:         z.enum(VEHICLE_TYPES),
  fuel:         z.enum(FUEL_TYPES).optional(),
  transmission: z.enum(TRANSMISSION).optional(),
  mileage:      z.number().int().min(0).optional(),
  color:        z.string().max(30).optional(),
  seats:        z.number().int().min(1).max(100).optional(),
  price:        z.number().positive("Prix doit être positif"),
  currency:     z.enum(CURRENCIES).default("XOF"),
  listingType:  z.enum(["sale", "rental", "both"]).default("rental"),
  description:  z.string().max(2000).optional(),
  country:      z.string().length(2).optional(),
  city:         z.string().max(100).optional(),
  images:       z.array(z.string()).max(10).optional(),
  features:     z.array(z.string().max(50)).max(20).optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  reason: z.string().max(500).optional(),
});

export const vehicleQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  type:      z.enum(VEHICLE_TYPES).optional(),
  fuel:      z.enum(FUEL_TYPES).optional(),
  minPrice:  z.coerce.number().min(0).optional(),
  maxPrice:  z.coerce.number().min(0).optional(),
  currency:  z.enum(CURRENCIES).optional(),
  country:   z.string().length(2).optional(),
  city:      z.string().max(100).optional(),
  search:    z.string().max(100).optional(),
  sortBy:    z.enum(["createdAt", "price", "year", "mileage"]).default("createdAt"),
  order:     z.enum(["asc", "desc"]).default("desc"),
});
