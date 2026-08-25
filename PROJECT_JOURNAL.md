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

### Phase 4: Winston Logging & OpenTelemetryTransportV3 Integration
- **Goal**: Integrate Winston logger with `@opentelemetry/winston-transport` for explicit log record emission and trace correlation.
- **Key Implementation**:
  - Integrated `winston` and `@opentelemetry/winston-transport`.
  - Configured `OpenTelemetryTransportV3` on the Winston logger in `server.js`.
  - Correlated logs automatically with active HTTP trace spans (`trace_id` and `span_id`).

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

### 4. Honeycomb "Logs Tab" Field Mapping (Dataset Definitions)
- ❌ **Symptom**: Honeycomb UI **Logs Tab** displays *"There is nothing here...yet. Expecting to see logs? Define your log fields in Dataset Definitions"*.
- 🔍 **Root Cause**: Honeycomb requires mapping **`Logs: Message`** and **`Logs: Severity`** under Dataset Definitions in Honeycomb Settings for the **Logs Tab** visualization to activate.
- ✅ **Fix**: In Honeycomb UI:
  1. Click **Dataset Settings** ➔ **Definitions** (or click *"Define your log fields in Dataset Definitions"*).
  2. Map **Logs: Message** ➔ `body` (or `message`).
  3. Map **Logs: Severity** ➔ `severityText` (or `level`).
  4. Click **Save**.
- 💡 **Lesson Learned**: The raw log events arrive in Honeycomb, but Honeycomb's dedicated "Logs View" requires field definitions to render formatted log streams.

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
