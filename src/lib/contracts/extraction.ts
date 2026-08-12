import { z } from "zod";

export const readabilitySchema = z.enum([
  "clear",
  "uncertain",
  "not_found",
]);

export const beverageCategorySchema = z.enum([
  "beer",
  "wine",
  "distilled_spirits",
]);

export const applicationSourceSchema = z.enum([
  "application_pdf",
  "reviewer_input",
  "none",
]);

export const labelSourceSchema = z.enum([
  "front_label",
  "back_label",
  "additional_label",
  "none",
]);

export const quantitySchema = z
  .object({
    amount: z.number().nonnegative(),
    unit: z.string().min(1),
  })
  .strict();

function extractedFieldSchema<
  TValue extends z.ZodType,
  TSource extends z.ZodType,
>(valueSchema: TValue, sourceSchema: TSource) {
  return z
    .object({
      value: valueSchema.nullable(),
      verbatimText: z.string().nullable(),
      readability: readabilitySchema,
      source: sourceSchema,
    })
    .strict();
}

const applicationTextFieldSchema = extractedFieldSchema(
  z.string(),
  applicationSourceSchema,
);
const applicationNumberFieldSchema = extractedFieldSchema(
  z.number(),
  applicationSourceSchema,
);

const labelTextFieldSchema = extractedFieldSchema(
  z.string(),
  labelSourceSchema,
);
const labelNumberFieldSchema = extractedFieldSchema(
  z.number(),
  labelSourceSchema,
);

export const applicationObservationSchema = z
  .object({
    beverageCategory: extractedFieldSchema(
      beverageCategorySchema,
      applicationSourceSchema,
    ),
    brandName: applicationTextFieldSchema,
    fancifulName: applicationTextFieldSchema,
    classType: applicationTextFieldSchema,
    alcoholByVolume: applicationNumberFieldSchema,
    proof: applicationNumberFieldSchema,
    netContents: extractedFieldSchema(quantitySchema, applicationSourceSchema),
  })
  .strict();

export const labelObservationSchema = z
  .object({
    brandName: labelTextFieldSchema,
    fancifulName: labelTextFieldSchema,
    classType: labelTextFieldSchema,
    alcoholByVolume: labelNumberFieldSchema,
    proof: labelNumberFieldSchema,
    netContents: extractedFieldSchema(quantitySchema, labelSourceSchema),
    governmentWarningHeading: labelTextFieldSchema,
    governmentWarningBody: labelTextFieldSchema,
  })
  .strict();

export const documentExtractionSchema = z
  .object({
    application: applicationObservationSchema,
    label: labelObservationSchema,
  })
  .strict();

export type Readability = z.infer<typeof readabilitySchema>;
export type BeverageCategory = z.infer<typeof beverageCategorySchema>;
export type ApplicationObservation = z.infer<
  typeof applicationObservationSchema
>;
export type LabelObservation = z.infer<typeof labelObservationSchema>;
export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;
