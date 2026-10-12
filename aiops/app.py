import json
import os
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import RobustScaler

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:9090")
POLL_INTERVAL = max(5, int(os.getenv("POLL_INTERVAL_SECONDS", "15")))
MIN_TRAINING_SAMPLES = 40
history = deque(maxlen=720)
state_lock = threading.Lock()
previous_counters = None
state = {
    "api_up": 0,
    "model_ready": 0,
    "anomaly": 0,
    "score": 0.0,
    "error_rate": 0.0,
    "latency": 0.0,
    "pending": 0.0,
    "memory": 0.0,
    "mongodb_up": 0.0,
    "cloud_mongodb_up": 0.0,
    "predicted_pending": 0.0,
    "predicted_memory": 0.0,
    "last_success": 0.0,
}
model = None


def parse_prometheus(text):
    parsed = {}
    for line in text.splitlines():
        if not line or line.startswith("#") or " " not in line:
            continue
        name_and_labels, raw_value = line.rsplit(" ", 1)
        name = name_and_labels.split("{", 1)[0]
        try:
            value = float(raw_value)
        except ValueError:
            continue
        if "{" not in name_and_labels:
            parsed[name] = parsed.get(name, 0.0) + value
        elif 'status="5' in name_and_labels:
            parsed[f"{name}_5xx"] = parsed.get(f"{name}_5xx", 0.0) + value
    return parsed


def feature_vector(metrics, previous, elapsed):
    requests = metrics.get("http_requests_total", 0.0)
    request_delta = max(0.0, requests - previous.get("requests", requests)) if previous else 0.0
    errors = metrics.get("http_requests_total_5xx", 0.0)
    error_delta = max(0.0, errors - previous.get("errors", errors)) if previous else 0.0
    duration = metrics.get("http_request_duration_seconds_sum", 0.0)
    duration_delta = max(0.0, duration - previous.get("duration", duration)) if previous else 0.0
    count = metrics.get("http_request_duration_seconds_count", 0.0)
    count_delta = max(0.0, count - previous.get("count", count)) if previous else 0.0
    return [
        error_delta / max(request_delta, 1.0),
        duration_delta / max(count_delta, 1.0),
        request_delta / max(elapsed, 1.0),
        metrics.get("pos_pending_transactions", 0.0),
        metrics.get("process_resident_memory_bytes", 0.0) / (1024 * 1024),
        metrics.get("pos_mongodb_up", 0.0),
        metrics.get("pos_cloud_mongodb_up", 0.0),
    ], {
        "requests": requests,
        "errors": errors,
        "duration": duration,
        "count": count,
    }


def collect_metrics():
    queries = {
        "http_requests_total": 'sum(http_requests_total{job="cornerstone-api"})',
        "http_requests_total_5xx": 'sum(http_requests_total{job="cornerstone-api",status=~"5.."})',
        "http_request_duration_seconds_sum": 'sum(http_request_duration_seconds_sum{job="cornerstone-api"})',
        "http_request_duration_seconds_count": 'sum(http_request_duration_seconds_count{job="cornerstone-api"})',
        "pos_pending_transactions": "max(pos_pending_transactions)",
        "process_resident_memory_bytes": 'max(process_resident_memory_bytes{job="cornerstone-api"})',
        "pos_mongodb_up": "min(pos_mongodb_up)",
        "pos_cloud_mongodb_up": "min(pos_cloud_mongodb_up)",
        "api_up": 'min(up{job="cornerstone-api"})',
    }
    values = {}
    for name, query in queries.items():
        url = f"{PROMETHEUS_URL}/api/v1/query?{urlencode({'query': query})}"
        with urlopen(url, timeout=5) as response:
            result = json.loads(response.read().decode("utf-8"))
        if result.get("status") != "success":
            raise ValueError(f"Prometheus query failed for metric {name}")
        series = result.get("data", {}).get("result", [])
        values[name] = float(series[0]["value"][1]) if series else 0.0
    return values


def update_model(vector):
    global model
    history.append(vector)
    if model is None and len(history) >= MIN_TRAINING_SAMPLES:
        model = make_pipeline(
            RobustScaler(),
            IsolationForest(n_estimators=200, contamination=0.03, random_state=42),
        )
        model.fit(np.asarray(history, dtype=float))
    if model is None:
        return 0, 0.0
    anomaly = int(model.predict([vector])[0] == -1)
    score = float(model.decision_function([vector])[0])
    return anomaly, score


def predict_maintenance():
    if len(history) < 8:
        return 0.0, 0.0
    observations = np.asarray(history, dtype=float)[-120:]
    time_steps = np.arange(len(observations)).reshape(-1, 1)
    horizon = max(1, int(900 / POLL_INTERVAL))
    future_step = np.asarray([[len(observations) - 1 + horizon]])
    pending_model = LinearRegression().fit(time_steps, observations[:, 3])
    memory_model = LinearRegression().fit(time_steps, observations[:, 4])
    predicted_pending = max(0.0, float(pending_model.predict(future_step)[0]))
    predicted_memory = max(0.0, float(memory_model.predict(future_step)[0]))
    return predicted_pending, predicted_memory


