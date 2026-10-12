import io
import json
import unittest
from unittest.mock import patch

import app


class AIOpsTests(unittest.TestCase):
    def test_parse_prometheus_metrics_and_server_errors(self):
        metrics = app.parse_prometheus(
            'http_requests_total{method="GET",route="/",status="200"} 12\n'
            'http_requests_total{method="GET",route="/",status="500"} 3\n'
            "process_resident_memory_bytes 1024\n"
        )
        self.assertEqual(metrics["http_requests_total"], 15)
        self.assertEqual(metrics["http_requests_total_5xx"], 3)
        self.assertEqual(metrics["process_resident_memory_bytes"], 1024)

    def test_builds_features_from_counter_deltas(self):
        current = {
            "http_requests_total": 20,
            "http_requests_total_5xx": 2,
            "http_request_duration_seconds_sum": 4.0,
            "http_request_duration_seconds_count": 10,
            "pos_pending_transactions": 7,
            "process_resident_memory_bytes": 8 * 1024 * 1024,
            "pos_mongodb_up": 1,
            "pos_cloud_mongodb_up": 1,
        }
        previous = {"requests": 10, "errors": 1, "duration": 2.0, "count": 5}
        features, counters = app.feature_vector(current, previous, 5.0)
        self.assertEqual(features, [0.1, 0.4, 2.0, 7, 8.0, 1, 1])
        self.assertEqual(counters["requests"], 20)

    def test_forecasts_increasing_backlog(self):
        app.history.clear()
        app.history.extend([[0, 0, 0, float(step), 100.0, 1, 1] for step in range(12)])
        predicted_pending, predicted_memory = app.predict_maintenance()
        self.assertGreater(predicted_pending, 11)
        self.assertAlmostEqual(predicted_memory, 100.0)
        app.history.clear()

    def test_reads_aggregated_values_from_prometheus(self):
        results = [
            io.BytesIO(json.dumps({"status": "success", "data": {"result": [{"value": [0, str(value)]}]}}).encode())
            for value in range(1, 9)
        ]
        with patch("app.urlopen", side_effect=results):
            metrics = app.collect_metrics()
        self.assertEqual(metrics["http_requests_total"], 1)
        self.assertEqual(metrics["api_up"], 8)


if __name__ == "__main__":
    unittest.main()
