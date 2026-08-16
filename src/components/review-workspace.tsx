"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import type { DocumentExtraction } from "@/lib/contracts/extraction";
import type {
  FieldResult,
  VerificationResult,
  VerificationStatus,
} from "@/lib/contracts/verification";
import {
  countRequiredDocuments,
  isSubmissionComplete,
} from "@/lib/submission";

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
type AnalysisState = "idle" | "analyzing" | "complete" | "error";

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
    id: "missing-warning",
    title: "Missing warning",
    description: "The government warning does not appear on the label.",
    application: { path: "/samples/missing-warning/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/missing-warning/front-label.jpg", name: "civic-oak-front-label.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/missing-warning/back-label.jpg", name: "civic-oak-missing-warning-back.jpg", type: "image/jpeg" }],
  },
  {
    id: "blurred-label",
    title: "Blurred label",
    description: "The label is too blurry for a safe comparison.",
    application: { path: "/samples/blurred-label/application.pdf", name: "civic-oak-application.pdf", type: "application/pdf" },
    front: { path: "/samples/blurred-label/front-label.jpg", name: "civic-oak-blurred-front.jpg", type: "image/jpeg" },
    additional: [{ path: "/samples/blurred-label/back-label.jpg", name: "civic-oak-back-label.jpg", type: "image/jpeg" }],
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

function machineStatus(status: VerificationStatus) {
  if (status === "pass") return "Matched";
  if (status === "mismatch") return "Unmatched";
  return "Needs Review";
}

function statusLabel(status: VerificationStatus) {
  if (status === "pass") return "Match";
  if (status === "mismatch") return "Mismatch";
  return "Review";
}

function KeyedOwlVideo({ success }: { success: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    let frameRequest = 0;
    const drawFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = frame.data;

        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          const brightest = Math.max(red, green, blue);
          const darkest = Math.min(red, green, blue);

          // The supplied Pika clips were rendered against black. Remove only
          // nearly-neutral dark pixels so the owl's blue details remain intact.
          if (brightest < 42 && brightest - darkest < 18) {
            pixels[index + 3] = Math.round((brightest / 42) * 255);
          }
        }

        context.putImageData(frame, 0, 0);
      }
      frameRequest = requestAnimationFrame(drawFrame);
    };

    frameRequest = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(frameRequest);
  }, [success]);

  return (
    <>
      <video
        ref={videoRef}
        className="owl-video-source"
        key={success ? "success" : "pointing"}
        autoPlay
        muted
        playsInline
        loop={success}
        aria-hidden="true"
      >
        <source src={success ? "/ui/success.mp4" : "/ui/pointing.mp4"} type="video/mp4" />
      </video>
      <canvas ref={canvasRef} className="owl-video-canvas" aria-label="Animated LabelProof owl guide" />
    </>
  );
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
        <KeyedOwlVideo success={success} />
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

