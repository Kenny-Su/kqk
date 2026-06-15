# KQK

KQK is a local-first SEC filing viewer.

## What It Does

* Add a company by ticker or CIK.
* Fetch recent 10-K, 10-Q, and 8-K filings from SEC EDGAR.
* Cache filing HTML locally.
* Show when each cached filing was last updated.
* Display cached SEC HTML in the app.
* Open the original SEC filing page.
* Refresh recent filings from SEC.
* Delete a company and its cached filing data.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## SEC User-Agent

Set `SEC_USER_AGENT` for SEC requests:

```bash
SEC_USER_AGENT="KQK local filing viewer contact: you@example.com" npm run dev
```

Local database and cached filings are stored in `data/`.
