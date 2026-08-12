"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DocumentExtraction } from "@/lib/contracts/extraction";
import type {
  FieldResult,
  VerificationResult,
  VerificationStatus,
} from "@/lib/contracts/verification";

const MAX_COMBINED_BYTES = 3 * 1024 * 1024;

type LocalFile = {
  name: string;
  size: number;
  sample?: boolean;
  file?: File;
  previewUrl?: string;
};

type PreparedSample = {
  id: string;
  title: string;
  description: string;
  application: { path: string; name: string; type: string };
  front: { path: string; name: string; type: string };
  additional: Array<{ path: string; name: string; type: string }>;
};

type AnalysisResponse = {
  verification: VerificationResult;
  extraction: DocumentExtraction;
  metadata: { model: string; modelLatencyMs: number };
};

type ReviewerDecision = "approve" | "disapprove" | "manual_review";
type AnalysisState = "idle" | "analyzing" | "complete";

const preparedSamples: PreparedSample[] = [
  {
    id: "complete-match",
    title: "Complete match",
    description: "Everything on the application matches the label.",
    application: { path: "/samples/complete-match/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/complete-match/front-label.jpg", name: "civic-oak-front-label.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/complete-match/back-label.jpg", name: "civic-oak-back-label.jpg", type: "image/jpeg" }],
  },
  {
    id: "abv-mismatch",
    title: "Alcohol-content mismatch",
    description: "The alcohol content differs between the two documents.",
    application: { path: "/samples/abv-mismatch/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/abv-mismatch/front-label.jpg", name: "civic-oak-abv-mismatch-front.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/abv-mismatch/back-label.jpg", name: "civic-oak-back-label.jpg", type: "image/jpeg" }],
  },
  {
    id: "warning-mismatch",
    title: "Warning-text mismatch",
    description: "The government warning contains changed wording.",
    application: { path: "/samples/warning-mismatch/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/warning-mismatch/front-label.jpg", name: "civic-oak-front-label.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/warning-mismatch/back-label.jpg", name: "civic-oak-warning-mismatch-back.jpg", type: "image/jpeg" }],
  },
  {
    id: "needs-review",
    title: "Unreadable label",
    description: "The warning is too blurry for a confident comparison.",
    application: { path: "/samples/needs-review/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/needs-review/front-label.jpg", name: "civic-oak-front-label.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/needs-review/back-label.jpg", name: "civic-oak-unreadable-warning-back.jpg", type: "image/jpeg" }],
  },
];

const decisionOptions: Array<{
  value: ReviewerDecision;
  label: string;
  icon: string;
}> = [
  { value: "approve", label: "Approve", icon: "✓" },
  { value: "disapprove", label: "Disapprove", icon: "×" },
  { value: "manual_review", label: "Manual Review", icon: "?" },
];

function recommendedDecision(status: VerificationStatus): ReviewerDecision {
  if (status === "pass") return "approve";
  if (status === "mismatch") return "disapprove";
  return "manual_review";
}

function machineStatus(status: VerificationStatus) {
  if (status === "pass") return "MATCHED";
  if (status === "mismatch") return "MISMATCH";
  return "NEEDS REVIEW";
}

function statusLabel(status: VerificationStatus) {
  if (status === "pass") return "Match";
  if (status === "mismatch") return "Mismatch";
  return "Review";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-direction={direction}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function UploadIcon({ kind }: { kind: "application" | "label" }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {kind === "application" ? (
        <><path d="M9 4h9l5 5v19H9V4Z" /><path d="M18 4v6h5M12 16h8M12 21h8" /></>
      ) : (
        <><rect x="5" y="7" width="22" height="19" rx="3" /><circle cx="12" cy="14" r="2" /><path d="m8 23 6-6 4 4 3-3 3 5" /></>
      )}
    </svg>
  );
}

function OwlGuide({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className="owl-guide" data-compact={compact || undefined}>
      <div className="owl-bubble" role="status">{message}</div>
      <Image src="/owl.png" alt="LabelProof owl guide" width={compact ? 116 : 170} height={compact ? 116 : 170} priority />
    </div>
  );
}

