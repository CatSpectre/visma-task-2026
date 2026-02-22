#!/usr/bin/env npx tsx
/**
 * AI-Powered Test Failure Analyzer Agent
 *
 * Runs the Playwright test suite, classifies each failure (selector not found,
 * timeout, assertion mismatch, navigation / network error), and generates a
 * root-cause analysis with suggested fixes. When GEMINI_API_KEY is set, the
 * context is also sent to Gemini 2.5 Flash for deeper natural-language analysis.
 *
 * Usage:
 *   npx tsx agents/failure-analyzer.ts                        # rule-based only
 *   GEMINI_API_KEY=... npx tsx agents/failure-analyzer.ts     # + Gemini analysis
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/* ── Playwright JSON reporter types ─────────────────────────────────────── */

interface PlaywrightReport {
  config: Record<string, unknown>;
  suites: Suite[];
}
interface Suite {
  title: string;
  file?: string;
  suites?: Suite[];
  specs?: Spec[];
}
interface Spec {
  title: string;
  ok: boolean;
  file: string;
  line: number;
  column: number;
  tests: TestEntry[];
}
interface TestEntry {
  expectedStatus: string;
  status: string;
  results: TestResult[];
}
interface TestResult {
  status: string;
  duration: number;
  error?: { message: string; stack?: string; snippet?: string };
  attachments?: Attachment[];
  steps?: Step[];
}
interface Attachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}
interface Step {
  title: string;
  duration: number;
  error?: { message: string };
  steps?: Step[];
}

/* ── Failure classification ─────────────────────────────────────────────── */

enum FailureType {
  SELECTOR_NOT_FOUND = "SELECTOR_NOT_FOUND",
  TIMEOUT = "TIMEOUT",
  ASSERTION_MISMATCH = "ASSERTION_MISMATCH",
  NAVIGATION_ERROR = "NAVIGATION_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN = "UNKNOWN",
}

interface FailureAnalysis {
  testName: string;
  suiteName: string;
  filePath: string;
  line: number;
  duration: number;
  errorMessage: string;
  stackTrace: string;
  failureType: FailureType;
  rootCause: string;
  suggestedFix: string;
  priority: "critical" | "high" | "medium" | "low";
  sourceContext: string;
  screenshots: string[];
  llmAnalysis?: string;
}

interface RawFailure {
  testName: string;
  suiteName: string;
  filePath: string;
  line: number;
  result: TestResult;
}

interface RuleAnalysis {
  rootCause: string;
  suggestedFix: string;
  priority: "critical" | "high" | "medium" | "low";
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "").replace(/\[\d+m/g, "");
}

/* ── 1. Run Playwright tests ────────────────────────────────────────────── */

function runTests(): PlaywrightReport {
  const outputPath = path.resolve("test-results/report.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log("Running Playwright tests ...\n");

  try {
    execSync("npx playwright test --reporter=json --workers=1 2>/dev/null", {
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outputPath },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 180_000,
    });
  } catch {
    // Non-zero exit is expected when tests fail.
  }

  if (fs.existsSync(outputPath)) {
    return JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  }

  // Fallback: capture JSON from stdout, stripping any non-JSON prefix lines.
  try {
    const raw = execSync(
      "npx playwright test --reporter=json --workers=1 2>/dev/null",
      { stdio: ["pipe", "pipe", "pipe"], timeout: 180_000 },
    ).toString();
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) return JSON.parse(raw.substring(jsonStart));
    return JSON.parse(raw);
  } catch (e: any) {
    if (e.stdout) {
      const raw = e.stdout.toString();
      const jsonStart = raw.indexOf("{");
      if (jsonStart >= 0) return JSON.parse(raw.substring(jsonStart));
      return JSON.parse(raw);
    }
    console.error("Failed to capture test results.");
    process.exit(1);
  }
}

/* ── 2. Extract failures ────────────────────────────────────────────────── */

function extractFailures(report: PlaywrightReport): RawFailure[] {
  const failures: RawFailure[] = [];

  function walk(suites: Suite[], parentTitle: string): void {
    for (const suite of suites) {
      const suitePath = [parentTitle, suite.title].filter(Boolean).join(" > ");
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          const last = test.results[test.results.length - 1];
          if (last?.status === "failed") {
            failures.push({
              testName: spec.title,
              suiteName: suitePath,
              filePath: spec.file,
              line: spec.line,
              result: last,
            });
          }
        }
      }
      if (suite.suites) walk(suite.suites, suitePath);
    }
  }

  walk(report.suites, "");
  return failures;
}

/* ── 3. Source context around failure ────────────────────────────────────── */

