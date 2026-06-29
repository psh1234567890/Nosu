import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const args = process.argv.slice(2);
const isSmoke = args.includes("--smoke");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const REPORT_PATH =
  process.env.LAUNCH_REHEARSAL_REPORT_PATH ?? path.join(ROOT_DIR, "output", "launch-rehearsal-report.json");
const MARKDOWN_REPORT_PATH =
  process.env.LAUNCH_REHEARSAL_MARKDOWN_PATH ?? path.join(ROOT_DIR, "output", "launch-rehearsal-report.md");
const PREFLIGHT_PATH =
  process.env.LAUNCH_REHEARSAL_PREFLIGHT_PATH ?? path.join(ROOT_DIR, "output", "release-preflight-report.json");
const EVIDENCE_PATH =
  process.env.LAUNCH_REHEARSAL_EVIDENCE_PATH ?? path.join(ROOT_DIR, "output", "launch-evidence-package.json");

function relativePath(filePath) {
  return path.relative(ROOT_DIR, filePath) || path.basename(filePath);
}

function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
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
    return { path: relativePath(filePath), present: true, data: JSON.parse(await readFile(filePath, "utf8")), error: null };
  } catch (error) {
    return { path: relativePath(filePath), present: true, data: null, error: error.message };
  }
}

function providerSummary(preflight) {
  const providers = preflight?.providerDiagnostics ?? {};
  return Object.fromEntries(
    ["sms", "oauth", "ai", "storage"].map((key) => [key, providers[key]?.status ?? "unknown"]),
  );
}

function runStage(stage) {
  return new Promise((resolve) => {
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const command = npmExecPath ? process.execPath : npmCommand;
    const commandArgs = npmExecPath ? [npmExecPath, ...stage.args] : stage.args;
    console.log(`[release:rehearse] ${stage.name} started - ${stage.description}`);
    const child = spawn(command, commandArgs, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: "inherit",
      shell: !npmExecPath && process.platform === "win32",
      windowsHide: true,
    });
    child.on("error", (error) => {
      const finished = Date.now();
      resolve({
        ...stage,
        ok: false,
        code: 1,
        failure: error.message,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        elapsedMs: finished - started,
        elapsed: formatElapsed(finished - started),
      });
    });
    child.on("exit", (code, signal) => {
      const finished = Date.now();
      const ok = code === 0;
      resolve({
        ...stage,
        ok,
        code: code ?? 1,
        signal: signal ?? null,
        failure: ok ? null : signal ? `signal ${signal}` : `exit code ${code ?? 1}`,
        startedAt,
        finishedAt: new Date(finished).toISOString(),
        elapsedMs: finished - started,
        elapsed: formatElapsed(finished - started),
      });
    });
  });
}

function buildSmokeReport(startedAt, finishedAt, preflightArtifact, evidenceArtifact) {
  const preflight = preflightArtifact.data;
  const evidence = evidenceArtifact.data;
  const checks = [
    {
      id: "release-preflight",
      status: preflightArtifact.present && preflight?.ok === true ? "passed" : "blocked",
      detail: preflightArtifact.error ?? (preflightArtifact.present ? `status=${preflight?.status ?? "unknown"}` : "missing"),
    },
    {
      id: "launch-evidence",
      status: evidence?.status === "partial" ? "pending" : evidenceArtifact.present && evidence?.ok === true ? "passed" : "blocked",
      detail: evidenceArtifact.error ?? (evidenceArtifact.present ? `status=${evidence?.status ?? "unknown"}` : "missing"),
    },
  ];
  const hasBlocked = checks.some((item) => item.status === "blocked");
  const hasPending = checks.some((item) => item.status === "pending");
  const status = hasBlocked ? "blocked" : hasPending ? "partial" : "ready";
  return {
    ok: !hasBlocked,
    mode: "smoke",
    status,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    elapsedMs: finishedAt - startedAt,
    elapsed: formatElapsed(finishedAt - startedAt),
    artifacts: {
      json: relativePath(REPORT_PATH),
      markdown: relativePath(MARKDOWN_REPORT_PATH),
      inputs: {
        releasePreflight: { path: preflightArtifact.path, present: preflightArtifact.present },
        launchEvidence: { path: evidenceArtifact.path, present: evidenceArtifact.present },
      },
    },
    providerDiagnostics: providerSummary(preflight),
    checks,
    nextActions:
      status === "ready"
        ? ["Run `npm.cmd run release:rehearse` against the real production env before final promotion."]
        : ["Run `npm.cmd run smoke:full`, then `npm.cmd run release:evidence:strict`, then rerun this rehearsal check."],
  };
}

