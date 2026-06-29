import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const args = process.argv.slice(2);
const isSmoke = args.includes("--smoke");
const strictRehearsal = args.includes("--strict-rehearsal");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const startedAt = Date.now();
const REPORT_PATH =
  process.env.PROMOTION_GATE_REFRESH_REPORT_PATH ??
  path.join(ROOT_DIR, "output", "promotion-gate-refresh-report.json");
const MARKDOWN_REPORT_PATH =
  process.env.PROMOTION_GATE_REFRESH_MARKDOWN_PATH ??
  path.join(ROOT_DIR, "output", "promotion-gate-refresh-report.md");

const artifactPaths = {
  preflight: path.join(ROOT_DIR, "output", "release-preflight-report.json"),
  fullSmokeMarkdown: path.join(ROOT_DIR, "output", "smoke-full-report.md"),
  fullSmoke: path.join(ROOT_DIR, "output", "smoke-full-report.json"),
  evidence: path.join(ROOT_DIR, "output", "launch-evidence-package.json"),
  rehearsal: path.join(ROOT_DIR, "output", "launch-rehearsal-report.json"),
};

const refreshStages = strictRehearsal
  ? [
      {
        name: "strict-rehearsal",
        description: "run the real-env promotion rehearsal, including full smoke and strict evidence",
        args: ["run", "release:rehearse"],
      },
    ]
  : [
      {
        name: "full-smoke",
        description: "refresh verify, deploy, browser, and voice release smoke artifacts",
        args: ["run", "smoke:full"],
      },
      {
        name: "strict-evidence",
        description: "regenerate the strict launch evidence package from current preflight and full smoke",
        args: ["run", "release:evidence:strict"],
      },
      {
        name: "rehearsal-smoke",
        description: "refresh the promotion rehearsal smoke contract without requiring real production secrets",
        args: ["run", "smoke:release-rehearsal"],
      },
    ];

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

function dateMs(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
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

function runStage(stage) {
  return new Promise((resolve) => {
    const started = Date.now();
    const startedIso = new Date(started).toISOString();
    const command = npmExecPath ? process.execPath : npmCommand;
    const commandArgs = npmExecPath ? [npmExecPath, ...stage.args] : stage.args;
    console.log(`[promotion:refresh] ${stage.name} started - ${stage.description}`);
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
        signal: null,
        failure: error.message,
        startedAt: startedIso,
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
        startedAt: startedIso,
        finishedAt: new Date(finished).toISOString(),
        elapsedMs: finished - started,
        elapsed: formatElapsed(finished - started),
      });
    });
  });
}

async function clearFullSmokeArtifacts() {
  await Promise.all([
    rm(artifactPaths.fullSmoke, { force: true }).catch(() => {}),
    rm(artifactPaths.fullSmokeMarkdown, { force: true }).catch(() => {}),
  ]);
}

function makeCheck(id, status, detail, artifact) {
  return { id, status, detail, artifact: artifact.path };
}

