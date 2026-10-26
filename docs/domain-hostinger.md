# Connect houseworthit.com from Hostinger

The Google website is already live at https://houseworthit-3ps6xhuf7a-uc.a.run.app.

As of October 26, 2026, Google does not yet list `houseworthit.com` as verified for the deployment account. No Cloud Run custom-domain mapping exists. The Site Verification API returned HTTP 403 for the current command-line credential, so an ownership token could not be retrieved through that credential. Browser control stopped because it could not verify the current browser URL; no Hostinger DNS edits were made.

## Complete ownership verification

1. Open [Google Search Console](https://search.google.com/search-console/welcome) with the Google account used for deployment.
2. Add a **Domain** property for `houseworthit.com` and copy the Google-provided verification TXT value.
3. In Hostinger, open this domain's **DNS / Nameservers** and add that TXT record at `@`. Keep the existing website records during verification.
4. Return to Google Search Console and verify ownership. Keep the verification TXT record afterward.

## Map the website and obtain the exact Google records

In [Cloud Run domain mappings](https://console.cloud.google.com/run/domains?project=houseworthit-20261026), add `houseworthit.com` to service `houseworthit`, region `us-central1`. Add `www.houseworthit.com` as well if desired. Use the DNS records returned for those mappings; do not infer the records from another application's deployment.

The application validates browser writes against the public HTTPS host and supports its Google and custom-domain origins without exposing the loopback API.

After Google returns the mapping records, replace only the old website A/AAAA/CNAME records with the matching Google values in Hostinger. Preserve verification TXT, email MX/TXT/DKIM, CAA, unrelated records, and the existing nameservers. Verify authoritative/public DNS, mapping readiness, and Google-managed HTTPS before considering the domain cutover complete.

Observed pre-cutover DNS, saved for review:

| Type | Name | Existing value |
| --- | --- | --- |
| NS | @ | ns1.dns-parking.com |
| NS | @ | ns2.dns-parking.com |
| A | @ | 212.85.28.155 |
| AAAA | @ | 2a02:4780:1:549:0:358e:7453:3 |

These are the old site's records, not deployment targets. Google certificate provisioning starts after the correct mapping and DNS configuration and may take time. Until it is ready, use the working Google URL.
