const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { SimpleLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
const { logs } = require('@opentelemetry/api-logs');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

const collectorHost = process.env.OTEL_COLLECTOR_HOST || 'otel-collector';
const traceUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `http://${collectorHost}:4318/v1/traces`;
const metricUrl = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || `http://${collectorHost}:4318/v1/metrics`;
const logUrl = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `http://${collectorHost}:4318/v1/logs`;

console.log(`[OpenTelemetry] Initializing OTel SDK (Traces, Metrics, Winston Logs):`);
console.log(`  -> Traces Target:  ${traceUrl}`);
console.log(`  -> Metrics Target: ${metricUrl}`);
console.log(`  -> Logs Target:    ${logUrl}`);

const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'todo-backend-service',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  'environment': process.env.NODE_ENV || 'development',
});

// 1. Trace Exporter
const traceExporter = new OTLPTraceExporter({ url: traceUrl });

// 2. Metric Exporter & Reader
const metricExporter = new OTLPMetricExporter({ url: metricUrl });
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000,
});

// 3. Log Exporter & Processor
const logExporter = new OTLPLogExporter({ url: logUrl });
const logRecordProcessor = new SimpleLogRecordProcessor(logExporter);

const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(logRecordProcessor);
logs.setGlobalLoggerProvider(loggerProvider);

// Node SDK Initialization with WinstonInstrumentation
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  logRecordProcessors: [logRecordProcessor],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
    new WinstonInstrumentation({
      disableLogSending: false, // Automatically forwards Winston logs to OTel LogRecordProcessor
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  Promise.all([sdk.shutdown(), loggerProvider.shutdown()])
    .then(() => console.log('[OpenTelemetry] SDK terminated successfully'))
    .catch((err) => console.error('[OpenTelemetry] Error shutting down SDK', err))
    .finally(() => process.exit(0));
});
