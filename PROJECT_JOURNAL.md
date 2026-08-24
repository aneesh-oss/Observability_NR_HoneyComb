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

### Phase 4: Winston Logging & Automatic Trace Correlation
- **Goal**: Capture application logs and link them to distributed traces in Honeycomb and New Relic.
- **Key Implementation**:
  - Integrated `winston` and `@opentelemetry/instrumentation-winston`.
  - `WinstonInstrumentation` automatically intercepts all `logger.info()`, `logger.warn()`, and `logger.error()` calls and injects the active `trace_id` and `span_id`.
  - Configured `SimpleLogRecordProcessor` in `tracing.js` for instant log record flushing.

---

## 🛠️ Troubleshooting Log & Lessons Learned

### 1. Honeycomb 401 Unauthenticated & New Relic 403 PermissionDenied
- ❌ **Symptom**: OTel Collector logs showed `401 Unauthenticated (unknown API key)` for Honeycomb and `403 PermissionDenied` for New Relic.
- 🔍 **Root Cause**: The `.env` file contained a **leading space** after the `=` sign:
  ```env
  # Incorrect
  HONEYCOMB_API_KEY= hcaik_01m0sgbzra7...
  ```
  Docker Compose read the leading space into the header (`x-honeycomb-team: " hcaik..."`), causing authentication failures.
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

### 4. OpenTelemetry Logs Not Ingesting Native Console Logs
- ❌ **Symptom**: Traces appeared in Honeycomb, but application logs were not showing up.
- 🔍 **Root Cause**: OpenTelemetry JS does not automatically capture standard `console.log()` calls. Additionally, `logRecordProcessors` needed to be registered inside the `NodeSDK` constructor.
- ✅ **Fix**: Installed `winston` and `@opentelemetry/instrumentation-winston`, and added `new WinstonInstrumentation()` to `tracing.js`.
- 💡 **Lesson Learned**: The standard Node.js pattern for OpenTelemetry logs is to use Winston/Pino with OTel instrumentation. It automatically attaches `trace_id` and `span_id` to every log record.

---

### 5. Honeycomb Signal Storage Architecture
- ❌ **Symptom**: User looking for a separate "Logs" tab in Honeycomb UI.
- 🔍 **Root Cause**: Unlike tools that separate logs and traces into different tabs, Honeycomb unifies all OTel signals (Traces & Logs) into the same dataset (`todo-app-traces`).
- ✅ **Fix**: Queried dataset `todo-app-traces` in Honeycomb using `WHERE body EXISTS` to view correlated logs alongside trace spans.
- 💡 **Lesson Learned**: In Honeycomb, logs are structured events stored inside your dataset alongside traces, linked via `trace_id`.

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
