[CmdletBinding()]
param(
  [ValidatePattern('^houseworthit-[a-z0-9-]+$')][string]$ProjectId = 'houseworthit-20261026',
  [string]$Region = 'us-central1',
  [string]$GcloudPath = 'C:/intouch/.data/google-cloud/google-cloud-sdk/bin/gcloud.cmd',
  [switch]$BuildOnly,
  [string]$ExistingImage
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$workDirectory = Join-Path $repoRoot '.data/cloud-run'
New-Item -ItemType Directory -Force $workDirectory | Out-Null
function Cloud([string[]]$Arguments) {
  & $GcloudPath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Google $($Arguments[0]) operation failed." }
}
function Write-Json([string]$Name, $Value) {
  $file = Join-Path $workDirectory $Name
  [IO.File]::WriteAllText($file, ($Value | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
  return $file
}
Push-Location $repoRoot
try {
  $runtime = "hwi-runtime@$ProjectId.iam.gserviceaccount.com"
  $builder = "hwi-build@$ProjectId.iam.gserviceaccount.com"
  foreach ($name in @('hwi-runtime', 'hwi-build')) {
    $existing = Cloud @('iam','service-accounts','list',"--project=$ProjectId","--filter=email:$name@$ProjectId.iam.gserviceaccount.com",'--format=value(email)')
    if (-not $existing) { Cloud @('iam','service-accounts','create',$name,"--project=$ProjectId",'--quiet') }
  }
  Cloud @('projects','add-iam-policy-binding',$ProjectId,"--member=serviceAccount:$builder",'--role=roles/logging.logWriter','--condition=None','--quiet','--format=none')
  $repository = Cloud @('artifacts','repositories','list',"--project=$ProjectId","--location=$Region",'--filter=name:/houseworthit','--format=value(name)')
  if (-not $repository) { Cloud @('artifacts','repositories','create','houseworthit','--repository-format=docker',"--project=$ProjectId","--location=$Region",'--quiet') }
  Cloud @('artifacts','repositories','add-iam-policy-binding','houseworthit',"--project=$ProjectId","--location=$Region","--member=serviceAccount:$builder",'--role=roles/artifactregistry.writer','--condition=None','--quiet','--format=none')
  $documentBucket = "$ProjectId-documents"
  $sourceBucket = "$ProjectId-source"
  $buckets = @(Cloud @('storage','buckets','list',"--project=$ProjectId",'--format=value(name)'))
  foreach ($bucket in @($sourceBucket, $documentBucket)) {
    if ($buckets -notcontains $bucket -and $buckets -notcontains "gs://$bucket") { Cloud @('storage','buckets','create',"gs://$bucket","--project=$ProjectId","--location=$Region",'--uniform-bucket-level-access','--public-access-prevention','--quiet') }
  }
  Cloud @('storage','buckets','add-iam-policy-binding',"gs://$sourceBucket","--member=serviceAccount:$builder",'--role=roles/storage.objectViewer','--quiet','--format=none')
  Cloud @('storage','buckets','add-iam-policy-binding',"gs://$documentBucket","--member=serviceAccount:$runtime",'--role=roles/storage.objectUser','--quiet','--format=none')
  foreach ($name in @('houseworthit-database-url','houseworthit-document-key')) {
    Cloud @('secrets','versions','describe','1',"--secret=$name","--project=$ProjectId",'--format=none')
    Cloud @('secrets','add-iam-policy-binding',$name,"--project=$ProjectId","--member=serviceAccount:$runtime",'--role=roles/secretmanager.secretAccessor','--condition=None','--quiet','--format=none')
  }
  $uploadFiles = @(Cloud @('meta','list-files-for-upload'))
  $allow = '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.dockerignore|\.gcloudignore|deploy/cloud-run/(Dockerfile|start\.mjs)|packages/calculations/(package\.json|tsconfig\.json|src/.+)|apps/api/(package\.json|tsconfig\.json|src/.+)|apps/web/(package\.json|tsconfig\.json|next-env\.d\.ts|next\.config\.ts|app/.+))$'
  foreach ($file in $uploadFiles) {
    $normal = ([string]$file).Replace('\','/') -replace '^\./',''
    if ($normal -notmatch $allow -or $normal -match '(^|/)(\.env[^/]*|node_modules|\.git|\.data)(/|$)') { throw "Unexpected upload file: $normal" }
  }
  if (-not $uploadFiles.Count) { throw 'No source files were selected.' }
  $release = Get-Date -Format 'yyyyMMdd-HHmmss'
  $image = if ($ExistingImage) { $ExistingImage } else { "$Region-docker.pkg.dev/$ProjectId/houseworthit/app:$release" }
  if ($image -notmatch ('^' + [regex]::Escape("$Region-docker.pkg.dev/$ProjectId/houseworthit/app:") + '[a-zA-Z0-9_.-]+$')) { throw 'Image must belong to the HouseWorthIt repository.' }
  if (-not $ExistingImage) {
    $configuration = @{
      steps = @(@{ name = 'gcr.io/cloud-builders/docker'; args = @('build','--file','deploy/cloud-run/Dockerfile','--target','runtime','--tag',$image,'.') })
      images = @($image); serviceAccount = "projects/$ProjectId/serviceAccounts/$builder"
      options = @{ logging = 'CLOUD_LOGGING_ONLY' }; timeout = '1200s'
    }
    $file = Write-Json 'build.json' $configuration
    $buildId = (Cloud @('builds','submit','.',"--project=$ProjectId","--region=$Region","--config=$file","--gcs-source-staging-dir=gs://$sourceBucket/source",'--async','--format=value(id)','--quiet')).Trim()
    $result = Write-Json 'build-result.json' @{ project=$ProjectId; region=$Region; buildId=$buildId; image=$image; status='submitted' }
    Write-Host "Build submitted: $buildId. Result: $result"
    Write-Host 'Wait for this build to succeed, then resume with -ExistingImage and the recorded image.'
    return
  }
  if ($BuildOnly) { return }
  $environment = Write-Json 'environment.json' @{ NODE_ENV='production'; API_URL='http://127.0.0.1:4400'; STORAGE_BACKEND='neon'; DOCUMENT_BUCKET=$documentBucket }
  Cloud @('run','deploy','houseworthit',"--project=$ProjectId","--region=$Region","--image=$image","--service-account=$runtime",'--allow-unauthenticated','--ingress=all','--port=8080','--cpu=1','--memory=1Gi','--cpu-throttling','--min=0','--max=1','--min-instances=0','--max-instances=1','--concurrency=8','--timeout=180',"--env-vars-file=$environment",'--set-secrets=DATABASE_URL=houseworthit-database-url:1,DOCUMENT_KEY=houseworthit-document-key:1','--quiet')
  $url = (Cloud @('run','services','describe','houseworthit',"--project=$ProjectId","--region=$Region",'--format=value(status.url)')).Trim()
  $result = Write-Json 'deployment-result.json' @{ project=$ProjectId; region=$Region; webUrl=$url; image=$image; domain='houseworthit.com'; storage='Neon PostgreSQL and private encrypted Google Cloud Storage' }
  Write-Host "Deployed: $url. Result: $result"
} finally { Pop-Location }