function readSourceContext(filePath: string, errorStack?: string): string {
  let failingLine = 0;
  if (errorStack) {
    const m = errorStack.match(new RegExp(path.basename(filePath) + ":(\\d+):\\d+"));
    if (m) failingLine = parseInt(m[1], 10);
  }

  let fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) fullPath = path.resolve("tests", filePath);
  if (!fs.existsSync(fullPath)) fullPath = path.resolve("tests", path.basename(filePath));
  if (!fs.existsSync(fullPath)) return "(source file not found)";

  const lines = fs.readFileSync(fullPath, "utf-8").split("\n");

  if (failingLine > 0) {
    const start = Math.max(0, failingLine - 8);
    const end = Math.min(lines.length, failingLine + 7);
    return lines
      .slice(start, end)
      .map((l, i) => {
        const n = start + i + 1;
        const marker = n === failingLine ? " -> " : "    ";
        return marker + String(n).padStart(4) + " | " + l;
      })
      .join("\n");
  }

  return lines
    .slice(0, 30)
    .map((l, i) => "    " + String(i + 1).padStart(4) + " | " + l)
    .join("\n");
}

/* ── 4. Classify failure type ───────────────────────────────────────────── */

function classifyFailure(errorMessage: string, stack?: string): FailureType {
  const msg = stripAnsi(errorMessage + " " + (stack || "")).toLowerCase();

  if (
    msg.includes("tocontaintext") ||
    msg.includes("tohaveurl") ||
    msg.includes("toequal") ||
    msg.includes("tobetruthy") ||
    msg.includes("expected substring") ||
    msg.includes("expected string") ||
    msg.includes("received string") ||
    (msg.includes("expect(") && msg.includes(") failed"))
  ) {
    return FailureType.ASSERTION_MISMATCH;
  }

  if (
    msg.includes("element(s) not found") ||
    (msg.includes("waiting for locator") && !msg.includes("tocontaintext")) ||
    msg.includes("waiting for getbyrole") ||
    msg.includes("waiting for selector") ||
    msg.includes("no element matches")
  ) {
    return FailureType.SELECTOR_NOT_FOUND;
  }

  if (
    msg.includes("timeout") &&
    (msg.includes("waitforurl") || msg.includes("page.goto") || msg.includes("navigation"))
  ) {
    return FailureType.NAVIGATION_ERROR;
  }

  if (msg.includes("timeout")) return FailureType.TIMEOUT;

  if (
    msg.includes("net::err") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("fetch failed")
  ) {
    return FailureType.NETWORK_ERROR;
  }

  return FailureType.UNKNOWN;
}

/* ── 5. Rule-based root cause analysis ──────────────────────────────────── */

function analyzeWithRules(type: FailureType, errorMessage: string): RuleAnalysis {
  switch (type) {
    case FailureType.ASSERTION_MISMATCH: {
      const expectedMatch = errorMessage.match(/Expected substring:\s*"([^"]+)"/i);
      const receivedMatch = errorMessage.match(/Received string:\s*"([^"]+)"/i);

      if (expectedMatch && receivedMatch) {
        const expected = expectedMatch[1];
        const received = receivedMatch[1];
        const sameBrand = expected.split(" ")[0] === received.split(" ")[0];

        if (sameBrand) {
          return {
            rootCause:
              "Data-dependent assertion failure. Expected \"" + expected + "\" but the live " +
              "site returned \"" + received + "\". Both share the same brand -- the product " +
              "catalog ordering likely changed (price / inventory updates).",
            suggestedFix:
              "1. Loosen the assertion (e.g. verify the title contains the brand name).\n" +
              "2. Mock the API response for deterministic results.\n" +
              "3. Avoid position-dependent checks on live catalogs.",
            priority: "medium",
          };
        }

        return {
          rootCause: "Assertion mismatch: expected \"" + expected + "\" but got \"" + received + "\".",
          suggestedFix:
            "Review whether the expected value matches the current application state. " +
            "Consider using a regex matcher or a more flexible assertion.",
          priority: "high",
        };
      }

      return {
        rootCause: "An assertion did not match. May indicate a regression or dynamic data.",
        suggestedFix: "Use toContainText() with a partial match or toMatch() with a regex.",
        priority: "high",
      };
    }

    case FailureType.SELECTOR_NOT_FOUND: {
      const sel = errorMessage.match(/(?:locator|getByRole|getByText)\(([^)]+)\)/i);
      return {
        rootCause:
          "Selector " + (sel?.[1] ?? "unknown") + " matched no visible element. " +
          "Possible causes: DOM changed, element loads async, modal blocking it.",
        suggestedFix:
          "1. Inspect the DOM in headed mode.\n" +
          "2. Increase waitFor timeout if the element loads slowly.\n" +
          "3. Prefer getByRole() / getByText() over CSS selectors.",
        priority: "critical",
      };
    }

    case FailureType.TIMEOUT: {
      const ms = errorMessage.match(/Timeout (\d+)ms/i)?.[1] ?? "?";
      return {
        rootCause: "Timed out after " + ms + "ms -- page or element did not reach expected state.",
        suggestedFix:
          "1. Increase timeout.\n" +
          "2. Add page.waitForLoadState(\"networkidle\").\n" +
          "3. Check the screenshot for actual page state.",
        priority: "high",
      };
    }

    case FailureType.NAVIGATION_ERROR:
      return {
        rootCause: "Navigation failed -- redirect, URL encoding mismatch, or bot protection.",
        suggestedFix:
          "1. Broaden the URL pattern.\n" +
          "2. Check for CAPTCHA / error pages in the screenshot.",
        priority: "critical",
      };

    case FailureType.NETWORK_ERROR:
      return {
        rootCause: "Network-level error -- browser could not reach the server.",
        suggestedFix:
          "1. Verify the site is reachable.\n" +
          "2. Check DNS / proxy / firewall settings.\n" +
          "3. Add retry logic for transient failures.",
        priority: "critical",
      };

    default:
      return {
        rootCause: "Unclassified failure -- does not match known patterns.",
        suggestedFix: "Run in debug mode and review the full stack trace.",
        priority: "medium",
      };
  }
}