function renderMarkdown(report) {
  const stageRows = (report.stages ?? []).map(
    (stage) =>
      `| ${markdownCell(stage.name)} | ${stage.ok ? "PASS" : "FAIL"} | ${markdownCell(stage.elapsed)} | ${markdownCell(
        stage.description,
      )} | ${markdownCell(stage.failure ?? "")} |`,
  );
  const checkRows = (report.checks ?? []).map(
    (check) => `| ${markdownCell(check.id)} | ${markdownCell(check.status)} | ${markdownCell(check.detail)} |`,
  );
  const providerRows = Object.entries(report.providerDiagnostics ?? {}).map(
    ([key, value]) => `| ${markdownCell(key)} | ${markdownCell(value)} |`,
  );
  return [
    "# Nosu Best Launch Rehearsal Report",
    "",
    `- Status: ${String(report.status).toUpperCase()}`,
    `- Mode: ${report.mode}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Elapsed: ${report.elapsed}`,
    `- JSON artifact: ${report.artifacts.json}`,
    `- Markdown artifact: ${report.artifacts.markdown}`,
    "",
    "## Stages",
    "",
    stageRows.length
      ? "| Stage | Result | Elapsed | Description | Failure |\n| --- | --- | ---: | --- | --- |\n" + stageRows.join("\n")
      : "| Check | Status | Detail |\n| --- | --- | --- |\n" + checkRows.join("\n"),
    "",
    "## Provider Summary",
    "",
    "| Provider | Status |",
    "| --- | --- |",
    ...(providerRows.length ? providerRows : ["| none | unknown |"]),
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((action) => `- ${action}`),
    "",
  ].join("\n");
}

async function writeReport(report) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await mkdir(path.dirname(MARKDOWN_REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_REPORT_PATH, renderMarkdown(report), "utf8");
}

async function runSmokeMode() {
  const startedAt = Date.now();
  const [preflightArtifact, evidenceArtifact] = await Promise.all([
    readJsonArtifact(PREFLIGHT_PATH),
    readJsonArtifact(EVIDENCE_PATH),
  ]);
  const finishedAt = Date.now();
  const report = buildSmokeReport(startedAt, finishedAt, preflightArtifact, evidenceArtifact);
  await writeReport(report);
  console.log("Launch rehearsal smoke passed", {
    status: report.status,
    report: relativePath(REPORT_PATH),
    markdown: relativePath(MARKDOWN_REPORT_PATH),
  });
  if (!report.ok) process.exitCode = 1;
}

async function runStrictMode() {
  const started = Date.now();
  const stages = [
    {
      name: "release-env",
      description: "validate the real production env file and emit secret-safe JSON diagnostics",
      args: ["run", "check:release-env:json"],
    },
    {
      name: "full-smoke",
      description: "run verify, deploy, browser, and voice release smoke",
      args: ["run", "smoke:full"],
    },
    {
      name: "strict-evidence",
      description: "collect current preflight and full-smoke artifacts into the final evidence package",
      args: ["run", "release:evidence:strict"],
    },
    {
      name: "release-dry-run",
      description: "prove start:release passes the env guard without leaving a server running",
      args: ["run", "start:release", "--", "--dry-run"],
    },
  ];
  const results = [];
  for (const stage of stages) {
    const result = await runStage(stage);
    results.push(result);
    if (!result.ok) break;
  }
  const finished = Date.now();
  const failed = results.find((item) => !item.ok);
  const evidenceArtifact = await readJsonArtifact(EVIDENCE_PATH);
  const report = {
    ok: !failed,
    mode: "strict",
    status: failed ? "failed" : "ready",
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    elapsedMs: finished - started,
    elapsed: formatElapsed(finished - started),
    failedStage: failed?.name ?? null,
    artifacts: {
      json: relativePath(REPORT_PATH),
      markdown: relativePath(MARKDOWN_REPORT_PATH),
      inputs: {
        launchEvidence: { path: evidenceArtifact.path, present: evidenceArtifact.present },
      },
    },
    providerDiagnostics: providerSummary(evidenceArtifact.data?.releasePreflight),
    stages: results,
    nextActions: failed
      ? [`Fix the ${failed.name} stage, then rerun \`npm.cmd run release:rehearse\`.`]
      : ["Archive this rehearsal report with the launch evidence package before promotion."],
  };
  await writeReport(report);
  console.log("Launch rehearsal report written", {
    status: report.status,
    failedStage: report.failedStage,
    report: relativePath(REPORT_PATH),
    markdown: relativePath(MARKDOWN_REPORT_PATH),
  });
  if (!report.ok) process.exitCode = 1;
}

if (isSmoke) {
  await runSmokeMode();
} else {
  await runStrictMode();
}