async function assessArtifacts(requireStrictRehearsal) {
  const [preflight, fullSmoke, evidence, rehearsal] = await Promise.all([
    readJsonArtifact(artifactPaths.preflight),
    readJsonArtifact(artifactPaths.fullSmoke),
    readJsonArtifact(artifactPaths.evidence),
    readJsonArtifact(artifactPaths.rehearsal),
  ]);
  const checks = [];

  if (!preflight.present || preflight.error) {
    checks.push(makeCheck("release-preflight", "blocked", preflight.error ?? "missing", preflight));
  } else if (preflight.data?.ok !== true || preflight.data?.status !== "passed") {
    checks.push(makeCheck("release-preflight", "blocked", `status=${preflight.data?.status ?? "unknown"}`, preflight));
  } else {
    checks.push(makeCheck("release-preflight", "passed", "preflight passed", preflight));
  }

  const preflightFinishedMs = dateMs(preflight.data?.finishedAt);
  const fullSmokeFinishedMs = dateMs(fullSmoke.data?.finishedAt);
  if (!fullSmoke.present || fullSmoke.error) {
    checks.push(makeCheck("full-smoke", "pending", fullSmoke.error ?? "missing", fullSmoke));
  } else if (fullSmoke.data?.ok !== true || fullSmoke.data?.status !== "passed") {
    checks.push(
      makeCheck(
        "full-smoke",
        isSmoke ? "pending" : "blocked",
        `status=${fullSmoke.data?.status ?? "unknown"}${isSmoke ? "; rerun npm.cmd run smoke:full before final promotion" : ""}`,
        fullSmoke,
      ),
    );
  } else if (preflightFinishedMs > 0 && fullSmokeFinishedMs > 0 && fullSmokeFinishedMs < preflightFinishedMs) {
    checks.push(makeCheck("full-smoke", "pending", "full smoke is older than the latest preflight", fullSmoke));
  } else {
    checks.push(makeCheck("full-smoke", "passed", "full smoke is current", fullSmoke));
  }

  if (!evidence.present || evidence.error) {
    checks.push(makeCheck("strict-evidence", "pending", evidence.error ?? "missing", evidence));
  } else if (evidence.data?.ok !== true || evidence.data?.status !== "ready" || evidence.data?.strict !== true) {
    checks.push(makeCheck("strict-evidence", "pending", `status=${evidence.data?.status ?? "unknown"}, strict=${evidence.data?.strict === true}`, evidence));
  } else {
    checks.push(makeCheck("strict-evidence", "passed", "strict evidence is ready", evidence));
  }

  const rehearsalReady =
    rehearsal.data?.ok === true &&
    rehearsal.data?.status === "ready" &&
    (!requireStrictRehearsal || rehearsal.data?.mode === "strict");
  if (!rehearsal.present || rehearsal.error) {
    checks.push(makeCheck("launch-rehearsal", "pending", rehearsal.error ?? "missing", rehearsal));
  } else if (!rehearsalReady) {
    checks.push(
      makeCheck(
        "launch-rehearsal",
        "pending",
        `status=${rehearsal.data?.status ?? "unknown"}, mode=${rehearsal.data?.mode ?? "unknown"}`,
        rehearsal,
      ),
    );
  } else {
    checks.push(makeCheck("launch-rehearsal", "passed", "launch rehearsal is ready", rehearsal));
  }

  return {
    artifacts: { preflight, fullSmoke, evidence, rehearsal },
    checks,
  };
}

function summarizePromotionMode(reportMode, artifacts) {
  const preflightReady = artifacts.preflight.data?.ok === true && artifacts.preflight.data?.status === "passed";
  const fullSmokeReady = artifacts.fullSmoke.data?.ok === true && artifacts.fullSmoke.data?.status === "passed";
  const strictEvidenceReady =
    artifacts.evidence.data?.ok === true &&
    artifacts.evidence.data?.status === "ready" &&
    artifacts.evidence.data?.strict === true;
  const rehearsalReady = artifacts.rehearsal.data?.ok === true && artifacts.rehearsal.data?.status === "ready";
  const strictRehearsalReady = rehearsalReady && artifacts.rehearsal.data?.mode === "strict";
  const localEvidenceReady = preflightReady && fullSmokeReady && strictEvidenceReady && rehearsalReady;
  const currentRehearsalMode = artifacts.rehearsal.data?.mode ?? (artifacts.rehearsal.present ? "unknown" : "missing");
  const nextRequiredCommand = strictRehearsalReady
    ? null
    : localEvidenceReady
      ? "npm.cmd run release:promotion-refresh:strict"
      : "npm.cmd run release:promotion-refresh";
  const decision = strictRehearsalReady
    ? "strict production rehearsal passed; archive the report with launch evidence"
    : localEvidenceReady
      ? "local evidence is current; strict production-env rehearsal is still required before launch"
      : "local promotion evidence is incomplete; refresh local artifacts before strict rehearsal";

  return {
    mode: reportMode,
    localRefresh: {
      command: "npm.cmd run release:promotion-refresh",
      purpose: "Refreshes local full smoke, strict evidence, and rehearsal-smoke artifacts without approving production launch.",
      ready: localEvidenceReady,
    },
    strictRehearsal: {
      command: "npm.cmd run release:promotion-refresh:strict",
      purpose: "Runs the real production-env rehearsal path required for the final public launch decision.",
      ready: strictRehearsalReady,
      currentRehearsalMode,
    },
    nextRequiredCommand,
    decision,
  };
}

