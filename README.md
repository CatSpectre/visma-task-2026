# Visma Test Assignment

Automated browser tests for [verkkokauppa.com](https://www.verkkokauppa.com) built with **Playwright** and **TypeScript**.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 8

## Setup

```bash
# Install project dependencies
npm install

# Install Playwright browsers
npx playwright install chromium --with-deps
```

## Running the tests
In all cases it should open the report automatically in the browser after the run.

```bash
# Run tests in headless mode
npm test

# Run tests in headed mode (visible browser)
npm run test:headed

# Run tests in debug mode (step through)
npm run test:debug

# View the HTML report after a run
npm run report
```

## Configuration

The website URL is **configurable** via environment variable or `.env` file:

### Using an environment variable

```bash
BASE_URL=https://www.verkkokauppa.com npm test
```

### Using a `.env` file

Copy the example and edit as needed:

```bash
cp .env.example .env
```

## CI Pipeline

A **GitHub Actions** workflow is included at `.github/workflows/playwright.yml`. It runs automatically on:

- Pushes to `main`
- Pull requests targeting `main`
- Manual dispatch from the Actions tab

The workflow installs dependencies, runs the Playwright tests, and uploads the HTML report as an artifact.

## Project structure

```
├── .github/workflows/
│   └── playwright.yml                # CI pipeline
├── agents/
│   └── failure-analyzer.ts           # AI-powered test failure analyzer agent
├── tests/
│   ├── helpers.ts                    # Shared utilities (cookie consent, search)
│   ├── search-sort-nikon.spec.ts   # Test 1: Nikon search, sort & assert
├── .env.example                      # Example environment config
├── .gitignore
├── package.json
├── playwright.config.ts              # Playwright configuration
├── tsconfig.json
└── README.md
```

---

## What the tests do

### Part 1: Test 1 – Nikon Search and Sort 

1. Opens the verkkokauppa.com website.
2. Searches for **"Nikon"**.
3. Sorts the results from **highest to lowest price**.
4. Selects the **second product** from the sorted list and clicks it.
5. **Asserts** that the product title includes the text **"Nikon Z30"**.

### Part 2
