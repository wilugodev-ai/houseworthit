import { spawn } from 'node:child_process';

const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => process.exit(code), 7000);
  timer.unref();
  if (!children.size) process.exit(code);
}
function start(file, cwd, environment) {
  const child = spawn(process.execPath, [file], { cwd, env: { ...process.env, ...environment }, stdio: 'inherit' });
  children.add(child);
  child.on('error', () => { console.error('A website process failed to start.'); stop(1); });
  child.on('exit', code => {
    children.delete(child);
    if (!stopping) stop(code || 1);
    else if (!children.size) process.exit(code || 0);
  });
  return child;
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

start('dist/main.js', '/app/apps/api', { PORT: '4400', HOST: '127.0.0.1' });
let healthy = false;
for (let attempt = 0; attempt < 90 && !stopping; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:4400/v1/health', { signal: AbortSignal.timeout(1000) });
    if (response.ok) { healthy = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!healthy) { console.error('The private account service did not become ready.'); stop(1); }
else start('apps/web/server.js', '/app', { HOSTNAME: '0.0.0.0', PORT: process.env.PORT || '8080' });
