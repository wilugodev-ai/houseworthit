# Connect houseworthit.com from Hostinger

The Google website is already live at https://houseworthit-3ps6xhuf7a-uc.a.run.app.

Google ownership was verified on October 26, 2026. Both `houseworthit.com` and `www.houseworthit.com` now map to the `houseworthit` Cloud Run service. The domain owner completed the Hostinger website record changes. Google reports `www` Ready=True and CertificateProvisioned=True, and trusted HTTPS returned HTTP 200. The apex certificate remains pending at the latest check.

## Google-issued DNS records

In Hostinger, replace the old root website A/AAAA records and the `www` CNAME with these records. Use TTL 300. Keep the Google verification TXT, mail records, unrelated records, and existing nameservers.

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 216.239.32.21 |
| A | @ | 216.239.34.21 |
| A | @ | 216.239.36.21 |
| A | @ | 216.239.38.21 |
| AAAA | @ | 2001:4860:4802:32::15 |
| AAAA | @ | 2001:4860:4802:34::15 |
| AAAA | @ | 2001:4860:4802:36::15 |
| AAAA | @ | 2001:4860:4802:38::15 |
| CNAME | www | ghs.googlehosted.com |

## Ownership verification reference (completed)

1. Open [Google Search Console](https://search.google.com/search-console/welcome) with the Google account used for deployment.
2. Add a **Domain** property for `houseworthit.com` and copy the Google-provided verification TXT value.
3. In Hostinger, open this domain's **DNS / Nameservers** and add that TXT record at `@`. Keep the existing website records during verification.
4. Return to Google Search Console and verify ownership. Keep the verification TXT record afterward.

## Domain mapping reference (completed)

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
