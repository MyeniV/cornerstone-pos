# Cornerstone POS

A React point-of-sale application with a Node.js/Express REST API. Transactions are recorded on the edge device's local MongoDB database first and synchronized to a cloud MongoDB deployment when a connection is available.

## Requirements

- Node.js 20.19 or newer for local development
- Docker Engine and Docker Compose for the edge stack
- Kubernetes with a default persistent volume provisioner and Metrics Server for autoscaling
- A TLS-enabled, highly available MongoDB-compatible service for production cloud deployments

## Configure and run

For local development, the API defaults to `mongodb://127.0.0.1:27017/cornerstone_pos`. Copy `.env.example` to `.env` to configure an optional `CLOUD_MONGODB_URI`. Use a TLS-enabled MongoDB-compatible endpoint in production. Keep real credentials out of source control.

For a consistent edge deployment with a local MongoDB and monitoring stack:

```powershell
docker compose up --build -d
```

The POS is available on port 3001, Grafana on `http://localhost:3000`, and Prometheus on `http://localhost:9090`. Grafana is bound to localhost; set `GRAFANA_ADMIN_PASSWORD` before deployment and replace the local default. Seed an employee interactively:

```powershell
docker compose exec api node server/seed-employee.js
```

For frontend development instead, run `npm run api` and `npm run dev` in separate terminals. Vite proxies `/api` calls to port 3001.

## Employee sign-in

Employee accounts are stored in the local MongoDB `employees` collection. Add each account from an interactive terminal with:

```sh
npm run seed:employee
```

Enter the employee number, employee name, and a password of 8-128 characters when prompted. Password input is hidden; only a salted scrypt hash is stored. Re-run the command to update an existing employee's name and password. Employee numbers are case-insensitive and may contain letters, numbers, underscores, and hyphens. The app does not provide employee registration.

Employees sign in with their employee number and password. Their saved name appears in the profile and time-sensitive greeting. Currency is South African rand (ZAR). Sessions are stored in MongoDB, held in an HTTP-only, same-site cookie, and expire after 12 hours. Sign-out invalidates the session. Transaction, sync, and health API routes require an authenticated session.

## Containers, Kubernetes, and AIOps

`Dockerfile` builds the same POS API/client image for edge or cloud. Docker Compose is the single-device edge profile: it runs the API and durable local MongoDB alongside Prometheus, Grafana, and the Python AIOps collector. The API still uses the configured `CLOUD_MONGODB_URI` for optional differential synchronization.

To deploy to Kubernetes, build and publish both images to a registry accessible to the cluster, create the namespace secrets, then apply the manifests. Replace the example image names in `k8s/retail-stack.yaml` with the pushed image references.

```sh
docker build -t registry.example/cornerstone-pos:1.0.0 .
docker build -t registry.example/cornerstone-aiops:1.0.0 ./aiops
docker push registry.example/cornerstone-pos:1.0.0
docker push registry.example/cornerstone-aiops:1.0.0

kubectl create namespace cornerstone
kubectl create secret generic pos-secrets -n cornerstone \
  --from-literal=mongo-root-username=cornerstone \
  --from-literal=mongo-root-password='REPLACE_WITH_RAW_PASSWORD' \
  --from-literal=local-mongo-uri='mongodb://cornerstone:REPLACE_WITH_URL_ENCODED_PASSWORD@mongodb-0.mongodb:27017/cornerstone_pos?authSource=admin' \
  --from-literal=grafana-admin-password='REPLACE_WITH_A_STRONG_PASSWORD'
kubectl create configmap pos-prometheus-config -n cornerstone \
  --from-file=prometheus.yml=monitoring/prometheus/kubernetes.yml \
  --from-file=alerts.yml=monitoring/prometheus/alerts.yml
kubectl create configmap pos-grafana-datasource -n cornerstone \
  --from-file=prometheus.yml=monitoring/grafana/provisioning/datasources/prometheus.yml
kubectl create configmap pos-grafana-provider -n cornerstone \
  --from-file=dashboard.yml=monitoring/grafana/provisioning/dashboards/dashboard.yml
kubectl create configmap pos-grafana-dashboard -n cornerstone \
  --from-file=cornerstone.json=monitoring/grafana/provisioning/dashboards/cornerstone.json
kubectl apply -f k8s/retail-stack.yaml
```