function FileBadge({ file, onRemove }: { file: LocalFile; onRemove: () => void }) {
  return (
    <div className="file-badge">
      <span aria-hidden="true">✓</span>
      <div><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${file.name}`}>×</button>
    </div>
  );
}

function VerificationDetails({ fields }: { fields: FieldResult[] }) {
  return (
    <div className="verification-details">
      <div className="details-table" role="table" aria-label="Verification details">
        <div className="details-row details-row--head" role="row">
          <span role="columnheader">Field</span>
          <span role="columnheader">Application</span>
          <span role="columnheader">Label</span>
          <span role="columnheader">Result</span>
        </div>
        {fields.map((field) => (
          <div className="details-row" role="row" key={field.field} data-status={field.status}>
            <strong role="cell">{field.label}</strong>
            <span role="cell">{field.expected.displayValue ?? "Not found"}</span>
            <span role="cell">{field.detected.displayValue ?? "Not found"}</span>
            <em role="cell">{statusLabel(field.status)}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultScreen({ response, onReset }: { response: AnalysisResponse; onReset: () => void }) {
  const status = response.verification.overallStatus;
  const recommendation = recommendedDecision(status);
  const [showDetails, setShowDetails] = useState(false);
  const [decision, setDecision] = useState<ReviewerDecision | null>(null);
  const targetIndex = decisionOptions.findIndex((option) => option.value === recommendation);
  const targetX = [150, 450, 750][targetIndex];

  return (
    <main className="result-page">
      <div className="minimal-bar">
        <a className="simple-logo" href="#" onClick={(event) => { event.preventDefault(); onReset(); }}>
          <span>LP</span><strong>LabelProof</strong>
        </a>
        <button type="button" onClick={onReset}>Compare another label</button>
      </div>

      <section className="machine-card" data-status={status} aria-labelledby="machine-result-title">
        <p>Comparison result</p>
        <div className="machine-status-icon" aria-hidden="true">{status === "pass" ? "✓" : status === "mismatch" ? "×" : "?"}</div>
        <h1 id="machine-result-title">{machineStatus(status)}</h1>
        <button className="details-toggle" type="button" onClick={() => setShowDetails((current) => !current)} aria-expanded={showDetails}>
          {showDetails ? "Hide verification details" : "View verification details"}
          <span aria-hidden="true">{showDetails ? "−" : "+"}</span>
        </button>
        {showDetails ? <VerificationDetails fields={response.verification.fields} /> : null}
      </section>

      <section className="routing-card" aria-labelledby="routing-title">
        <h2 id="routing-title">Choose where this application goes</h2>
        <div className="routing-visual" data-target={recommendation}>
          <OwlGuide message="Make a decision" compact />
          <svg viewBox="0 0 900 110" preserveAspectRatio="none" aria-hidden="true">
            <path d={`M450 0 V36 Q450 64 ${targetX} 105`} pathLength="1" />
          </svg>
        </div>
        <div className="decision-grid">
          {decisionOptions.map((option) => {
            const isRecommended = option.value === recommendation;
            const isSelected = option.value === decision;
            return (
              <button
                key={option.value}
                type="button"
                className="decision-choice"
                data-recommended={isRecommended || undefined}
                data-selected={isSelected || undefined}
                aria-pressed={isSelected}
                onClick={() => setDecision(option.value)}
              >
                {isRecommended ? <small>Recommended</small> : <small>&nbsp;</small>}
                <span aria-hidden="true">{option.icon}</span>
                <strong>{option.label}</strong>
              </button>
            );
          })}
        </div>
        <div className="decision-feedback" aria-live="polite">
          {decision ? <><span>✓</span> {decisionOptions.find((option) => option.value === decision)?.label} selected</> : "Select one choice to continue"}
        </div>
      </section>
    </main>
  );
}

export function ReviewWorkspace() {
  const [application, setApplication] = useState<LocalFile | null>(null);
  const [frontLabel, setFrontLabel] = useState<LocalFile | null>(null);
  const [additionalLabels, setAdditionalLabels] = useState<LocalFile[]>([]);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  const resultTopRef = useRef<HTMLDivElement>(null);

  const sample = preparedSamples[sampleIndex];
  const combinedBytes = useMemo(
    () => (application?.size ?? 0) + (frontLabel?.size ?? 0) + additionalLabels.reduce((sum, file) => sum + file.size, 0),
    [application, frontLabel, additionalLabels],
  );
  const ready = application !== null && frontLabel !== null;
  const owlMessage = !application
    ? "Upload application"
    : !frontLabel
      ? "Application received! Now upload label"
      : "All set! Compare documents";

  useEffect(() => {
    if (analysisState === "complete") {
      window.setTimeout(() => resultTopRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [analysisState]);

  function releasePreview(file: LocalFile | null) {
    if (file?.previewUrl && !file.sample) URL.revokeObjectURL(file.previewUrl);
  }

  function clearFiles() {
    releasePreview(application);
    releasePreview(frontLabel);
    additionalLabels.forEach(releasePreview);
    setApplication(null);
    setFrontLabel(null);
    setAdditionalLabels([]);
  }

  function resetReview() {
    clearFiles();
    setSelectedSample(null);
    setAnalysisResult(null);
    setAnalysisState("idle");
    setError(null);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSample(index: number) {
    setSampleIndex((index + preparedSamples.length) % preparedSamples.length);
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(distance) > 45) showSample(sampleIndex + (distance < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  async function loadSampleFile(asset: { path: string; name: string; type: string }): Promise<LocalFile> {
    const response = await fetch(asset.path);
    if (!response.ok) throw new Error("This sample could not be loaded.");
    const blob = await response.blob();
    const file = new File([blob], asset.name, { type: asset.type });
    return { name: file.name, size: file.size, sample: true, file, previewUrl: asset.path };
  }

  async function chooseSample() {
    setSampleLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [sampleApplication, sampleFront, ...sampleAdditional] = await Promise.all([
        loadSampleFile(sample.application),
        loadSampleFile(sample.front),
        ...sample.additional.map(loadSampleFile),
      ]);
      clearFiles();
      setApplication(sampleApplication);
      setFrontLabel(sampleFront);
      setAdditionalLabels(sampleAdditional);
      setSelectedSample(sample.id);
      setMessage(`${sample.title} is ready.`);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "This sample could not be loaded.");
    } finally {
      setSampleLoading(false);
    }
  }

  function setApplicationFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF application.");
      return;
    }
    if (file.size + (frontLabel?.size ?? 0) + additionalLabels.reduce((sum, item) => sum + item.size, 0) > MAX_COMBINED_BYTES) {
      setError("Please keep all files under 3 MB total.");
      return;
    }
    releasePreview(application);
    setApplication({ name: file.name, size: file.size, file, previewUrl: URL.createObjectURL(file) });
    setSelectedSample(null);
    setError(null);
    setMessage("Application received!");
  }

  function setLabelFiles(files: FileList | null) {
    if (!files?.length) return;
    const chosen = Array.from(files).slice(0, 3);
    if (chosen.some((file) => !["image/jpeg", "image/png"].includes(file.type))) {
      setError("Please choose PNG or JPEG label images.");
      return;
    }
    const total = (application?.size ?? 0) + chosen.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_COMBINED_BYTES) {
      setError("Please keep all files under 3 MB total.");
      return;
    }
    releasePreview(frontLabel);
    additionalLabels.forEach(releasePreview);
    const mapped = chosen.map((file) => ({ name: file.name, size: file.size, file, previewUrl: URL.createObjectURL(file) }));
    setFrontLabel(mapped[0]);
    setAdditionalLabels(mapped.slice(1));
    setSelectedSample(null);
    setError(null);
    setMessage("Label artwork received!");
  }

  async function analyzeLabel() {
    if (!ready || !application?.file || !frontLabel?.file) return;
    const formData = new FormData();
    formData.append("application", application.file);
    formData.append("frontLabel", frontLabel.file);
    additionalLabels.forEach((label) => { if (label.file) formData.append("additionalLabel", label.file); });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 32_000);
    setAnalysisState("analyzing");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", body: formData, signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "The comparison could not be completed.");
      setAnalysisResult(payload as AnalysisResponse);
      setAnalysisState("complete");
    } catch (analysisError) {
      setAnalysisState("idle");
      setError(
        analysisError instanceof DOMException && analysisError.name === "AbortError"
          ? "The comparison took too long. Try smaller or clearer images."
          : analysisError instanceof Error ? analysisError.message : "The comparison could not be completed.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (analysisState === "complete" && analysisResult) {
    return <div ref={resultTopRef}><ResultScreen response={analysisResult} onReset={resetReview} /></div>;
  }

  return (
    <div className="submit-page">
      <header className="minimal-bar">
        <div className="simple-logo"><span>LP</span><strong>LabelProof</strong></div>
        <small>Alcohol label comparison</small>
      </header>

      <main className="submit-main">
        <section className="sample-section" aria-labelledby="sample-title">
          <OwlGuide message="Try a sample" />
          <div
            className="sample-carousel"
            onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
            onTouchEnd={handleTouchEnd}
          >
            <button className="carousel-arrow carousel-arrow--left" type="button" onClick={() => showSample(sampleIndex - 1)} aria-label="Previous sample"><ArrowIcon direction="left" /></button>
            <div className="sample-slide" key={sample.id}>
              <div className="sample-art" aria-hidden="true">
                <Image src={sample.front.path} alt="" width={126} height={170} />
                <Image src={sample.additional[0].path} alt="" width={108} height={146} />
              </div>
              <div className="sample-copy">
                <small>Sample {sampleIndex + 1} of {preparedSamples.length}</small>
                <h1 id="sample-title">{sample.title}</h1>
                <p>{sample.description}</p>
                <button className="sample-use" type="button" onClick={chooseSample} disabled={sampleLoading}>
                  {sampleLoading ? "Loading…" : selectedSample === sample.id ? "Sample ready ✓" : "Use this sample"}
                </button>
              </div>
            </div>
            <button className="carousel-arrow carousel-arrow--right" type="button" onClick={() => showSample(sampleIndex + 1)} aria-label="Next sample"><ArrowIcon /></button>
            <div className="carousel-dots" aria-label="Choose a sample">
              {preparedSamples.map((item, index) => <button key={item.id} type="button" aria-label={`Show ${item.title}`} aria-current={sampleIndex === index ? "true" : undefined} onClick={() => showSample(index)} />)}
            </div>
          </div>
        </section>

        <section className="upload-panel" aria-labelledby="upload-title">
          <div className="upload-guide"><OwlGuide message={owlMessage} /></div>
          <div className="upload-content">
            <h2 id="upload-title">Compare your documents</h2>
            <div className="upload-targets">
              <div className="upload-target" data-ready={application ? true : undefined}>
                {application ? (
                  <FileBadge file={application} onRemove={() => { releasePreview(application); setApplication(null); setSelectedSample(null); setMessage(null); }} />
                ) : (
                  <label>
                    <UploadIcon kind="application" />
                    <strong>Application</strong>
                    <span>Choose PDF</span>
                    <input type="file" accept="application/pdf,.pdf" onChange={(event) => setApplicationFile(event.target.files?.[0])} />
                  </label>
                )}
              </div>
              <div className="upload-target" data-ready={frontLabel ? true : undefined}>
                {frontLabel ? (
                  <div className="label-files">
                    <FileBadge file={frontLabel} onRemove={() => { releasePreview(frontLabel); setFrontLabel(null); setSelectedSample(null); setMessage(null); }} />
                    {additionalLabels.map((file, index) => <FileBadge key={`${file.name}-${index}`} file={file} onRemove={() => { releasePreview(file); setAdditionalLabels((current) => current.filter((_, itemIndex) => itemIndex !== index)); setSelectedSample(null); }} />)}
                  </div>
                ) : (
                  <label>
                    <UploadIcon kind="label" />
                    <strong>Label artwork</strong>
                    <span>Choose PNG or JPEG</span>
                    <input type="file" multiple accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => setLabelFiles(event.target.files)} />
                  </label>
                )}
              </div>
            </div>
            <div className="upload-feedback" aria-live="polite">
              {error ? <span className="upload-error">{error}</span> : message ? <span className="upload-success">✓ {message}</span> : <span>{formatBytes(combinedBytes)} of 3 MB</span>}
            </div>
            <button className="compare-button" type="button" disabled={!ready || analysisState === "analyzing"} onClick={analyzeLabel}>
              {analysisState === "analyzing" ? <><span className="compare-spinner" /> Comparing documents…</> : <>Compare documents <ArrowIcon /></>}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
