# Visma Test Assignment

Automated browser tests for [verkkokauppa.com](https://www.verkkokauppa.com) built with **Playwright** and **TypeScript**.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 8

## Setup
Tried on WSL

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

### Running individual tests

```bash
# Test 1 – Nikon Search and Sort
npx playwright test search-and-sort

# Test 2 – Faceted Search and Filter Persistence
npx playwright test faceted-search

# Test 3 – Add to Cart and Checkout
npx playwright test add-to-cart

# Test 4 – Product Comparison via Category Navigation
npx playwright test product-comparison
```

Add `--headed` to any command above to watch the browser as it runs.

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
│   ├── search-and-sort.spec.ts       # Test 1: Nikon search, sort & assert
│   ├── faceted-search.spec.ts        # Test 2: Faceted search & filter persistence
│   ├── add-to-cart.spec.ts           # Test 3: Add to cart & checkout
│   └── product-comparison.spec.ts    # Test 4: Product comparison via categories
├── .env.example                      # Example environment config
├── .gitignore
├── package.json
├── playwright.config.ts              # Playwright configuration
├── tsconfig.json
└── README.md
```

---

## What the tests do

### Test 1 – Nikon Search and Sort (`search-and-sort.spec.ts`)

1. Opens the verkkokauppa.com website.
2. Searches for **"Nikon"**.
3. Sorts the results from **highest to lowest price**.
4. Selects the **second product** from the sorted list and clicks it.
5. **Asserts** that the product title includes the text **"Nikon Z30"**.

### Test 2 – Faceted Search and Filter Persistence (`faceted-search.spec.ts`)

**What the test does:**

1. Searches for **"puhelin"** (phone).
2. Expands the **"Brändit"** (Brand) filter in the sidebar and selects **"Apple"**.
3. **Asserts** the URL updates to include the brand filter parameter (`filter[brand]=...`).
4. **Asserts** that every visible product in the results contains **"Apple"** in its title.
5. Navigates to the **first product** detail page.
6. Clicks **Back** to return to the filtered results.
7. **Asserts** that the brand filter is still active in the URL and the results still show only Apple products.

**Why this is a good candidate for automation:**

Testing filters manually is incredibly tedious and prone to human error, as it requires checking specific data attributes against a large set of  results. Automation can instantly validate that the logic behind the product grid remains sound across filter combinations.

### Test 3 – Add to Cart and Checkout (`add-to-cart.spec.ts`)

**What the test does:**

1. Searches for **"MacBook Air"**.
2. Opens the **first product** from the results.
3. Clicks **"Lisää ostoskoriin"** (Add to cart).
4. Navigates to the **shopping cart** (`/fi/cart`).
5. Clicks **"Siirry kassalle"** (Proceed to checkout).
6. **Asserts** that the login prompt appears with the text: **"Jatka tilaamista kirjautumalla sisään sähköpostiosoitteella ja salasanalla."**

**Why this is a good candidate for automation:**

The add-to-cart → checkout flow is the most critical user journey in e-commerce. A broken button or missing redirect means zero sales!

### Test 4 – Product Comparison via Category Navigation (`product-comparison.spec.ts`)

**What the test does:**

1. Navigates from the homepage: **Tietotekniikka → Tietokoneiden komponentit → RAM-muistit**.
2. Selects the **first two products** for comparison using their compare buttons.
3. Clicks the **comparison link** ("Siirry tuotevertailusivulle") in the floating comparison bar.
4. **Asserts** that the comparison view displays the heading **"Tuotevertailu"**.
5. **Asserts** that **both selected product titles** are visible in the comparison view.

**Why this is a good candidate for automation:**

Product comparison is a core feature in verkkokauppa.com, especially for technical products. The test involves category navigation, UI state management (the floating comparison bar), and a dedicated comparison view. Multiple components that can break independently after deployments. Automated tests ensure the feature works end-to-end on every build.