Replace the example image references in the manifest before applying it. Use the same password in MongoDB and the URI, URL-encoding it only in the URI value. Set `cloud-mongo-uri` in `pos-secrets` when configuring cloud synchronization. Never commit real secret values.

Kubernetes runs multiple API replicas behind a ClusterIP service, uses an HPA (2-8 API pods based on CPU), persistent storage for the local MongoDB StatefulSet, and health/readiness probes plus restart policies to replace unhealthy pods. AIOps polls API telemetry, trains an Isolation Forest after 40 samples, detects unusual traffic/error/latency/backlog/memory/database patterns, and uses linear-regression trends to forecast pending transactions and memory 15 minutes ahead. Prometheus evaluates alerts; the provisioned Grafana dashboard visualizes health, request rate/latency, backlog, and anomaly status. The model needs about 10 minutes of data at the default 15-second interval before anomaly scores are ready.

Kubernetes probes and controllers automatically restart failed containers, route traffic only to ready API pods, and scale the API when CPU rises. These safe controller actions do not restart services just because an ML anomaly is flagged; anomalies and forecasts raise Prometheus alerts for investigation. The sample includes a single MongoDB replica with a persistent volume: use a managed, multi-zone MongoDB-compatible database (or deploy a separately operated replica set) for database failover and production durability. Provision a Kubernetes Metrics Server for HPA and a storage class for the MongoDB volume. Prometheus/Grafana data in the sample Kubernetes deployment is ephemeral.

## REST API

- `GET /api/health` reports local MongoDB readiness, cloud connectivity, and queued transaction count; requires an employee session.
- `GET /healthz` and `GET /readyz` are Kubernetes liveness/readiness probes; `GET /metrics` exports Prometheus telemetry for API requests, latency, database/cloud connectivity, and transaction backlog.
- `POST /api/login` accepts an employee number and password; `GET /api/session` reports the current signed-in employee; `POST /api/logout` ends the current session.
- `GET /api/transactions` returns recent transactions from the local database; `limit` is capped at 1,000.
- `GET /api/products` and `GET /api/customers` return inventory and customer records from the local database.
- `POST /api/products` adds an inventory item; SKU values must be unique.
- `POST /api/customers` adds a customer.
- `POST /api/transactions` validates and stores a transaction locally, checks current product prices and stock, decrements inventory, records the selected customer's visit, then attempts cloud synchronization. Repeated requests with the same transaction ID and content are idempotent; reusing an ID with different content returns `409`.
- `POST /api/sync` requests an immediate differential sync of pending local transactions.

Transactions are checked for a valid ID/date/customer, valid items and quantities, supported payment method, and totals consistent with their line items and current database prices. Invalid requests return `400`; stale prices, unavailable products, or insufficient stock return `409`. The API records the chosen payment method but does not charge cards; connect an authorized payment provider before accepting card payments.

## Offline and synchronization behavior

- The local MongoDB database is the durable source for edge transactions. A transaction is accepted locally even when the cloud URI is unset or cloud connectivity is down.
- Pending local transactions are retried every 10 seconds. Differential synchronization upserts by transaction ID, verifies the cloud payload hash, and marks local records synced only after confirming cloud storage.
- The browser also queues sales in local storage if the local edge API cannot be reached, retries those sales on reconnect, and uses the same transaction IDs for safe retries.
- Products, customer records, and completed transactions are stored in local MongoDB; product stock is decremented when a transaction is accepted. The database is initialized with the sample catalog and customers when those collections are empty.
- The in-progress cart remains browser-local until checkout. New products and customers require a reachable local API and are not created offline.
- The service worker caches the client app shell, not API responses.

Keep API, MongoDB, Prometheus, and Grafana on trusted networks; configure TLS, backups/restore, Kubernetes secret management, and an authorized payment provider before production exposure. The sample monitoring stack is not a substitute for a production alert delivery channel or database recovery plan.

## Tests

```sh
npm test
npm run build
```
