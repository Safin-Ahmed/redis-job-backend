require("dotenv").config();

const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-otlp-grpc");

const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");

const { Resource } = require("@opentelemetry/resources");

const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");

const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "redis-job-service",
  })
);

const traceExporter = new OTLPTraceExporter({
  url: process.env.TRACE_EXPORTER_URL,
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
