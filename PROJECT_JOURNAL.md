# 📘 Project Journal & Troubleshooting Log

This document tracks all development milestones, architectural decisions, issues faced, root causes, and lessons learned since the start of the project. Use this file as a reference for future updates and troubleshooting.

---

## 📅 Development Timeline & Milestones

### Phase 1: Initial Todo CRUD Service & OTel Tracing Setup
- **Goal**: Create a backend CRUD service with a modern web frontend and Docker setup instrumented with OpenTelemetry.
- **Key Implementation**:
  - Node.js Express REST API (`/api/todos`).
  - `@opentelemetry/sdk-node` initialization in `tracing.js` exporting traces via OTLP/HTTP.
  - OpenTelemetry Collector container in `docker-compose.yml` routing traces to Honeycomb, New Relic, and console debug logger.
  - Modern Glassmorphism Frontend UI (`public/index.html`, `public/styles.css`, `public/app.js`).

---

### Phase 2: User Authentication & OpenTelemetry User Identity Context
- **Goal**: Protect user work by creating user accounts and propagating user identity inside OpenTelemetry spans.
- **Key Implementation**:
  - Integrated JWT (`jsonwebtoken`) and password hashing (`bcryptjs`).
  - Added Auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`).
  - Created `authenticateToken` middleware that automatically enriches current active OTel spans with `user.id` and `user.email`.
  - Filtered Todo CRUD endpoints so users only see their own isolated tasks.

---

### Phase 3: Three Pillars of Observability (Traces, Metrics, Logs)
- **Goal**: Expand OpenTelemetry pipeline beyond traces to include metrics and logs.
- **Key Implementation**:
  - Configured `PeriodicExportingMetricReader` with `OTLPMetricExporter` in `tracing.js` for CPU, memory, and custom counters (`todo.created.count`, `todo.deleted.count`).
  - Added `metrics` and `logs` pipelines to `otel-collector-config.yaml` to route all 3 signals to Honeycomb and New Relic.

---

### Phase 4: Winston Logging & OTLP LogExporter Resolution
- **Goal**: Resolve OTLP LogExporter 404 endpoint duplication bug and flush Winston log records to Honeycomb & New Relic.
- **Key Implementation**:
  - Identified OTLPLogExporter endpoint URL duplication (`/v1/logs/v1/logs` 404 bug) and corrected base endpoint to `http://otel-collector:4318`.
  - Configured `BatchLogRecordProcessor` in `tracing.js` with 1-second scheduled flush delay.
  - Implemented `OTelWinstonTransport` in `server.js` attaching explicit `body`, `message`, `level`, and `severityText` attributes to every log record.

---

## 🛠️ Troubleshooting Log & Lessons Learned

### 1. Honeycomb 401 Unauthenticated & New Relic 403 PermissionDenied
- ❌ **Symptom**: OTel Collector logs showed `401 Unauthenticated (unknown API key)` for Honeycomb and `403 PermissionDenied` for New Relic.
- 🔍 **Root Cause**: The `.env` file contained a **leading space** after the `=` sign: `HONEYCOMB_API_KEY= hcaik_...`.
- ✅ **Fix**: Removed leading space in `.env`: `HONEYCOMB_API_KEY=hcaik_...`.
- 💡 **Lesson Learned**: Environment variable parsers do not automatically trim leading spaces after `=`. Always ensure key values have no extra whitespace.

---

### 2. Container Recreating vs Restarting
- ❌ **Symptom**: Updating `.env` and running `docker compose restart` still produced old environment variable errors.
- 🔍 **Root Cause**: `docker compose restart` restarts existing container processes without re-evaluating the `.env` file.
- ✅ **Fix**: Used `docker compose up -d` (or `docker compose up --build -d`) to force container recreation with fresh `.env` variables.
- 💡 **Lesson Learned**: Whenever `.env` or `docker-compose.yml` changes, use `docker compose up -d` to recreate containers.

---

### 3. OpenTelemetry Collector Deprecated Exporter Alias
- ❌ **Symptom**: Collector log warning: `"otlphttp" alias is deprecated; use "otlp_http" instead`.
- 🔍 **Root Cause**: In OpenTelemetry Collector v0.159+, exporter names use underscores (`otlp_http`).
- ✅ **Fix**: Updated `otel-collector-config.yaml` to use `otlp_http/honeycomb` and `otlp_http/newrelic`.
- 💡 **Lesson Learned**: Keep collector configuration syntax aligned with the installed version of `opentelemetry-collector-contrib`.

---

### 4. OTLPLogExporter `/v1/logs` 404 Endpoint Duplication
- ❌ **Symptom**: Node.js logs returned `404 Not Found` when trying to post to `http://otel-collector:4318/v1/logs`.
- 🔍 **Root Cause**: `@opentelemetry/exporter-logs-otlp-http` automatically appends `/v1/logs` to the base endpoint. Passing `http://otel-collector:4318/v1/logs` caused it to post to `http://otel-collector:4318/v1/logs/v1/logs`.
- ✅ **Fix**: Set base endpoint `logUrl = 'http://otel-collector:4318'` in `tracing.js`.
- 💡 **Lesson Learned**: Always pass the base collector endpoint (`http://collector:4318`) to JS OTLP Exporters so signals append their respective `/v1/*` paths correctly.

---

### 5. Honeycomb "Logs Tab" Field Mapping (Dataset Definitions)
- ❌ **Symptom**: Honeycomb UI **Logs Tab** displays *"There is nothing here...yet. Expecting to see logs? Define your log fields in Dataset Definitions"*.
- 🔍 **Root Cause**: Honeycomb requires mapping **`Logs: Message`** (`message` / `body`) and **`Logs: Severity`** (`level` / `severityText`) under Dataset Definitions in Honeycomb Settings for the **Logs Tab** visualization to activate.
- ✅ **Fix**: In Honeycomb UI:
  1. Click **Dataset Settings** ➔ **Definitions** (or click *"Define your log fields in Dataset Definitions"*).
  2. Map **Logs: Message** ➔ `message` (or `body`).
  3. Map **Logs: Severity** ➔ `level` (or `severityText`).
  4. Click **Save**.
- 💡 **Lesson Learned**: Honeycomb's dedicated "Logs View" requires field definitions to render formatted log streams.

---

## 📝 How to Document Future Changes (Template)

Copy and paste this template section whenever adding a new feature or resolving a bug in the future:

```markdown
### [YYYY-MM-DD] Feature / Issue Title
- **Description**: Brief overview of what was changed or what failed.
- **Root Cause / Motivation**: Technical reason for the change or bug.
- **Files Modified**: List of changed files.
- **Verification**: Commands or steps taken to verify success.
- **Lesson Learned**: Key takeaway for future maintenance.
```
