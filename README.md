# HouseWorthIt

A home-buying readiness website, rebuilt around household income, debt, savings, and the full cost of ownership. Includes a responsive calculator, local scenario comparison, personal accounts, saved financial profiles, and private document uploads.

Live website: **https://www.houseworthit.com**. Google fallback: **https://houseworthit-3ps6xhuf7a-uc.a.run.app**. Hosting uses Cloud Run with Neon PostgreSQL and private encrypted Google Cloud Storage. The Hostinger domain is verified and mapped; the `www` HTTPS certificate is ready, while the apex certificate remains pending at the latest check. See [deployment details](docs/deployment-google-cloud.md) and [Hostinger domain setup](docs/domain-hostinger.md).

The browser icon uses the project's green house mark: SVG for modern browsers, a multi-size 16/32/48px ICO fallback, and a 180px Apple touch icon. Regenerate the raster formats after changing `apps/web/app/icon.svg` with `node scripts/generate-icons.mjs`.

## Stack

Matches the foundation in `C:\everydaysupportservices`: Node 24.19, pnpm 12.5.1 workspace, TypeScript 5.9.3, Next.js 16.3.5 App Router, React 19.3, plain CSS, and NestJS 12.0.4. Node's built-in SQLite provides local persistence. No source, accounts, credentials, or private records were copied from the reference project.

## Run locally

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

- Website: http://127.0.0.1:3400
- Account: http://127.0.0.1:3400/account
- API health: http://127.0.0.1:4400/v1/health

## Appearance and market context

Use **Appearance** in the calculator or account header to choose Light, Dark, or System. System follows the operating system. The browser saves this project-specific preference, applies it before page hydration, and synchronizes it across tabs. If browser storage is blocked, the selection still works for the current page session. It is separate from account data and other projects' appearance settings.

The compact market strip below the header displays the latest published U.S. 30-year fixed mortgage interest-rate average (Freddie Mac PMMS, FRED `MORTGAGE30US`) and 10-year constant-maturity U.S. Treasury yield (Federal Reserve H.15, FRED `DGS10`). Only the labels and percentages are visible; each source link has a tooltip with its publication date and context. The mortgage figure is **not APR**; APR includes certain fees. The Treasury figure is a yield, not a bond price. Data is not real time, and these series have different publication schedules.

The server-only `/api/market` endpoint fetches allowlisted public FRED series pages, validates the labeled latest observations, and caches upstream responses for up to one hour. It sends no user profile or documents to FRED. A source markup change or outage displays a dash rather than invented rates. Mortgage observations older than 10 days and Treasury observations older than 5 days are marked older publications in their tooltips. The strip does not change calculator assumptions.

Ports differ from Everyday Support Services. Both processes default to loopback only. Root `pnpm dev` first builds the shared calculation package; after editing that package, restart the command or rebuild it. `pnpm build` builds all packages. Production process commands are `pnpm --filter @houseworthit/api start` and `pnpm --filter @houseworthit/web start`.

## What works

- Fixed-rate mortgage amortization including zero interest and all-cash purchases.
- Property tax, home insurance, HOA, estimated PMI, maintenance reserve, and closing costs. The results show down payment and closing costs separately, an editable closing cost allowance as a percentage of home price, and total estimated cash to close.
- Household income, monthly debt, purchase savings, DTI, estimated savings gap, and a maximum planning price constrained by 28% housing / 36% total-debt benchmarks and available cash (within a $10,000–$10 million search range).
- Estimated LTV, housing-to-income ratio, purchase savings remaining after estimated closing, and monthly breathing room using optional take-home pay and living-expense inputs. Negative results show cash or monthly shortfalls.
- Up to three calculator scenarios saved to the current browser (separate from accounts).
- **Export CSV** downloads the current home assumptions, household finance inputs, monthly costs, closing cost breakdown, financial indicators and income-based budget as `houseworthit-home-plan.csv`. The file uses UTF-8 with a BOM and quoted comma-separated columns for Excel compatibility. Amounts use unformatted numeric values with a separate unit column; missing optional budget values stay blank with explanatory notes. The download is generated in the browser without sending these inputs to a server.
- Registration, login, logout, persisted financial profiles, and permanent self-service account deletion.
- Private PDF/JPEG/PNG upload, list, authenticated download, and deletion; maximum 10 MB/file and 20 files/user.
- Shared input-validated calculation engine exposed as `POST /v1/estimate`.

