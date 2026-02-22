# Did not finish
## Part 3: AI-Powered Test Failure Analyzer Agent

### What problem does it solve?

When Playwright tests fail, developers spend significant time **manually diagnosing** root causes: reading stack traces, comparing expected vs. actual values, inspecting failure screenshots, and determining whether a failure is a real bug, a flaky selector, a data-dependent issue, or an infrastructure timeout.

This is especially painful on **live e-commerce sites** like verkkokauppa.com where:
- Product catalog data changes constantly (prices, stock, sort order)
- Page structure may be updated without warning
- Timeouts can be caused by rate limiting, slow CDNs, or CI resource constraints
- The same failure can have very different root causes depending on context

**The agent eliminates this manual triage work** by automatically classifying failures, reading source code context, and generating actionable fix suggestions.

### How does it work?

The agent operates in a **5-stage pipeline**:

1. **Run** — Executes the Playwright test suite with JSON reporter to capture structured results.
2. **Extract** — Walks the JSON report tree to find all failed tests, including error messages, stack traces, durations, and screenshot attachments.
3. **Classify** — Pattern-matches each error against known failure categories:
   - `ASSERTION_MISMATCH` — expected vs. actual value mismatch
   - `SELECTOR_NOT_FOUND` — DOM element not found (page structure changed)
   - `TIMEOUT` — operation exceeded time limit
   - `NAVIGATION_ERROR` — page navigation failed
   - `NETWORK_ERROR` — connection-level failure
4. **Analyze** — Applies category-specific heuristic rules to determine root cause and generate fix suggestions. For assertion mismatches, it compares expected/received values to detect data-dependent failures (e.g., both values are from the same brand but different products).
5. **Enhance** *(optional)* — When `GEMINI_API_KEY` or `OPENAI_API_KEY` is set, sends the full failure context (error, source code, classification) to the configured LLM (Gemini 2.5 Flash or GPT-4o) for deeper natural-language analysis with domain-specific suggestions.

The agent outputs:
- A **structured Markdown report** at `test-results/failure-analysis.md`
- A **color-coded console summary** with priority levels

### Usage

```bash
# Run with rule-based analysis (no API key needed)
npm run analyze

# Run with LLM-enhanced analysis (Google Gemini)
GEMINI_API_KEY=... npm run analyze

# Run with LLM-enhanced analysis (OpenAI)
OPENAI_API_KEY=sk-... npm run analyze
```

### Demo output

Running `npm run analyze` against the test suite produces:

```
╔══════════════════════════════════════════════════════════════╗
║     🤖 AI-Powered Test Failure Analyzer Agent              ║
║     Analyzes Playwright test failures automatically        ║
╚══════════════════════════════════════════════════════════════╝

ℹ️  No LLM API key set — using rule-based analysis.
   Set GEMINI_API_KEY or OPENAI_API_KEY to enable LLM-enhanced analysis.

🔬 Running Playwright tests with JSON reporter...

📊 Test run complete: 4 passed, 1 failed, 5 total

🔍 Analyzing 1 failure(s)...

══════════════════════════════════════════════════════════════════════
  🤖 TEST FAILURE ANALYZER — RESULTS
══════════════════════════════════════════════════════════════════════

  Tests:    4 passed, 1 failed, 5 total
  Mode:     Rule-based analysis

  🟡 [MEDIUM] Search for Nikon, sort by highest price, and verify second product is Nikon Z30
     Type:   ASSERTION_MISMATCH
     File:   verkkokauppa-search.spec.ts:5
     Cause:  Data-dependent assertion failure. The test expected "Nikon Z30"
             but the live site returned "Nikon NIKKOR Z 400mm f/2.8 TC VR S..."

  📄 Full report: test-results/failure-analysis.md
```

The generated `failure-analysis.md` report contains:

- **Failure summary table** — total tests, pass rate, duration
- **Classification** — `ASSERTION_MISMATCH` at `MEDIUM` priority
- **Root cause** — "Data-dependent assertion failure. Both values are from the same brand, suggesting the product catalog ordering has changed (prices or inventory updated, changing which product appears at position N)."
- **Source code context** — the exact failing line with ±7 lines of surrounding code
- **3 actionable fix options**:
  1. Loosen the assertion to check for the brand name instead of a specific model
  2. Mock the API response for deterministic testing
  3. Verify structural behaviors (sort order) instead of exact product identity
- **Screenshot path** — link to the failure screenshot for visual inspection