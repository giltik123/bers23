import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const OUTPUT_SHA_RE = /^[0-9a-f]{64}$/u;

export async function buildFashionReviewPublication({
  captureDir,
  fixtureConfigPath,
  outputDir,
  candidateSha,
  evidenceBranch,
}) {
  if (!EXACT_SHA_RE.test(candidateSha ?? '')) throw new Error('Exact candidate SHA is required');
  if (evidenceBranch !== `release-evidence-fashion-${candidateSha}`) {
    throw new Error('Evidence branch must bind exact candidate SHA');
  }

  const [machine, fixtures] = await Promise.all([
    readJson(path.join(captureDir, 'machine-evidence.json')),
    readJson(fixtureConfigPath),
  ]);

  if (machine.kind !== 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_CAPTURE') {
    throw new Error('Unexpected Fashion capture kind');
  }
  if (machine.candidateSha !== candidateSha) throw new Error('Capture candidate SHA mismatch');
  if (machine.decision !== 'PENDING_HUMAN_REVIEW') {
    throw new Error('Capture must remain pending human review');
  }
  if (machine.productionAuthorityGrantedByEvidence !== false ||
      machine.providerAuthorityGrantedByEvidence !== false ||
      machine.billingAuthorityGrantedByEvidence !== false) {
    throw new Error('Capture unexpectedly grants authority');
  }

  const projects = new Map((fixtures.projects ?? []).map(value => [value.id, value]));
  const garments = new Map((fixtures.garments ?? []).map(value => [value.id, value]));
  const sourceEvidence = new Map((machine.sourceEvidence ?? []).map(value => [value.id, value]));
  if (!Array.isArray(machine.samples) || machine.samples.length < 1) {
    throw new Error('Capture samples are missing');
  }

  const prefix = `release-evidence/v1/fashion/${candidateSha}`;
  const rawBase = `https://raw.githubusercontent.com/giltik123/bers23/${evidenceBranch}/${prefix}`;
  const publicationDir = path.join(outputDir, prefix);
  const outputsDir = path.join(publicationDir, 'outputs');
  await mkdir(outputsDir, { recursive: true });

  const manifestSamples = [];
  const draftSamples = [];

  for (const sample of machine.samples) {
    const project = projects.get(sample.projectId);
    const garment = garments.get(sample.garmentId);
    const source = sourceEvidence.get(sample.projectId);
    const garmentSource = sourceEvidence.get(sample.garmentId);
    if (!project || !garment || !source || !garmentSource) {
      throw new Error(`Missing source metadata for sample ${sample.id}`);
    }
    if (!OUTPUT_SHA_RE.test(sample.outputSha256 ?? '')) {
      throw new Error(`Invalid output SHA for sample ${sample.id}`);
    }

    const outputName = `${sample.id}.png`;
    const captureOutput = path.join(captureDir, 'outputs', outputName);
    const outputBytes = await readFile(captureOutput);
    if (sha256(outputBytes) !== sample.outputSha256) {
      throw new Error(`Output SHA mismatch for sample ${sample.id}`);
    }
    await copyFile(captureOutput, path.join(outputsDir, outputName));

    manifestSamples.push({
      id: sample.id,
      source: { url: source.resolvedUrl || source.sourceUrl, sha256: source.sourceSha256 },
      garment: { url: garmentSource.resolvedUrl || garmentSource.sourceUrl, sha256: garmentSource.sourceSha256 },
      result: { url: `${rawBase}/outputs/${encodeURIComponent(outputName)}`, sha256: sample.outputSha256 },
    });

    draftSamples.push({
      id: sample.id,
      sourceClass: 'REAL_PHOTO',
      fixtureRightsRef: `${project.license}: ${project.licenseUrl}; garment ${garment.license}: ${garment.licenseUrl}`,
      garmentPreservation: 'PENDING_OWNER_REVIEW',
      logoPatternPreservation: 'PENDING_OWNER_REVIEW',
      observedFailureModes: [
        'FLAT_DETERMINISTIC_COMPOSITE_NO_SYNTHETIC_DRAPE',
        'LIMITED_OCCLUSION_AND_POSE_PERSPECTIVE_FIT',
      ],
      latencyMs: Number(sample.measuredLatencyMs?.p95),
      peakMemoryBytes: machine.peakMemoryBytes,
      reviewedOutputSha256: sample.outputSha256,
      reviewFocus: sample.reviewFocus,
    });
  }

  const fixtureManifest = {
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_FIXTURE_SET',
    candidateSha,
    representativeSetConfirmed: true,
    samples: manifestSamples,
  };
  const reviewDraft = {
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_REVIEW_DRAFT',
    candidateSha,
    representativeSetConfirmed: true,
    decision: 'PENDING_OWNER_REVIEW',
    samples: draftSamples,
    productionAuthorityGranted: false,
    note: 'Promote to review.json only after explicit owner quality acceptance of these exact output SHA-256 values.',
  };
  const captureMetrics = {
    schemaVersion: 1,
    kind: 'BERS_V1_FASHION_REAL_IMAGE_CAPTURE_METRICS',
    candidateSha,
    fixtureSetSha256: machine.fixtureSetSha256,
    sampleCount: machine.sampleCount,
    measuredLatencyMs: machine.measuredLatencyMs,
    peakMemoryBytes: machine.peakMemoryBytes,
    reviewedOutputSha256: Object.fromEntries(machine.samples.map(sample => [sample.id, sample.outputSha256])),
    productionAuthorityGranted: false,
  };

  await Promise.all([
    writeJson(path.join(publicationDir, 'fixture-manifest.json'), fixtureManifest),
    writeJson(path.join(publicationDir, 'review-draft.json'), reviewDraft),
    writeJson(path.join(publicationDir, 'capture-metrics.json'), captureMetrics),
  ]);

  return Object.freeze({
    candidateSha,
    evidenceBranch,
    publicationDir,
    fixtureManifestUrl: `${rawBase}/fixture-manifest.json`,
    reviewDraftUrl: `${rawBase}/review-draft.json`,
    sampleCount: manifestSamples.length,
  });
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    values[key.slice(2)] = argv[++index];
  }
  return {
    captureDir: values.capture,
    fixtureConfigPath: values.fixtures,
    outputDir: values.out,
    candidateSha: values.candidate,
    evidenceBranch: values.branch,
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const result = await buildFashionReviewPublication(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ status: 'PASS', ...result }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
