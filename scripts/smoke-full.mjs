import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const startedAt = Date.now();
const reportPath =
  process.env.SMOKE_FULL_REPORT_PATH ?? path.join(process.cwd(), "output", "smoke-full-report.json");
const markdownReportPath =
  process.env.SMOKE_FULL_MARKDOWN_PATH ?? path.join(process.cwd(), "output", "smoke-full-report.md");

const stages = [
  {
    name: "verify",
    description: "server syntax, build, managed API/auth/storage smoke, release env/start/preflight smoke",
    args: ["run", "verify"],
  },
  {
    name: "deploy",
    description: "production static Express serving and readiness gates",
    args: ["run", "smoke:deploy"],
  },
  {
    name: "browser",
    description: "managed Playwright full debate flow",
    args: ["run", "smoke:browser:managed"],
  },
  {
    name: "voice",
    description: "managed fake-microphone WebRTC signaling flow",
    args: ["run", "smoke:voice:managed"],
  },
];

function formatElapsed(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function relativeReportPath(filePath) {
  return path.relative(process.cwd(), filePath) || path.basename(filePath);
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function renderMarkdownReport(report) {
  const rows = report.stages.map((stage) => {
    const result = stage.ok ? "PASS" : "FAIL";
    const notes = stage.failure || stage.description;
    return `| ${markdownCell(stage.name)} | ${result} | ${markdownCell(stage.elapsed)} | \`${markdownCell(
      `${stage.command} ${stage.args.join(" ")}`,
    )}\` | ${markdownCell(notes)} |`;
  });
  const nextAction = report.ok
    ? "Release smoke passed. Review production secrets, domain origins, and deployment target before shipping."
    : `Fix the ${report.failedStage} stage, then rerun \`npm run smoke:full\`.`;

  return [
    "# Nosu Best Release Smoke Report",
    "",
    `- Status: ${report.status.toUpperCase()}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Elapsed: ${report.elapsed}`,
    `- Failed stage: ${report.failedStage ?? "none"}`,
    "",
    "## Stage Results",
    "",
    "| Stage | Result | Elapsed | Command | Notes |",
    "| --- | --- | ---: | --- | --- |",
    ...rows,
    "",
    "## Next Action",
    "",
    `- ${nextAction}`,
    "",
  ].join("\n");
}

function reportStage(stage, result) {
  return {
    name: stage.name,
    description: stage.description,
    command: "npm",
    args: stage.args,
    ok: result.ok,
    code: result.code,
    signal: result.signal,
    failure: result.failure,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    elapsedMs: result.elapsedMs,
    elapsed: formatElapsed(result.elapsedMs),
  };
}

function runStage(stage) {
  return new Promise((resolve) => {
    const stageStartedAt = Date.now();
    const startedIso = new Date(stageStartedAt).toISOString();
    console.log(`\n[smoke:full] ${stage.name} started - ${stage.description}`);
    const command = npmExecPath ? process.execPath : npmCommand;
    const args = npmExecPath ? [npmExecPath, ...stage.args] : stage.args;
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: !npmExecPath && process.platform === "win32",
      windowsHide: true,
    });
    child.on("error", (error) => {
      const finishedAt = Date.now();
      const elapsed = formatElapsed(finishedAt - stageStartedAt);
      console.error(`[smoke:full] ${stage.name} failed to start after ${elapsed}: ${error.message}`);
      resolve({
        ok: false,
        code: 1,
        signal: null,
        failure: error.message,
        startedAt: startedIso,
        finishedAt: new Date(finishedAt).toISOString(),
        elapsedMs: finishedAt - stageStartedAt,
      });
    });
    child.on("exit", (code, signal) => {
      const finishedAt = Date.now();
      const elapsedMs = finishedAt - stageStartedAt;
      const elapsed = formatElapsed(elapsedMs);
      if (code === 0) {
        console.log(`[smoke:full] ${stage.name} passed in ${elapsed}`);
        resolve({
          ok: true,
          code: 0,
          signal: null,
          failure: null,
          startedAt: startedIso,
          finishedAt: new Date(finishedAt).toISOString(),
          elapsedMs,
        });
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.error(`[smoke:full] ${stage.name} failed after ${elapsed} (${reason})`);
      resolve({
        ok: false,
        code: code ?? 1,
        signal: signal ?? null,
        failure: reason,
        startedAt: startedIso,
        finishedAt: new Date(finishedAt).toISOString(),
        elapsedMs,
      });
    });
  });
}

async function writeReport(stagesReport, failedStage) {
  const finishedAt = Date.now();
  const report = {
    ok: !failedStage,
    status: failedStage ? "failed" : "passed",
    failedStage: failedStage?.name ?? null,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    elapsedMs: finishedAt - startedAt,
    elapsed: formatElapsed(finishedAt - startedAt),
    artifacts: {
      json: relativeReportPath(reportPath),
      markdown: relativeReportPath(markdownReportPath),
    },
    stages: stagesReport,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await mkdir(path.dirname(markdownReportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownReportPath, renderMarkdownReport(report), "utf8");
  console.log(
    `[smoke:full] release smoke reports written to ${relativeReportPath(reportPath)} and ${relativeReportPath(
      markdownReportPath,
    )}`,
  );
}

const stagesReport = [];
let failedStage = null;

for (const stage of stages) {
  const result = await runStage(stage);
  stagesReport.push(reportStage(stage, result));
  if (!result.ok) {
    failedStage = stage;
    process.exitCode = result.code;
    break;
  }
}

await writeReport(stagesReport, failedStage);

if (!process.exitCode) {
  console.log(`\n[smoke:full] all release smoke stages passed in ${formatElapsed(Date.now() - startedAt)}`);
}
