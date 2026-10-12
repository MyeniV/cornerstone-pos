import os from "node:os";

const requestCounts = new Map();
const durationBuckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const durationCounts = Array(durationBuckets.length + 1).fill(0);
let requestDurationSum = 0;
let requestDurationCount = 0;
const gauges = new Map();

function labelsFor(method, route, status) {
  return `method="${method}",route="${route}",status="${status}"`;
}

export function observeRequest(method, route, status, durationSeconds) {
  const key = labelsFor(method, route, status);
  requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
  const bucketIndex = durationBuckets.findIndex((bound) => durationSeconds <= bound);
  durationCounts[bucketIndex === -1 ? durationBuckets.length : bucketIndex] += 1;
  requestDurationSum += durationSeconds;
  requestDurationCount += 1;
}

export function setGauge(name, value, help) {
  gauges.set(name, { value: Number(value), help });
}

function escapeHelp(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
}

export function renderMetrics() {
  const lines = [];
  for (const [name, metric] of gauges) {
    lines.push(`# HELP ${name} ${escapeHelp(metric.help)}`, `# TYPE ${name} gauge`, `${name} ${metric.value}`);
  }

  lines.push(
    "# HELP http_requests_total Total HTTP requests handled by the POS API",
    "# TYPE http_requests_total counter",
  );
  for (const [labels, count] of requestCounts) lines.push(`http_requests_total{${labels}} ${count}`);

  lines.push(
    "# HELP http_request_duration_seconds HTTP request duration in seconds",
    "# TYPE http_request_duration_seconds histogram",
  );
  let cumulative = 0;
  durationBuckets.forEach((bound, index) => {
    cumulative += durationCounts[index];
    lines.push(`http_request_duration_seconds_bucket{le="${bound}"} ${cumulative}`);
  });
  lines.push(
    `http_request_duration_seconds_bucket{le="+Inf"} ${requestDurationCount}`,
    `http_request_duration_seconds_sum ${requestDurationSum}`,
    `http_request_duration_seconds_count ${requestDurationCount}`,
    "# HELP process_resident_memory_bytes Resident memory size in bytes",
    "# TYPE process_resident_memory_bytes gauge",
    `process_resident_memory_bytes ${process.memoryUsage().rss}`,
    "# HELP process_heap_used_bytes Node.js heap used in bytes",
    "# TYPE process_heap_used_bytes gauge",
    `process_heap_used_bytes ${process.memoryUsage().heapUsed}`,
    "# HELP process_uptime_seconds Node.js process uptime in seconds",
    "# TYPE process_uptime_seconds gauge",
    `process_uptime_seconds ${process.uptime()}`,
    "# HELP system_load_1m System load average over one minute",
    "# TYPE system_load_1m gauge",
    `system_load_1m ${os.loadavg()[0]}`,
  );
  return `${lines.join("\n")}\n`;
}
