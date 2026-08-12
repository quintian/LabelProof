"use client";

import { useState } from "react";

import type {
  ApplicationObservation,
  BeverageCategory,
  DocumentExtraction,
} from "@/lib/contracts/extraction";

type FormValues = {
  beverageCategory: BeverageCategory;
  brandName: string;
  fancifulName: string;
  classType: string;
  alcoholByVolume: string;
  proof: string;
  netContentsAmount: string;
  netContentsUnit: string;
};

type TextField = ApplicationObservation["brandName"];
type NumberField = ApplicationObservation["alcoholByVolume"];
type QuantityField = ApplicationObservation["netContents"];

function initialValues(extraction: DocumentExtraction): FormValues {
  const application = extraction.application;
  return {
    beverageCategory: application.beverageCategory.value ?? "distilled_spirits",
    brandName: application.brandName.value ?? "",
    fancifulName: application.fancifulName.value ?? "",
    classType: application.classType.value ?? "",
    alcoholByVolume: application.alcoholByVolume.value?.toString() ?? "",
    proof: application.proof.value?.toString() ?? "",
    netContentsAmount: application.netContents.value?.amount.toString() ?? "",
    netContentsUnit: application.netContents.value?.unit ?? "mL",
  };
}

function reviewedTextField(original: TextField, value: string): TextField {
  const trimmed = value.trim();
  if (trimmed === (original.value ?? "")) return original;
  if (!trimmed) {
    return { value: null, verbatimText: null, readability: "not_found", source: "none" };
  }
  return {
    value: trimmed,
    verbatimText: trimmed,
    readability: "clear",
    source: "reviewer_input",
  };
}

function reviewedNumberField(
  original: NumberField,
  value: string,
): NumberField {
  const parsed = value.trim() === "" ? null : Number(value);
  if (parsed === original.value) return original;
  if (parsed === null) {
    return { value: null, verbatimText: null, readability: "not_found", source: "none" };
  }
  return {
    value: parsed,
    verbatimText: value.trim(),
    readability: "clear",
    source: "reviewer_input",
  };
}

function reviewedQuantityField(
  original: QuantityField,
  amount: string,
  unit: string,
): QuantityField {
  const parsedAmount = Number(amount);
  if (
    original.value?.amount === parsedAmount &&
    original.value?.unit === unit
  ) {
    return original;
  }
  return {
    value: { amount: parsedAmount, unit },
    verbatimText: `${amount.trim()} ${unit}`,
    readability: "clear",
    source: "reviewer_input",
  };
}

function sourceLabel(source: TextField["source"]) {
  return source === "application_pdf"
    ? "Extracted from PDF"
    : source === "reviewer_input"
      ? "Reviewer corrected"
      : "Not found";
}