function renderMarkdown(report) {
  const stageRows = report.stages.map(
    (stage) =>
      `| ${markdownCell(stage.name)} | ${stage.ok ? "PASS" : "FAIL"} | ${markdownCell(stage.elapsed)} | \`${markdownCell(
        `${stage.command ?? "npm"} ${(stage.args ?? []).join(" ")}`,
      )}\` | ${markdownCell(stage.failure ?? stage.description)} |`,
  );
  const checkRows = report.checks.map(
    (check) => `| ${markdownCell(check.id)} | ${markdownCell(check.status)} | ${markdownCell(check.detail)} | \`${markdownCell(check.artifact)}\` |`,
  );
  return [
    "# Nosu Best Promotion Gate Refresh Report",
    "",
    `- Status: ${report.status.toUpperCase()}`,
    `- Mode: ${report.mode}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Elapsed: ${report.elapsed}`,
    "",
    "## Refresh Stages",
    "",
    stageRows.length
      ? "| Stage | Result | Elapsed | Command | Notes |\n| --- | --- | ---: | --- | --- |\n" + stageRows.join("\n")
      : "- Smoke mode only inspected existing artifacts.",
    "",
    "## Gate Checks",
    "",
    "| Check | Status | Detail | Artifact |",
    "| --- | --- | --- | --- |",
    ...checkRows,
    "",
    "## Local vs Strict Promotion",
    "",
    `- Local refresh command: \`${report.promotionMode.localRefresh.command}\``,
    `- Local refresh ready: ${report.promotionMode.localRefresh.ready ? "yes" : "no"}`,
    `- Strict rehearsal command: \`${report.promotionMode.strictRehearsal.command}\``,
    `- Strict rehearsal ready: ${report.promotionMode.strictRehearsal.ready ? "yes" : "no"}`,
    `- Current rehearsal mode: ${report.promotionMode.strictRehearsal.currentRehearsalMode}`,
    `- Decision: ${report.promotionMode.decision}`,
    ...(report.promotionMode.nextRequiredCommand ? [`- Next required command: \`${report.promotionMode.nextRequiredCommand}\``] : []),
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((action) => `- ${action}`),
    "",
  ].join("\n");
}

async function writeReport(stages, failedStage) {
  const finished = Date.now();
  const { artifacts, checks } = await assessArtifacts(strictRehearsal);
  const hasBlocked = checks.some((check) => check.status === "blocked");
  const hasPending = checks.some((check) => check.status === "pending");
  const status = failedStage || hasBlocked ? "blocked" : hasPending ? "partial" : "ready";
  const mode = isSmoke ? "smoke" : strictRehearsal ? "strict-rehearsal" : "local-refresh";
  const promotionMode = summarizePromotionMode(mode, artifacts);
  const nextActions =
    status === "ready"
      ? strictRehearsal
        ? ["Archive this report with the launch evidence package before promotion."]
        : ["Run `npm.cmd run release:promotion-refresh:strict` with the real production env before public launch."]
      : [
          "Run `npm.cmd run release:promotion-refresh` after fixing blocked or missing local artifacts.",
          "Run `npm.cmd run release:promotion-refresh:strict` when the real production env is ready.",
        ];
  const report = {
    ok: !failedStage && !hasBlocked && (!strictRehearsal || !hasPending),
    status,
    mode,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    elapsedMs: finished - startedAt,
    elapsed: formatElapsed(finished - startedAt),
    failedStage: failedStage?.name ?? null,
    artifacts: {
      json: relativePath(REPORT_PATH),
      markdown: relativePath(MARKDOWN_REPORT_PATH),
      inputs: Object.fromEntries(Object.entries(artifacts).map(([key, artifact]) => [key, { path: artifact.path, present: artifact.present }])),
    },
    stages,
    checks,
    promotionMode,
    nextActions,
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await mkdir(path.dirname(MARKDOWN_REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_REPORT_PATH, renderMarkdown(report), "utf8");
  console.log("Promotion gate refresh report written", {
    status: report.status,
    mode: report.mode,
    report: relativePath(REPORT_PATH),
    markdown: relativePath(MARKDOWN_REPORT_PATH),
  });

  if (!isSmoke && !report.ok) process.exitCode = failedStage?.code ?? 1;
  if (isSmoke && hasBlocked) process.exitCode = 1;
}

const stageReports = [];
let failedStage = null;

if (!isSmoke) {
  for (const stage of refreshStages) {
    if (stage.name === "full-smoke") await clearFullSmokeArtifacts();
    const result = await runStage(stage);
    stageReports.push(result);
    if (!result.ok) {
      failedStage = result;
      break;
    }
  }
}

await writeReport(stageReports, failedStage);
