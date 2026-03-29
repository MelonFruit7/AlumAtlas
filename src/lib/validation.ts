import { z } from "zod";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const createGroupSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters.")
    .max(120, "Title cannot exceed 120 characters."),
  description: z.string().trim().max(500).optional().default(""),
  adminPassword: z
    .string()
    .min(8, "Admin password must be at least 8 characters.")
    .max(200),
});

export const createEntrySchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(120),
  linkedinUrl: z.string().trim().min(8).max(500),
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters.")
    .max(120),
  companyDomain: z.string().trim().min(3).max(255),
  companyLogoUrl: z.string().url().optional(),
  locationText: z
    .string()
    .trim()
    .min(2, "Location must be at least 2 characters.")
    .max(200),
  profilePhotoUrl: z.string().url().optional(),
  deviceToken: z.string().trim().min(8).max(200),
});

export const photoUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.enum(ALLOWED_IMAGE_TYPES),
  fileSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

export const adminLoginSchema = z.object({
  password: z.string().trim().min(1).max(200),
});

export const adminEntrySchema = createEntrySchema.omit({
  deviceToken: true,
});

export const adminSettingsSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    submissionsLocked: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.submissionsLocked !== undefined,
    {
      message: "At least one setting must be provided.",
    },
  );

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type PhotoUploadRequestInput = z.infer<typeof photoUploadRequestSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminEntryInput = z.infer<typeof adminEntrySchema>;
export type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;

export function parseBBox(raw: string | null): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
} | null {
  if (!raw) {
    return null;
  }

  const values = raw
    .split(",")
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 4) {
    return null;
  }

  const [minLng, minLat, maxLng, maxLat] = values;
  return { minLng, minLat, maxLng, maxLat };
}