## Financial assumptions

Starting values are examples, not market quotes or lender decisions. The engine models a fixed-rate, fully amortizing loan. DTI includes principal, interest, tax, insurance, HOA, estimated PMI, and other debts, divided by gross monthly income. Maintenance reserves appear in ownership costs but not DTI. A 36% benchmark is a planning indicator; actual program limits vary. See [Fannie Mae's DTI guidance](https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios).

The financial picture uses the same scenario and finance inputs as DTI. Estimated LTV is loan principal divided by the purchase price; this is a planning proxy because appraised values and lender rules may differ. The housing ratio uses the modeled housing payment, excluding maintenance and other debts, divided by gross monthly income. Zero income leaves both ratios unavailable. Cash after closing subtracts modeled cash to close from purchase savings and preserves shortfalls. Monthly breathing room subtracts full ownership costs (including maintenance), other debts, and entered living expenses from monthly take-home pay. Both optional budget amounts start blank; the result remains unavailable until both are entered, and zero is a valid amount. Users should include utilities and other recurring spending without double-counting rent, modeled home costs or debts. These calculator inputs are page-local and are not added to account profiles or saved home scenarios.

Credit range and employment are self-reported preparation data. The app does not pull credit, verify income, automatically review documents, approve loans, generate preapproval letters, or send data to lenders. It does not automatically estimate utilities or income taxes, PMI cancellation over time, escrow adjustments, prepaid interest, loan program rules, or emergency reserves. The account snapshot labels its fixed example assumptions; use the main calculator to vary them. ZIP is recorded as a goal and does not fetch tax rates or listings.

## Storage and security

The API creates `.data/houseworthit.sqlite` and `.data/document.key` outside the public web directory. `.data` is ignored by Git. Set API `DATA_DIRECTORY` to an absolute durable private directory when hosting. Back up the database and encryption key together with the API stopped; losing the key makes documents unrecoverable. Store backups and the key with appropriate filesystem access controls. SQLite profile fields are not encrypted by the app; documents use AES-256-GCM with owner/document-bound authenticated data. The local key is generated on first start and kept separately from the database, on the same filesystem by default.

Passwords are salted and scrypt-hashed. Random session tokens are hashed in the database and expire after eight hours. Cookies are HttpOnly and SameSite=Strict, scoped to `/api`, and Secure when `NODE_ENV=production`. Mutation requests require a custom header; the Next proxy also checks browser request origins. Private API responses disable caching. All user queries scope records by the server session's user ID. Auth attempts are rate-limited by API client IP and email; the reverse proxy currently appears as one IP, so distributed production traffic needs a trusted per-client rate-limiting layer.

File contents are checked for supported signatures, MIME, and extensions, encrypted, and served as attachments with `nosniff`. This is not antivirus scanning or full document validation. Profile edits and documents never grant user or administrator permissions. There is no administrator interface or lender sharing.

## Before production hosting

The Google deployment uses HTTPS, durable Neon storage, private Cloud Storage, a Secret Manager encryption key, and persistent authentication throttling. The local SQLite mode still requires a durable private volume if hosted elsewhere; Cloud Run refuses that mode. Review operational monitoring, backups and retention, a business privacy policy, and malware scanning before accepting customer financial documents. Authentication has no email verification, MFA, or email password recovery yet. These are follow-up production capabilities, not simulated UI actions.

`apps/web` uses server-only `API_URL` (default `http://127.0.0.1:4400`) to proxy `/api/*`. Never expose the API directly in production; bind to private networking and terminate public traffic at the web/reverse proxy. Set `NODE_ENV=production` on both services; serve the web through HTTPS. Set `PORT` and `HOST` for API binding as needed. The bundled Next start script uses local port 3400; use a managed reverse proxy or adjust deployment configuration for the target host.

## Verification

```powershell
pnpm check
```

Runs TypeScript checks, calculation and isolated API integration tests, and production builds. Integration tests use disposable temporary storage and never touch `.data` or Everyday Support Services.
