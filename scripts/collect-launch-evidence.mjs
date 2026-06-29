import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const args = process.argv.slice(2);
const isStrict = args.includes("--strict") || process.env.LAUNCH_EVIDENCE_STRICT === "true";
const isSmoke = args.includes("--smoke");
const PREFLIGHT_JSON_PATH =
  process.env.LAUNCH_EVIDENCE_PREFLIGHT_JSON_PATH ??
  path.join(ROOT_DIR, "output", "release-preflight-report.json");
const PREFLIGHT_MARKDOWN_PATH =
  process.env.LAUNCH_EVIDENCE_PREFLIGHT_MARKDOWN_PATH ??
  path.join(ROOT_DIR, "output", "release-preflight-report.md");
const FULL_SMOKE_JSON_PATH =
  process.env.LAUNCH_EVIDENCE_FULL_SMOKE_JSON_PATH ??
  path.join(ROOT_DIR, "output", "smoke-full-report.json");
const FULL_SMOKE_MARKDOWN_PATH =
  process.env.LAUNCH_EVIDENCE_FULL_SMOKE_MARKDOWN_PATH ??
  path.join(ROOT_DIR, "output", "smoke-full-report.md");
const REPORT_PATH =
  process.env.LAUNCH_EVIDENCE_REPORT_PATH ??
  path.join(ROOT_DIR, "output", "launch-evidence-package.json");
const MARKDOWN_REPORT_PATH =
  process.env.LAUNCH_EVIDENCE_MARKDOWN_PATH ??
  path.join(ROOT_DIR, "output", "launch-evidence-package.md");

function relativePath(filePath) {
  return path.relative(ROOT_DIR, filePath) || path.basename(filePath);
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

async function readJsonArtifact(filePath) {
  if (!existsSync(filePath)) {
    return { path: relativePath(filePath), present: false, data: null, error: "missing" };
  }
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    return { path: relativePath(filePath), present: true, data, error: null };
  } catch (error) {
    return { path: relativePath(filePath), present: true, data: null, error: error.message };
  }
}

function textArtifact(filePath) {
  return { path: relativePath(filePath), present: existsSync(filePath) };
}

function isProviderDiagnosticsReady(preflight) {
  const providers = preflight?.providerDiagnostics;
  if (!providers || typeof providers !== "object") return false;
  return ["sms", "oauth", "ai", "storage"].every((key) => providers[key]?.status === "ready");
}

function dateMs(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
}

function assessPreflight(artifact) {
  const report = artifact.data;
  const checks = [];
  if (!artifact.present) checks.push({ id: "release-preflight-json", status: "blocked", detail: "release preflight JSON is missing" });
  if (artifact.error) checks.push({ id: "release-preflight-json", status: "blocked", detail: artifact.error });
  if (artifact.present && report?.ok !== true) {
    checks.push({ id: "release-preflight-passed", status: "blocked", detail: "release preflight did not pass" });
  }
  if (artifact.present && !isProviderDiagnosticsReady(report)) {
    checks.push({ id: "provider-diagnostics", status: "blocked", detail: "provider diagnostics are not all ready" });
  }
  return {
    ok: checks.length === 0,
    status: checks.length === 0 ? "passed" : "blocked",
    path: artifact.path,
    startedAt: report?.startedAt ?? null,
    finishedAt: report?.finishedAt ?? null,
    checks,
    providerDiagnostics: report?.providerDiagnostics ?? null,
  };
}

function assessFullSmoke(artifact, preflightFinishedAt) {
  const report = artifact.data;
  const checks = [];
  if (!artifact.present) {
    checks.push({ id: "full-smoke-json", status: "pending", detail: "full release smoke has not been run yet" });
  }
  if (artifact.error) {
    checks.push({ id: "full-smoke-json", status: "blocked", detail: artifact.error });
  }
  if (artifact.present && report?.ok !== true) {
    checks.push({ id: "full-smoke-passed", status: "blocked", detail: "full release smoke did not pass" });
  }
  const preflightMs = dateMs(preflightFinishedAt);
  const smokeMs = dateMs(report?.finishedAt);
  if (artifact.present && report?.ok === true && preflightMs > 0 && smokeMs > 0 && smokeMs < preflightMs) {
    checks.push({ id: "full-smoke-current", status: "pending", detail: "full release smoke is older than the latest preflight" });
  }
  const hasBlocked = checks.some((item) => item.status === "blocked");
  const hasPending = checks.some((item) => item.status === "pending");
  return {
    ok: checks.length === 0,
    status: hasBlocked ? "blocked" : hasPending ? "pending" : "passed",
    path: artifact.path,
    startedAt: report?.startedAt ?? null,
    finishedAt: report?.finishedAt ?? null,
    failedStage: report?.failedStage ?? null,
    stages: Array.isArray(report?.stages) ? report.stages.map((stage) => ({ name: stage.name, ok: stage.ok, elapsed: stage.elapsed })) : [],
    checks,
  };
}

function softenFullSmokeForSmokeMode(fullSmoke) {
  if (!isSmoke || fullSmoke.status !== "blocked") return fullSmoke;
  return {
    ...fullSmoke,
    status: "pending",
    ok: false,
    checks: fullSmoke.checks.map((check) => ({
      ...check,
      status: check.status === "blocked" ? "pending" : check.status,
      detail:
        check.status === "blocked"
          ? `${check.detail}; rerun npm.cmd run smoke:full before strict launch evidence`
          : check.detail,
    })),
  };
}