function ResultScreen({
  response,
  analysisState,
  onReset,
}: {
  response: AnalysisResponse | null;
  analysisState: AnalysisState;
  onReset: () => void;
}) {
  const status = response?.verification.overallStatus;
  const [showDetails, setShowDetails] = useState(false);
  const [decision, setDecision] = useState<ReviewerDecision | null>(null);
  const hasDecision = decision !== null;
  const resultReady = response !== null;

  return (
    <div className="result-shell">
      <main className="result-page">
        <div className="minimal-bar">
          <a className="simple-logo" href="#" onClick={(event) => { event.preventDefault(); onReset(); }}>
            <span>LP</span><strong>LabelProof</strong>
          </a>
          <button type="button" onClick={onReset}>Compare another label</button>
        </div>

        <div className="result-main">
          <aside className="result-owl">
            {resultReady ? (
              <OwlGuide
                message={hasDecision ? "Your decision is recorded. Success!" : "Results are here. Please make a decision."}
                success={hasDecision}
              />
            ) : null}
          </aside>

          <section className="result-machine-window" data-status={status} aria-labelledby={resultReady ? "machine-result-title" : undefined}>
            <div className="result-stage">
              <div className="document-crossing" aria-hidden="true">
                <video
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={(event) => { event.currentTarget.playbackRate = 0.6; }}
                >
                  <source src="/ui/document-crossing-transparent.webm" type="video/webm" />
                </video>
              </div>
              {!resultReady ? <p className="result-progress-copy">Carefully checking the application and label…</p> : null}
              {resultReady && status ? <h1 id="machine-result-title" className="result-status-word">{machineStatus(status)}</h1> : null}
            </div>
            {resultReady ? (
              <button className="details-toggle" type="button" onClick={() => setShowDetails((current) => !current)} aria-expanded={showDetails}>
                {showDetails ? "Hide Verification Details" : "View Verification Details"}
                <span aria-hidden="true">{showDetails ? "−" : "+"}</span>
              </button>
            ) : <div className="details-placeholder" aria-label={analysisState === "analyzing" ? "Comparing documents" : "Preparing comparison"} />}
            {showDetails && response ? <VerificationDetails fields={response.verification.fields} /> : null}
          </section>

          <section className="result-routing-window" aria-label="Routing decision">
            <div className="decision-grid">
              {decisionOptions.map((option) => {
                const isSelected = option.value === decision;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="decision-choice"
                    data-selected={isSelected || undefined}
                    aria-pressed={isSelected}
                    disabled={!resultReady}
                    onClick={() => setDecision(option.value)}
                  >
                    {option.value === "manual_review" ? <>Manual<br />Review</> : option.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
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
  const [showResultPage, setShowResultPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuideBubble, setShowGuideBubble] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const suppressSampleClickRef = useRef(false);
  const resultTopRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const analysisGenerationRef = useRef(0);
  const analysisInFlightForRef = useRef<number | null>(null);

  const sample = preparedSamples[sampleIndex];
  const backLabel = additionalLabels[0] ?? null;
  const requiredDocuments = { application, frontLabel, backLabel };
  const requiredDocumentCount = countRequiredDocuments(requiredDocuments);
  const ready = isSubmissionComplete(requiredDocuments);
  const partialUpload = requiredDocumentCount > 0 && !ready;
  const owlMessage = ready
    ? selectedSample
      ? "Sample ready! Click Check Documents"
      : "Upload successful! Click Check Documents"
    : "Try a sample or upload documents";

  useEffect(() => {
    if (showResultPage) {
      window.setTimeout(() => resultTopRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    }
  }, [showResultPage]);

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
    analysisGenerationRef.current += 1;
    analysisInFlightForRef.current = null;
    clearFiles();
    setSelectedSample(null);
    setAnalysisResult(null);
    setAnalysisState("idle");
    setShowResultPage(false);
    setError(null);
    setShowGuideBubble(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showSample(index: number) {
    if (selectedSample) return;
    setSampleIndex((index + preparedSamples.length) % preparedSamples.length);
  }

  function handleTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(distance) > 45) {
      suppressSampleClickRef.current = true;
      showSample(sampleIndex + (distance < 0 ? 1 : -1));
    }
    touchStartX.current = null;
  }

  function selectHighlightedSample() {
    if (selectedSample) return;
    if (suppressSampleClickRef.current) {
      suppressSampleClickRef.current = false;
      return;
    }
    if (!sampleLoading) void chooseSample(sample);
  }

  function openResults() {
    if (!ready) return;
    if (analysisState === "error") setAnalysisState("idle");
    setShowResultPage(true);
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
      analysisGenerationRef.current += 1;
      analysisInFlightForRef.current = null;
      setAnalysisResult(null);
      setAnalysisState("idle");
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
      setError("Choose a PDF application and PNG or JPEG front/back labels.");
      return;
    }

    const createdApplication = pdf
      ? { name: pdf.name, size: pdf.size, file: pdf, previewUrl: URL.createObjectURL(pdf) }
      : null;
    const createdLabels = images.map((file) => ({
      name: file.name,
      size: file.size,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    const nextApplication = createdApplication ?? application;
    let nextFrontLabel = frontLabel;
    let nextAdditionalLabels = [...additionalLabels];

    if (createdLabels.length >= 2) {
      nextFrontLabel = createdLabels[0];
      nextAdditionalLabels = createdLabels.slice(1);
    } else if (createdLabels.length === 1) {
      if (!nextFrontLabel) {
        nextFrontLabel = createdLabels[0];
      } else if (!nextAdditionalLabels[0]) {
        nextAdditionalLabels = [createdLabels[0]];
      } else if (nextAdditionalLabels.length < 2) {
        nextAdditionalLabels = [...nextAdditionalLabels, createdLabels[0]];
      } else {
        releasePreview(createdLabels[0]);
        createdLabels.pop();
      }
    }

    const nextTotal =
      (nextApplication?.size ?? 0) +
      (nextFrontLabel?.size ?? 0) +
      nextAdditionalLabels.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_COMBINED_BYTES) {
      releasePreview(createdApplication);
      createdLabels.forEach(releasePreview);
      setError("Please keep all files under 3 MB total.");
      return;
    }

    if (createdApplication) {
      releasePreview(application);
    }
    if (createdLabels.length >= 2) {
      releasePreview(frontLabel);
      additionalLabels.forEach(releasePreview);
    }

    analysisGenerationRef.current += 1;
    analysisInFlightForRef.current = null;
    setAnalysisResult(null);
    setAnalysisState("idle");
    setApplication(nextApplication);
    setFrontLabel(nextFrontLabel);
    setAdditionalLabels(nextAdditionalLabels);
    setSelectedSample(null);
    setError(null);
    if (nextApplication && nextFrontLabel && nextAdditionalLabels[0]) {
      setShowGuideBubble(true);
    }
  }

  const analyzeLabel = useCallback(async () => {
    if (!ready || !application?.file || !frontLabel?.file || !backLabel?.file) return;
    const generation = analysisGenerationRef.current;
    if (analysisInFlightForRef.current === generation) return;
    analysisInFlightForRef.current = generation;
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
      if (generation !== analysisGenerationRef.current) return;
      setAnalysisResult(payload as AnalysisResponse);
      setAnalysisState("complete");
    } catch (analysisError) {
      if (generation !== analysisGenerationRef.current) return;
      setAnalysisState("error");
      setShowResultPage(false);
      setError(
        analysisError instanceof DOMException && analysisError.name === "AbortError"
          ? "The comparison took too long. Try smaller or clearer images."
          : analysisError instanceof Error ? analysisError.message : "The comparison could not be completed.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (analysisInFlightForRef.current === generation) analysisInFlightForRef.current = null;
    }
  }, [additionalLabels, application, backLabel, frontLabel, ready]);

  useEffect(() => {
    if (!ready || analysisResult || analysisState !== "idle") return;
    const start = window.setTimeout(() => void analyzeLabel(), 0);
    return () => window.clearTimeout(start);
  }, [analysisResult, analysisState, analyzeLabel, ready]);

  if (showResultPage) {
    return <div ref={resultTopRef}><ResultScreen response={analysisResult} analysisState={analysisState} onReset={resetReview} /></div>;
  }

  const wheelItems = preparedSamples.map((item, index) => {
    const half = Math.floor(preparedSamples.length / 2);
    const rawOffset = index - sampleIndex;
    const offset = ((rawOffset + half + preparedSamples.length) % preparedSamples.length) - half;
    return { item, index, offset };
  });
  const liquidLevel = Math.round((requiredDocumentCount / 3) * 92);

  return (
    <div className="submit-page">
      <header className="minimal-bar">
        <div className="simple-logo"><span>LP</span><strong>LabelProof</strong></div>
        <small>AI-Powered Alcohol Label Verification App</small>
      </header>

      <main className="submit-main" data-ready={ready || undefined}>
        <aside className="page-one-owl">
          <OwlGuide message={owlMessage} success={ready} showBubble={showGuideBubble} />
        </aside>

        <section
          className="wheel-window"
          aria-label="Prepared sample tests"
          role="button"
          tabIndex={0}
          onMouseMove={(event) => {
            if (selectedSample) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const activeBandWidth = 128;
            const bandStart = (bounds.width - activeBandWidth) / 2;
            const position = event.clientX - bounds.left - bandStart;
            if (position < 0 || position >= activeBandWidth) return;
            const nextIndex = Math.min(
              preparedSamples.length - 1,
              Math.floor((position / activeBandWidth) * preparedSamples.length),
            );
            if (nextIndex !== sampleIndex) showSample(nextIndex);
          }}
          onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
          onTouchEnd={handleTouchEnd}
          onClick={selectHighlightedSample}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectHighlightedSample();
            }
          }}
        >
          <div className="sample-wheel" aria-live="polite">
            {wheelItems.map(({ item, offset }) => (
              <button
                key={item.id}
                className="wheel-card"
                data-slot={offset}
                data-active={offset === 0 || undefined}
                data-loaded={selectedSample === item.id || undefined}
                tabIndex={-1}
                disabled={sampleLoading}
                aria-label={`Use ${item.title} sample`}
              >
                <Image src={item.front.path} alt="" fill sizes="150px" unoptimized />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
          <div className="wheel-dots" aria-label="Sample position">
            {preparedSamples.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.title}`}
                aria-current={sampleIndex === index ? "true" : undefined}
                disabled={Boolean(selectedSample)}
                onMouseEnter={() => showSample(index)}
                onFocus={() => showSample(index)}
                onClick={(event) => { event.stopPropagation(); showSample(index); }}
              />
            ))}
          </div>
        </section>

        <section className="upload-window" aria-label="Upload and compare documents">
          <div className="upload-vessel" aria-label={`${requiredDocumentCount} of 3 required documents uploaded`}>
            <div className="vessel-water" style={{ height: `${liquidLevel}%` }} />
            <div className="vessel-glow" />
          </div>
          <div className="upload-action">
            <input
              ref={uploadInputRef}
              className="hidden-upload"
              type="file"
              multiple
              accept="application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg"
              onChange={(event) => {
                uploadDocuments(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <button className="upload-or-check" type="button" disabled={sampleLoading} onClick={() => ready ? openResults() : uploadInputRef.current?.click()}>
              {ready ? <>Check<br />Documents</> : <>Upload<br />Documents</>}
            </button>
            {error ? (
              <span className="upload-error upload-error--compact" role="alert">{error}</span>
            ) : partialUpload ? (
              <span className="upload-feedback">Please upload more documents.</span>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