def collect():
    global previous_counters
    previous_poll = time.monotonic()
    while True:
        try:
            metrics = collect_metrics()
            now = time.monotonic()
            vector, previous_counters = feature_vector(
                metrics, previous_counters, now - previous_poll
            )
            previous_poll = now
            if metrics["api_up"] <= 0 or metrics["pos_mongodb_up"] <= 0:
                anomaly, score = 1, -1.0
            else:
                anomaly, score = update_model(vector)
            predicted_pending, predicted_memory = predict_maintenance()
            with state_lock:
                state.update(
                    api_up=int(metrics["api_up"] > 0),
                    model_ready=int(model is not None),
                    anomaly=anomaly,
                    score=score,
                    error_rate=vector[0],
                    latency=vector[1],
                    pending=vector[3],
                    memory=vector[4],
                    mongodb_up=vector[5],
                    cloud_mongodb_up=vector[6],
                    predicted_pending=predicted_pending,
                    predicted_memory=predicted_memory,
                    last_success=time.time(),
                )
        except (OSError, URLError, TimeoutError, ValueError, KeyError) as error:
            print(f"Metrics collection failed: {error}", flush=True)
            with state_lock:
                state.update(api_up=0, anomaly=1, score=-1.0, mongodb_up=0)
        time.sleep(POLL_INTERVAL)


class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok\n")
            return
        if self.path != "/metrics":
            self.send_error(404)
            return
        with state_lock:
            snapshot = dict(state)
        lines = [
            "# HELP aiops_api_up Whether the monitored API metrics endpoint is reachable",
            "# TYPE aiops_api_up gauge",
            f"aiops_api_up {snapshot['api_up']}",
            "# HELP aiops_model_ready Whether enough baseline observations exist to score anomalies",
            "# TYPE aiops_model_ready gauge",
            f"aiops_model_ready {snapshot['model_ready']}",
            "# HELP aiops_anomaly_detected Whether the latest observation is anomalous",
            "# TYPE aiops_anomaly_detected gauge",
            f"aiops_anomaly_detected {snapshot['anomaly']}",
            "# HELP aiops_anomaly_score Isolation Forest decision score; lower is more unusual",
            "# TYPE aiops_anomaly_score gauge",
            f"aiops_anomaly_score {snapshot['score']}",
            "# HELP aiops_http_error_ratio Recent fraction of API requests returning 5xx",
            "# TYPE aiops_http_error_ratio gauge",
            f"aiops_http_error_ratio {snapshot['error_rate']}",
            "# HELP aiops_http_mean_latency_seconds Recent average API request duration",
            "# TYPE aiops_http_mean_latency_seconds gauge",
            f"aiops_http_mean_latency_seconds {snapshot['latency']}",
            "# HELP aiops_pending_transactions Number of pending transactions",
            "# TYPE aiops_pending_transactions gauge",
            f"aiops_pending_transactions {snapshot['pending']}",
            "# HELP aiops_process_memory_megabytes API resident memory in MiB",
            "# TYPE aiops_process_memory_megabytes gauge",
            f"aiops_process_memory_megabytes {snapshot['memory']}",
            "# HELP aiops_mongodb_up Whether the API's MongoDB connection is ready",
            "# TYPE aiops_mongodb_up gauge",
            f"aiops_mongodb_up {snapshot['mongodb_up']}",
            "# HELP aiops_cloud_mongodb_up Whether the API's cloud MongoDB connection is ready",
            "# TYPE aiops_cloud_mongodb_up gauge",
            f"aiops_cloud_mongodb_up {snapshot['cloud_mongodb_up']}",
            "# HELP aiops_predicted_pending_transactions Estimated transaction backlog 15 minutes ahead",
            "# TYPE aiops_predicted_pending_transactions gauge",
            f"aiops_predicted_pending_transactions {snapshot['predicted_pending']}",
            "# HELP aiops_predicted_process_memory_megabytes Estimated API resident memory in MiB 15 minutes ahead",
            "# TYPE aiops_predicted_process_memory_megabytes gauge",
            f"aiops_predicted_process_memory_megabytes {snapshot['predicted_memory']}",
            "# HELP aiops_last_success_timestamp_seconds Unix timestamp of the last successful metrics poll",
            "# TYPE aiops_last_success_timestamp_seconds gauge",
            f"aiops_last_success_timestamp_seconds {snapshot['last_success']}",
        ]
        body = ("\n".join(lines) + "\n").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


if __name__ == "__main__":
    threading.Thread(target=collect, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", 9108), MetricsHandler).serve_forever()
