import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const project = 'houseworthit-20261026';
const gcloud = 'C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd';
const tokenResult = spawnSync('cmd.exe', ['/d', '/c', gcloud, 'auth', 'print-access-token'], { encoding: 'utf8', windowsHide: true });
if (tokenResult.status !== 0) throw new Error('Google authorization unavailable.');
const headers = { Authorization: `Bearer ${tokenResult.stdout.trim()}`, 'Content-Type': 'application/json' };
const mapping = await fetch(`https://us-central1-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/${project}/domainmappings/houseworthit.com`, { headers });
const mappingData = await mapping.json();
const result = { domain: 'houseworthit.com', mappingStatus: mapping.status, records: mappingData.status?.resourceRecords || [] };
if (mapping.status === 404) {
  const verification = await fetch('https://www.googleapis.com/siteVerification/v1/token', { method: 'POST', headers, body: JSON.stringify({ site: { type: 'INET_DOMAIN', identifier: 'houseworthit.com' }, verificationMethod: 'DNS_TXT' }) });
  const value = await verification.json();
  result.verificationStatus = verification.status;
  if (verification.ok && value.token) result.verificationRecord = { type: 'TXT', name: '@', value: value.token };
  else result.nextStep = 'Verify houseworthit.com in Google Search Console, then add the Google mapping and its returned DNS records in Hostinger.';
}
mkdirSync('.data/cloud-run', { recursive: true });
writeFileSync('.data/cloud-run/domain-status.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
