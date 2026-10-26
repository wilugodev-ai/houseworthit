import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const project = 'houseworthit-20261026';
const gcloud = 'C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd';
const authorization = spawnSync('cmd.exe', ['/d', '/c', gcloud, 'auth', 'print-access-token'], { encoding: 'utf8', windowsHide: true });
if (authorization.status !== 0) throw new Error('Google authorization is unavailable.');
const headers = { Authorization: `Bearer ${authorization.stdout.trim()}`, 'Content-Type': 'application/json' };
const endpoint = `https://us-central1-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/${project}/domainmappings`;
const results = [];
for (const domain of ['houseworthit.com', 'www.houseworthit.com']) {
  let response = await fetch(`${endpoint}/${domain}`, { headers });
  let mapping = await response.json();
  if (response.status === 404) {
    response = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ apiVersion: 'domains.cloudrun.com/v1', kind: 'DomainMapping', metadata: { name: domain, namespace: project }, spec: { routeName: 'houseworthit' } }),
    });
    mapping = await response.json();
  }
  if (!response.ok) throw new Error(`Mapping ${domain}: ${mapping.error?.message || response.status}`);
  for (let attempt = 0; attempt < 10 && !mapping.status?.resourceRecords?.length; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    response = await fetch(`${endpoint}/${domain}`, { headers });
    mapping = await response.json();
    if (!response.ok) throw new Error(`Unable to inspect ${domain}.`);
  }
  results.push({ domain, records: mapping.status?.resourceRecords || [], conditions: mapping.status?.conditions || [] });
}
mkdirSync('.data/cloud-run', { recursive: true });
writeFileSync('.data/cloud-run/domain-mappings.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
