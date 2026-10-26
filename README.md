# HouseWorthIt

A home-buying readiness website, rebuilt around household income, debt, savings, and the full cost of ownership. Includes a responsive calculator, local scenario comparison, personal accounts, saved financial profiles, and private document uploads.

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

Ports differ from Everyday Support Services. Both processes default to loopback only. Root `pnpm dev` first builds the shared calculation package; after editing that package, restart the command or rebuild it. `pnpm build` builds all packages. Production process commands are `pnpm --filter @houseworthit/api start` and `pnpm --filter @houseworthit/web start`.

## What works

- Fixed-rate mortgage amortization including zero interest and all-cash purchases.
- Property tax, home insurance, HOA, estimated PMI, maintenance reserve, and closing costs.
- Household income, monthly debt, purchase savings, DTI, estimated savings gap, and a maximum planning price constrained by 28% housing / 36% total-debt benchmarks and available cash (within a $10,000–$10 million search range).
- Up to three calculator scenarios saved to the current browser (separate from accounts).
- Registration, login, logout, persisted financial profiles, and permanent self-service account deletion.
- Private PDF/JPEG/PNG upload, list, authenticated download, and deletion; maximum 10 MB/file and 20 files/user.
- Shared input-validated calculation engine exposed as `POST /v1/estimate`.

## Financial assumptions

Starting values are examples, not market quotes or lender decisions. The engine models a fixed-rate, fully amortizing loan. DTI includes principal, interest, tax, insurance, HOA, estimated PMI, and other debts, divided by gross monthly income. Maintenance reserves appear in ownership costs but not DTI. A 36% benchmark is a planning indicator; actual program limits vary. See [Fannie Mae's DTI guidance](https://selling-guide.fanniemae.com/sel/b3-6-02/debt-income-ratios).

Credit range and employment are self-reported preparation data. The app does not pull credit, verify income, automatically review documents, approve loans, generate preapproval letters, or send data to lenders. It does not model utilities, income taxes, PMI cancellation over time, escrow adjustments, prepaid interest, loan program rules, or emergency reserves. The account snapshot labels its fixed example assumptions; use the main calculator to vary them. ZIP is recorded as a goal and does not fetch tax rates or listings.

## Storage and security

The API creates `.data/houseworthit.sqlite` and `.data/document.key` outside the public web directory. `.data` is ignored by Git. Set API `DATA_DIRECTORY` to an absolute durable private directory when hosting. Back up the database and encryption key together with the API stopped; losing the key makes documents unrecoverable. Store backups and the key with appropriate filesystem access controls. SQLite profile fields are not encrypted by the app; documents use AES-256-GCM with owner/document-bound authenticated data. The local key is generated on first start and kept separately from the database, on the same filesystem by default.

Passwords are salted and scrypt-hashed. Random session tokens are hashed in the database and expire after eight hours. Cookies are HttpOnly and SameSite=Strict, scoped to `/api`, and Secure when `NODE_ENV=production`. Mutation requests require a custom header; the Next proxy also checks browser request origins. Private API responses disable caching. All user queries scope records by the server session's user ID. Auth attempts are rate-limited by API client IP and email; the reverse proxy currently appears as one IP, so distributed production traffic needs a trusted per-client rate-limiting layer.

File contents are checked for supported signatures, MIME, and extensions, encrypted, and served as attachments with `nosniff`. This is not antivirus scanning or full document validation. Profile edits and documents never grant user or administrator permissions. There is no administrator interface or lender sharing.

## Before production hosting

This delivery pushes source to GitHub; it does not replace the live domain or deploy services. Configure HTTPS, a durable private data volume, access-controlled backups and key management, operational monitoring, per-client rate limiting, a reviewed privacy/retention policy, and a malware-scanning workflow before accepting real financial documents. The current SQLite deployment requires one API instance with persistent storage; do not place it on ephemeral storage or scale it across independent replicas. Authentication has no email verification, MFA, or email password recovery yet. These are follow-up production capabilities, not simulated UI actions.

`apps/web` uses server-only `API_URL` (default `http://127.0.0.1:4400`) to proxy `/api/*`. Never expose the API directly in production; bind to private networking and terminate public traffic at the web/reverse proxy. Set `NODE_ENV=production` on both services; serve the web through HTTPS. Set `PORT` and `HOST` for API binding as needed. The bundled Next start script uses local port 3400; use a managed reverse proxy or adjust deployment configuration for the target host.

## Verification

```powershell
pnpm check
```

Runs TypeScript checks, calculation and isolated API integration tests, and production builds. Integration tests use disposable temporary storage and never touch `.data` or Everyday Support Services.