/* ── 6. Gemini LLM analysis (optional) ─────────────────────────────────── */

function buildPrompt(f: FailureAnalysis): string {
  return [
    "You are a senior QA engineer analyzing a Playwright test failure on verkkokauppa.com (Finnish electronics retailer).",
    "",
    "## Failed Test",
    "- **Name:** " + f.testName,
    "- **File:** " + f.filePath + ":" + f.line,
    "- **Duration:** " + f.duration + "ms",
    "- **Type:** " + f.failureType,
    "",
    "## Error",
    "```",
    f.errorMessage,
    "```",
    "",
    "## Stack Trace (truncated)",
    "```",
    f.stackTrace.substring(0, 1500),
    "```",
    "",
    "## Source Context",
    "```typescript",
    f.sourceContext,
    "```",
    "",
    "## Rule-Based Analysis",
    "- **Root Cause:** " + f.rootCause,
    "- **Suggested Fix:** " + f.suggestedFix,
    "",
    "Provide a concise, actionable analysis:",
    "1. **Root Cause** -- what specifically went wrong and why?",
    "2. **Bug or test issue?** -- is the app broken, or does the test need updating?",
    "3. **Recommended Fix** -- exact code change or approach.",
    "4. **Prevention** -- how to avoid this in the future.",
    "",
    "Be specific to this test and e-commerce context. Keep it brief.",
  ].join("\n");
}

async function analyzeWithGemini(failure: FailureAnalysis): Promise<string | undefined> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;

  const model = "gemini-2.5-flash";
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent?key=" +
    apiKey;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(failure) }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error("Gemini API " + res.status + ": " + body);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? undefined;
  } catch (err: any) {
    console.warn("  Gemini analysis skipped: " + err.message);
    return undefined;
  }
}

/* ── 7. Markdown report ─────────────────────────────────────────────────── */

function generateReport(
  analyses: FailureAnalysis[],
  totalTests: number,
  passedTests: number,
  totalDuration: number,
): string {
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : "0.0";
  const durationSec = (totalDuration / 1000).toFixed(1);

  const lines: string[] = [
    "# AI Test Failure Analysis Report",
    "",
    "> Generated on " + new Date().toISOString(),
    "",
    "| Metric | Value |",
    "|--------|-------|",
    "| Total Tests | " + totalTests + " |",
    "| Passed | " + passedTests + " |",
    "| Failed | " + analyses.length + " |",
    "| Pass Rate | " + passRate + "% |",
    "| Duration | " + durationSec + "s |",
    "",
  ];

  if (analyses.length === 0) {
    lines.push("## All tests passed!");
    return lines.join("\n");
  }

  // Type summary table
  lines.push("## Failures by Type", "", "| Type | Count | Priority |", "|------|-------|----------|");
  const counts = new Map<string, FailureAnalysis[]>();
  for (const a of analyses) {
    const arr = counts.get(a.failureType) ?? [];
    arr.push(a);
    counts.set(a.failureType, arr);
  }
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  for (const [type, items] of counts) {
    const top = items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])[0];
    lines.push("| " + type + " | " + items.length + " | " + top.priority.toUpperCase() + " |");
  }
  lines.push("", "---", "");

  // Individual failures
  for (let i = 0; i < analyses.length; i++) {
    const a = analyses[i];
    lines.push(
      "## Failure " + (i + 1) + ": " + a.testName,
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Suite | " + a.suiteName + " |",
      "| File | " + a.filePath + ":" + a.line + " |",
      "| Duration | " + (a.duration / 1000).toFixed(1) + "s |",
      "| Type | " + a.failureType + " |",
      "| Priority | **" + a.priority.toUpperCase() + "** |",
      "",
      "### Error",
      "```",
      a.errorMessage.substring(0, 500),
      "```",
      "",
      "### Source Context",
      "```typescript",
      a.sourceContext,
      "```",
      "",
      "### Root Cause",
      a.rootCause,
      "",
      "### Suggested Fix",
      a.suggestedFix,
      "",
    );

    if (a.screenshots.length) {
      lines.push("### Screenshots");
      for (const s of a.screenshots) lines.push("- " + s);
      lines.push("");
    }

    if (a.llmAnalysis) {
      lines.push("### Gemini Analysis", "", a.llmAnalysis, "");
    }

    lines.push("---", "");
  }

  return lines.join("\n");
}