function renderMarkdown(report) {
  const providerRows = Object.entries(report.providerDiagnostics ?? {}).map(
    ([key, value]) =>
      `| ${markdownCell(key)} | ${markdownCell(value.status)} | ${markdownCell(
        Object.entries(value)
          .filter(([itemKey]) => itemKey !== "status")
          .map(([itemKey, itemValue]) => `${itemKey}=${itemValue}`)
          .join(", "),
      )} |`,
  );
  const artifactRows = Object.entries(report.artifacts.inputs).map(
    ([key, value]) => `| ${markdownCell(key)} | ${value.present ? "present" : "missing"} | \`${markdownCell(value.path)}\` |`,
  );
  const checkRows = report.checks.map(
    (item) => `| ${markdownCell(item.id)} | ${markdownCell(item.status)} | ${markdownCell(item.detail)} |`,
  );
  return [
    "# Nosu Best Launch Evidence Package",
    "",
    `- Status: ${report.status.toUpperCase()}`,
    `- Generated: ${report.generatedAt}`,
    `- Strict mode: ${report.strict ? "true" : "false"}`,
    `- JSON artifact: ${report.artifacts.json}`,
    `- Markdown artifact: ${report.artifacts.markdown}`,
    "",
    "## Artifact Inputs",
    "",
    "| Artifact | State | Path |",
    "| --- | --- | --- |",
    ...artifactRows,
    "",
    "## Checks",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...checkRows,
    "",
    "## Provider Diagnostics",
    "",
    "| Provider | Status | Details |",
    "| --- | --- | --- |",
    ...(providerRows.length ? providerRows : ["| none | unknown | no provider diagnostics captured |"]),
    "",
    "## Next Actions",
    "",
    ...(report.nextActions.length ? report.nextActions.map((action) => `- ${action}`) : ["- No immediate action required."]),
    "",
  ].join("\n");
}

async function main() {
  const preflightJson = await readJsonArtifact(PREFLIGHT_JSON_PATH);
  const fullSmokeJson = await readJsonArtifact(FULL_SMOKE_JSON_PATH);
  const preflight = assessPreflight(preflightJson);
  const fullSmoke = softenFullSmokeForSmokeMode(assessFullSmoke(fullSmokeJson, preflight.finishedAt));
  const preflightMarkdown = textArtifact(PREFLIGHT_MARKDOWN_PATH);
  const fullSmokeMarkdown = textArtifact(FULL_SMOKE_MARKDOWN_PATH);
  const checks = [
    ...preflight.checks,
    ...(preflightMarkdown.present
      ? [{ id: "release-preflight-markdown", status: "passed", detail: "release preflight Markdown is present" }]
      : [{ id: "release-preflight-markdown", status: "pending", detail: "release preflight Markdown is missing" }]),
    ...fullSmoke.checks,
    ...(fullSmokeMarkdown.present
      ? [{ id: "full-smoke-markdown", status: fullSmoke.status === "passed" ? "passed" : "pending", detail: "full smoke Markdown is present" }]
      : [{ id: "full-smoke-markdown", status: "pending", detail: "full smoke Markdown is missing" }]),
  ];
  const hasBlocked = checks.some((item) => item.status === "blocked");
  const hasPending = checks.some((item) => item.status === "pending");
  const status = hasBlocked ? "blocked" : hasPending ? "partial" : "ready";
  const nextActions = [];
  if (!preflight.ok) nextActions.push("Run `npm.cmd run smoke:release-preflight` and fix any blocked release provider checks.");
  if (fullSmoke.status !== "passed") nextActions.push("Run `npm.cmd run smoke:full` after the latest preflight before final promotion.");
  if (status !== "ready") nextActions.push("Rerun `npm.cmd run release:evidence:strict` once all required artifacts are current.");

  const report = {
    ok: !hasBlocked && (!isStrict || !hasPending),
    status,
    strict: isStrict,
    generatedAt: new Date().toISOString(),
    artifacts: {
      json: relativePath(REPORT_PATH),
      markdown: relativePath(MARKDOWN_REPORT_PATH),
      inputs: {
        releasePreflightJson: { path: preflightJson.path, present: preflightJson.present },
        releasePreflightMarkdown: preflightMarkdown,
        fullSmokeJson: { path: fullSmokeJson.path, present: fullSmokeJson.present },
        fullSmokeMarkdown,
      },
    },
    releasePreflight: preflight,
    fullSmoke,
    providerDiagnostics: preflight.providerDiagnostics,
    checks,
    nextActions,
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await mkdir(path.dirname(MARKDOWN_REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_REPORT_PATH, renderMarkdown(report), "utf8");

  const message = isSmoke ? "Launch evidence package smoke passed" : "Launch evidence package written";
  console.log(message, {
    status: report.status,
    strict: report.strict,
    report: relativePath(REPORT_PATH),
    markdown: relativePath(MARKDOWN_REPORT_PATH),
    preflight: report.releasePreflight.status,
    fullSmoke: report.fullSmoke.status,
  });

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Launch evidence package failed:", error.message);
  process.exitCode = 1;
});
