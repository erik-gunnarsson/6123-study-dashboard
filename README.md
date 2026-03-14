# 6123 Study Dashboard

Static study dashboard for the finance exercise handbook. It serves handbook questions in weighted-random order, stores attempts locally in the browser, and shows section-level weakness.

## Run locally

1. `npm run build:catalog`
2. `npm run serve`
3. Open [http://localhost:4173](http://localhost:4173)

## Notes

- Progress is stored in IndexedDB per browser.
- Profiles are lightweight local identities, not real accounts.
- The initial catalog is generated from `exercise handbook solutions.xlsx`.
- Prompt text is intentionally marked as a placeholder where the original PDF wording still needs manual refinement.
