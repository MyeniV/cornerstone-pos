import test from "node:test";
import assert from "node:assert/strict";
import { observeRequest, renderMetrics, setGauge } from "./metrics.js";

test("exports request counters and cumulative Prometheus histogram buckets", () => {
  observeRequest("GET", "/metrics-test", 200, 0.04);
  observeRequest("GET", "/metrics-test", 500, 0.3);
  setGauge("test_mongodb_up", 1, "Test database readiness");

  const metrics = renderMetrics();
  assert.match(metrics, /http_requests_total\{method="GET",route="\/metrics-test",status="200"\} 1/);
  assert.match(metrics, /http_requests_total\{method="GET",route="\/metrics-test",status="500"\} 1/);
  assert.match(metrics, /http_request_duration_seconds_bucket\{le="0\.05"\} 1/);
  assert.match(metrics, /http_request_duration_seconds_bucket\{le="0\.5"\} 2/);
  assert.match(metrics, /test_mongodb_up 1/);
});
