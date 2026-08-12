import { z } from "zod";

import {
  applicationSourceSchema,
  labelSourceSchema,
} from "./extraction";

export const verificationStatusSchema = z.enum([
  "pass",
  "mismatch",
  "needs_review",
]);

export const verificationFieldSchema = z.enum([
  "brand_name",
  "class_type",
  "alcohol_by_volume",
  "proof",
  "net_contents",
  "government_warning_heading",
  "government_warning_body",
]);

const expectedEvidenceSchema = z
  .object({
    verbatimText: z.string(),
    source: applicationSourceSchema.exclude(["none"]),
  })
  .strict();

const detectedEvidenceSchema = z
  .object({
    verbatimText: z.string(),
    source: labelSourceSchema.exclude(["none"]),
  })
  .strict();

export const expectedValueSchema = z
  .object({
    displayValue: z.string().nullable(),
    evidence: expectedEvidenceSchema.nullable(),
  })
  .strict();

export const detectedValueSchema = z
  .object({
    displayValue: z.string().nullable(),
    evidence: detectedEvidenceSchema.nullable(),
  })
  .strict();

export const fieldResultSchema = z
  .object({
    field: verificationFieldSchema,
    label: z.string().min(1),
    expected: expectedValueSchema,
    detected: detectedValueSchema,
    status: verificationStatusSchema,
    explanation: z.string().min(1),
  })
  .strict();

export const verificationSummarySchema = z
  .object({
    passCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    needsReviewCount: z.number().int().nonnegative(),
  })
  .strict();

export const verificationResultSchema = z
  .object({
    overallStatus: verificationStatusSchema,
    summary: verificationSummarySchema,
    fields: z.array(fieldResultSchema).min(1),
    processingTimeMs: z.number().nonnegative(),
  })
  .strict();

export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type VerificationField = z.infer<typeof verificationFieldSchema>;
export type FieldResult = z.infer<typeof fieldResultSchema>;
export type VerificationSummary = z.infer<typeof verificationSummarySchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
