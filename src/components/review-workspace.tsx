"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
    title: "Alcohol content mismatch",
    description: "The alcohol content differs between the two documents.",
    application: { path: "/samples/abv-mismatch/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/abv-mismatch/front-label.jpg", name: "civic-oak-abv-mismatch-front.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/abv-mismatch/back-label.jpg", name: "civic-oak-back-label.jpg", type: "image/jpeg" }],
  },
  {
    id: "warning-mismatch",
    title: "Warning text mismatch",
    description: "The government warning contains changed wording.",
    application: { path: "/samples/warning-mismatch/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/warning-mismatch/front-label.jpg", name: "civic-oak-front-label.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/warning-mismatch/back-label.jpg", name: "civic-oak-warning-mismatch-back.jpg", type: "image/jpeg" }],
  },
  {
    id: "needs-review",
    title: "Unreadable warning",
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

function OwlGuide({
  message,
  compact = false,
  success = false,
  showBubble = true,
}: {
  message: string;
  compact?: boolean;
  success?: boolean;
  showBubble?: boolean;
}) {
  return (
    <div className="owl-guide" data-compact={compact || undefined} data-success={success || undefined}>
      {showBubble ? <div className="owl-bubble" role="status">{message}</div> : null}
      {compact ? (
        <Image src="/owl.png" alt="LabelProof owl guide" width={116} height={116} priority />
      ) : (
        <video
          key={success ? "success" : "pointing"}
          autoPlay
          muted
          playsInline
          loop={success}
          aria-label="Animated LabelProof owl guide"
        >
          <source src={success ? "/success-owl.mp4" : "/pointing-owl.mp4"} type="video/mp4" />
        </video>
      )}
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
  const [showGuideBubble, setShowGuideBubble] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const resultTopRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const sample = preparedSamples[sampleIndex];
  const ready = application !== null && frontLabel !== null;
  const owlMessage = ready
    ? selectedSample
      ? "Sample ready! Click Check Documents"
      : "Upload successful! Click Check Documents"
    : "Try a sample or upload documents";

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
    setShowGuideBubble(true);
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

  async function chooseSample(chosenSample: PreparedSample = sample) {
    setSampleLoading(true);
    setError(null);
    setShowGuideBubble(false);
    try {
      const [sampleApplication, sampleFront, ...sampleAdditional] = await Promise.all([
        loadSampleFile(chosenSample.application),
        loadSampleFile(chosenSample.front),
        ...chosenSample.additional.map(loadSampleFile),
      ]);
      clearFiles();
      setApplication(sampleApplication);
      setFrontLabel(sampleFront);
      setAdditionalLabels(sampleAdditional);
      setSelectedSample(chosenSample.id);
      setShowGuideBubble(true);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "This sample could not be loaded.");
    } finally {
      setSampleLoading(false);
    }
  }

  function uploadDocuments(files: FileList | null) {
    if (!files?.length) return;
    setShowGuideBubble(false);
    const selected = Array.from(files);
    const pdf = selected.find((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    const images = selected.filter((file) => ["image/jpeg", "image/png"].includes(file.type)).slice(0, 3);

    if (!pdf && images.length === 0) {
      setError("Choose a PDF application and at least one PNG or JPEG label.");
      return;
    }

    const nextApplication = pdf
      ? { name: pdf.name, size: pdf.size, file: pdf, previewUrl: URL.createObjectURL(pdf) }
      : application;
    const nextLabels = images.map((file) => ({ name: file.name, size: file.size, file, previewUrl: URL.createObjectURL(file) }));
    const nextTotal = (nextApplication?.size ?? 0) + (nextLabels.length ? nextLabels.reduce((sum, file) => sum + file.size, 0) : frontLabel?.size ?? 0);
    if (nextTotal > MAX_COMBINED_BYTES) {
      if (pdf) URL.revokeObjectURL(nextApplication?.previewUrl ?? "");
      nextLabels.forEach((file) => URL.revokeObjectURL(file.previewUrl));
      setError("Please keep all files under 3 MB total.");
      return;
    }

    if (pdf) {
      releasePreview(application);
      setApplication(nextApplication);
    }
    if (nextLabels.length) {
      releasePreview(frontLabel);
      additionalLabels.forEach(releasePreview);
      setFrontLabel(nextLabels[0]);
      setAdditionalLabels(nextLabels.slice(1));
    }
    setSelectedSample(null);
    setError(null);
    if ((nextApplication !== null) && (nextLabels.length > 0 || frontLabel !== null)) {
      setShowGuideBubble(true);
    }
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

  const wheelItems = preparedSamples.map((item, index) => {
    const offset = (index - sampleIndex + preparedSamples.length) % preparedSamples.length;
    return { item, index, offset: offset > 1 ? offset - preparedSamples.length : offset };
  });
  const liquidLevel = ready ? 92 : application || frontLabel ? 48 : 0;

  return (
    <div className="submit-page">
      <header className="minimal-bar">
        <div className="simple-logo"><span>LP</span><strong>LabelProof</strong></div>
        <small>Alcohol label comparison</small>
      </header>

      <main className="submit-main" data-ready={ready || undefined}>
        <aside className="page-one-owl">
          <OwlGuide message={owlMessage} success={ready} showBubble={showGuideBubble} />
        </aside>

        <section
          className="wheel-window"
          aria-label="Prepared sample tests"
          onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const position = Math.min(Math.max(event.clientX - bounds.left, 0), bounds.width - 1);
            const nextIndex = Math.floor((position / bounds.width) * preparedSamples.length);
            if (nextIndex !== sampleIndex) showSample(nextIndex);
          }}
          onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
          onTouchEnd={handleTouchEnd}
        >
          <div className="sample-wheel" aria-live="polite">
            {wheelItems.map(({ item, index, offset }) => (
              <button
                key={item.id}
                className="wheel-card"
                data-slot={offset}
                data-active={offset === 0 || undefined}
                data-loaded={selectedSample === item.id || undefined}
                onFocus={() => showSample(index)}
                onClick={() => { showSample(index); chooseSample(item); }}
                disabled={sampleLoading}
                aria-label={`Use ${item.title} sample`}
              >
                <Image src={item.front.path} alt="" fill sizes="150px" unoptimized />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
          <div className="wheel-dots" aria-label="Sample position">
            {preparedSamples.map((item, index) => <button key={item.id} type="button" aria-label={`Show ${item.title}`} aria-current={sampleIndex === index ? "true" : undefined} onClick={() => showSample(index)} />)}
          </div>
        </section>

        <section className="upload-window" aria-label="Upload and compare documents">
          <div className="upload-vessel" aria-label={ready ? "Documents uploaded" : "Document upload progress"}>
            <div className="vessel-water" style={{ height: `${liquidLevel}%` }} />
            <div className="vessel-glow" />
          </div>
          <div className="upload-action">
            <input ref={uploadInputRef} className="hidden-upload" type="file" multiple accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => uploadDocuments(event.target.files)} />
            <button className="upload-or-check" type="button" disabled={analysisState === "analyzing" || sampleLoading} onClick={() => ready ? analyzeLabel() : uploadInputRef.current?.click()}>
              {analysisState === "analyzing" ? <><span className="compare-spinner" /> Checking…</> : ready ? <>Check<br />Documents</> : <>Upload<br />Documents</>}
            </button>
            {error ? <span className="upload-error upload-error--compact" role="alert">{error}</span> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