/* ── 8. Console summary ─────────────────────────────────────────────────── */

function printSummary(analyses: FailureAnalysis[], totalTests: number): void {
  const passed = totalTests - analyses.length;
  const gemini = !!process.env.GEMINI_API_KEY;
  const sep = "=".repeat(60);

  console.log("\n" + sep);
  console.log("  TEST FAILURE ANALYZER -- RESULTS");
  console.log(sep + "\n");
  console.log("  Tests:  " + passed + " passed, " + analyses.length + " failed, " + totalTests + " total");
  console.log("  Mode:   " + (gemini ? "Gemini-enhanced (gemini-2.5-flash)" : "Rule-based") + "\n");

  if (analyses.length === 0) {
    console.log("  All tests passed!\n");
    return;
  }

  const icons: Record<string, string> = { critical: "[!!]", high: "[! ]", medium: "[- ]", low: "[  ]" };
  for (const a of analyses) {
    console.log("  " + icons[a.priority] + " [" + a.priority.toUpperCase() + "] " + a.testName);
    console.log("     Type:  " + a.failureType);
    console.log("     File:  " + a.filePath + ":" + a.line);
    console.log("     Cause: " + a.rootCause.substring(0, 120) + "\n");
  }

  console.log("  Full report: test-results/failure-analysis.md\n");
}

/* ── Main ───────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("============================================================");
  console.log("  AI-Powered Test Failure Analyzer");
  console.log("============================================================\n");

  const gemini = !!process.env.GEMINI_API_KEY;
  console.log(
    gemini
      ? "GEMINI_API_KEY detected -- Gemini-enhanced analysis enabled.\n"
      : "No GEMINI_API_KEY -- using rule-based analysis only.\n",
  );

  // 1. Run tests
  const report = runTests();

  // 2. Extract failures
  const failures = extractFailures(report);

  // Count totals
  let totalTests = 0;
  let passedTests = 0;
  let totalDuration = 0;

  function countTests(suites: Suite[]): void {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          totalTests++;
          const last = test.results[test.results.length - 1];
          if (last) {
            totalDuration += last.duration;
            if (last.status === "passed") passedTests++;
          }
        }
      }
      if (suite.suites) countTests(suite.suites);
    }
  }
  countTests(report.suites);

  console.log("Results: " + passedTests + " passed, " + failures.length + " failed, " + totalTests + " total\n");

  if (failures.length === 0) {
    console.log("All tests passed!\n");
    const md = generateReport([], totalTests, passedTests, totalDuration);
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync("test-results/failure-analysis.md", md);
    return;
  }

  console.log("Analyzing " + failures.length + " failure(s) ...\n");

  // 3-6. Analyze each failure
  const analyses: FailureAnalysis[] = [];

  for (const f of failures) {
    const errorMessage = stripAnsi(f.result.error?.message ?? "(no error message)");
    const stackTrace = stripAnsi(f.result.error?.stack ?? "");
    const failureType = classifyFailure(errorMessage, stackTrace);
    const sourceContext = readSourceContext(f.filePath, stackTrace);
    const rules = analyzeWithRules(failureType, errorMessage);

    const screenshots = (f.result.attachments ?? [])
      .filter((a) => a.contentType.startsWith("image/"))
      .map((a) => a.path ?? "(embedded)")
      .filter(Boolean);

    const analysis: FailureAnalysis = {
      testName: f.testName,
      suiteName: f.suiteName,
      filePath: f.filePath,
      line: f.line,
      duration: f.result.duration,
      errorMessage,
      stackTrace,
      failureType,
      ...rules,
      sourceContext,
      screenshots,
    };

    analysis.llmAnalysis = await analyzeWithGemini(analysis);
    analyses.push(analysis);
  }

  // 7. Write report
  const md = generateReport(analyses, totalTests, passedTests, totalDuration);
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/failure-analysis.md", md);

  // 8. Print summary
  printSummary(analyses, totalTests);
}

main().catch((err) => {
  console.error("Agent failed:", err);
  process.exit(1);
});
