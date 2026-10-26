# HouseWorthIt on Google Cloud

Deployed October 26, 2026. Project `houseworthit-20261026`, region `us-central1`.

Live URL: https://houseworthit-3ps6xhuf7a-uc.a.run.app

Alternate Google URL: https://houseworthit-175982497615.us-central1.run.app

One Cloud Run service, `houseworthit`, serves Next.js publicly. Its NestJS account API binds only to loopback inside the same container and is reached through the Next.js `/api/*` proxy. The runtime uses one CPU, 1 GiB memory, request-based billing, zero minimum instances, at most one service instance, and concurrency eight. It can cold-start after idle periods.

The user selected usage-based Google hosting with the free allowances and accepted that usage beyond those allowances can be billed. The existing billing account is reused. Free allowances are shared across its projects; the maximum instance count is not a monetary spending cap. Builds, source/image storage, documents, secrets, logs, and network traffic may also incur charges. No Neon plan upgrade was performed. See [Cloud Run pricing](https://cloud.google.com/run/pricing).

## Durable storage

- Database: `houseworthit` in the existing Ablest Neon project (`nameless-frost-31224887`), AWS US East 1. Capacity is shared with the existing applications; HouseWorthIt tables are separate.
- Restricted login: `houseworthit_app_20261026`, without role-creation or database-creation permission. Public connection access to the HouseWorthIt database is revoked; the application receives explicit schema permissions.
- Accounts, hashed passwords, hashed session tokens, financial profile data, document metadata, encryption nonces/tags, and authentication throttling counters persist in Neon PostgreSQL.
- Encrypted document bytes persist in private Google Cloud Storage bucket `houseworthit-20261026-documents`. Public access prevention and uniform bucket-level access are enabled. There are no public or signed download links; downloads require the owning account's session through the application.
- Documents retain the existing AES-256-GCM encryption with owner/document-bound authenticated data. The encryption key is injected from Google Secret Manager, separately from the bucket and database.
- Secrets: `houseworthit-database-url:1` and `houseworthit-document-key:1`. Keep the encryption key: losing it makes existing documents unreadable. Do not rotate it without a document re-encryption migration.
- The runtime identity `hwi-runtime` can access those two secrets and document objects in its own bucket. It has no Firestore permission; Firestore was not used or provisioned as a database.

Local SQLite records and local document keys remain independent. No existing application records, credentials, or local records were imported into the hosted site. Local development retains the SQLite implementation. Cloud Run startup refuses to use ephemeral SQLite storage.

## Verified behavior

The cloud container build and TypeScript checks passed. All nine local regression tests passed. The deployed HTTPS verification checked registration, secure cookies, profile persistence, account isolation, encrypted file round-trip, foreign-origin request rejection, sign-in, logout, and deletion. A second Cloud Run revision confirmed that the session, profile, document metadata, and uploaded file survived a process restart. Both published market observations were available. All synthetic verification accounts and their active document objects were removed. Permission-metadata checks confirmed that the HouseWorthIt login has no readable application tables in the Ablest or Everyday databases and has no superuser, database-creation, or role-creation rights. The document bucket reports public access prevention enforced and a seven-day soft-delete retention window.

Authentication still has no email verification, MFA, or email password-recovery delivery. Documents are checked for signatures, MIME, and size; no antivirus scanning or lender verification is claimed. Google Storage's soft-delete retention and any operator backups can retain encrypted deleted object versions for their configured retention window. Review the business's privacy/retention policy before inviting customers to upload financial documents.

## Redeploy

The existing Google CLI is `C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd`. Do not change its global project setting.

```powershell
pnpm test
.\deploy\cloud-run\deploy.ps1 -BuildOnly
```

The script validates an allowlist of source files, excludes `.data`, credentials, local databases, dependencies, and Git history, then submits a build asynchronously. Read `.data/cloud-run/build-result.json`, verify that build succeeded with `gcloud builds describe`, then deploy its recorded image:

```powershell
$build = Get-Content .data/cloud-run/build-result.json -Raw | ConvertFrom-Json
.\deploy\cloud-run\deploy.ps1 -ExistingImage $build.image
$deployment = Get-Content .data/cloud-run/deployment-result.json -Raw | ConvertFrom-Json
node deploy/cloud-run/verify-hosted.mjs $deployment.webUrl --restart
```

`verify-hosted.mjs` creates only synthetic accounts and files and removes them afterward. `--restart` creates a new service revision to verify persistence. It does not modify real users.

The operator-only `provision-neon.mjs` creates the isolated role/database and secrets once. It reads the existing administrative Neon connection from the operator's environment file, retains credentials in process memory, and passes secret payloads to Google through stdin. It never prints payloads. Normal deployments reuse pinned secret references and do not require Neon administration credentials.

## Hostinger domain

`houseworthit.com` remains registered and managed at Hostinger. Ownership verification and Cloud Run mappings are complete; the domain owner updated the website DNS. Trusted HTTPS on `www.houseworthit.com` returned HTTP 200. The apex certificate remains pending at the latest check. See [domain setup](domain-hostinger.md) for the exact records and status.