export function ApplicationReview({
  extraction,
  loading,
  onConfirm,
  onBack,
}: {
  extraction: DocumentExtraction;
  loading: boolean;
  onConfirm: (reviewed: DocumentExtraction) => void;
  onBack: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => initialValues(extraction));
  const [validationError, setValidationError] = useState<string | null>(null);

  function setValue<TKey extends keyof FormValues>(key: TKey, value: FormValues[TKey]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const abv = Number(values.alcoholByVolume);
    const proof = values.proof.trim() === "" ? null : Number(values.proof);
    const amount = Number(values.netContentsAmount);

    if (!values.brandName.trim() || !values.classType.trim()) {
      setValidationError("Brand name and class/type are required before comparison.");
      return;
    }
    if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
      setValidationError("Alcohol by volume must be a number from 0 to 100.");
      return;
    }
    if (proof !== null && (!Number.isFinite(proof) || proof < 0 || proof > 200)) {
      setValidationError("Proof must be blank or a number from 0 to 200.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError("Net contents must be greater than zero.");
      return;
    }

    const original = extraction.application;
    const reviewedCategory =
      values.beverageCategory === original.beverageCategory.value
        ? original.beverageCategory
        : {
            value: values.beverageCategory,
            verbatimText: values.beverageCategory,
            readability: "clear" as const,
            source: "reviewer_input" as const,
          };

    setValidationError(null);
    onConfirm({
      ...extraction,
      application: {
        beverageCategory: reviewedCategory,
        brandName: reviewedTextField(original.brandName, values.brandName),
        fancifulName: reviewedTextField(original.fancifulName, values.fancifulName),
        classType: reviewedTextField(original.classType, values.classType),
        alcoholByVolume: reviewedNumberField(
          original.alcoholByVolume,
          values.alcoholByVolume,
        ),
        proof: reviewedNumberField(original.proof, values.proof),
        netContents: reviewedQuantityField(
          original.netContents,
          values.netContentsAmount,
          values.netContentsUnit,
        ),
      },
    });
  }

  const original = extraction.application;

  return (
    <section className="application-review" aria-labelledby="application-review-title">
      <div className="application-review__intro">
        <div>
          <p className="section-kicker">Reviewer checkpoint</p>
          <h2 id="application-review-title">Confirm application values</h2>
          <p>AI drafted these values from the PDF. Correct anything that was read incorrectly before comparing it with the label.</p>
        </div>
        <div className="human-check-badge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M6.5 20v-2.2A5.5 5.5 0 0 1 12 12.3a5.5 5.5 0 0 1 5.5 5.5V20M18 8.5l1.3 1.3L22 7" /></svg>
          Human confirmation required
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="application-form-grid">
          <label>
            <span>Beverage category <small>{sourceLabel(original.beverageCategory.source)}</small></span>
            <select value={values.beverageCategory} onChange={(event) => setValue("beverageCategory", event.target.value as BeverageCategory)}>
              <option value="distilled_spirits">Distilled spirits</option>
              <option value="wine">Wine</option>
              <option value="beer">Beer / malt beverage</option>
            </select>
          </label>
          <label>
            <span>Brand name <small>{sourceLabel(original.brandName.source)}</small></span>
            <input value={values.brandName} onChange={(event) => setValue("brandName", event.target.value)} required />
          </label>
          <label>
            <span>Fanciful name <small>Optional</small></span>
            <input value={values.fancifulName} onChange={(event) => setValue("fancifulName", event.target.value)} />
          </label>
          <label className="wide-field">
            <span>Class/type designation <small>{sourceLabel(original.classType.source)}</small></span>
            <input value={values.classType} onChange={(event) => setValue("classType", event.target.value)} required />
          </label>
          <label>
            <span>Alcohol by volume <small>Percent</small></span>
            <div className="input-suffix"><input type="number" min="0" max="100" step="0.01" value={values.alcoholByVolume} onChange={(event) => setValue("alcoholByVolume", event.target.value)} required /><span>%</span></div>
          </label>
          <label>
            <span>Proof <small>Optional</small></span>
            <input type="number" min="0" max="200" step="0.1" value={values.proof} onChange={(event) => setValue("proof", event.target.value)} />
          </label>
          <label>
            <span>Net contents</span>
            <input type="number" min="0.01" step="0.01" value={values.netContentsAmount} onChange={(event) => setValue("netContentsAmount", event.target.value)} required />
          </label>
          <label>
            <span>Unit</span>
            <select value={values.netContentsUnit} onChange={(event) => setValue("netContentsUnit", event.target.value)}>
              <option value="mL">mL</option>
              <option value="cL">cL</option>
              <option value="L">L</option>
              <option value="fl oz">fl oz</option>
            </select>
          </label>
        </div>

        <div className="application-review__evidence">
          <strong>Original PDF evidence remains preserved</strong>
          <p>Any changed field will be marked “Reviewer corrected” in the final evidence rather than attributed to the AI.</p>
        </div>
        {validationError ? <p className="error-message">{validationError}</p> : null}
        <div className="application-review__actions">
          <button type="button" className="secondary-button" onClick={onBack} disabled={loading}>Back to files</button>
          <button type="submit" className="analyze-button" disabled={loading}>
            {loading ? "Comparing…" : "Confirm and compare"}
            {loading ? <span className="button-spinner" /> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" /></svg>}
          </button>
        </div>
      </form>
    </section>
  );
}
