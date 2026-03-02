import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import * as crypto from "crypto";
import { initTelemetryLogger } from "../../../utils/telemetry-logger";

const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME || "";
const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60; // ✅ CRITICAL FIX: Extended to 7 days (was 24h)
const DOMAIN_NAME = "product-domain";

interface SqsRecord {
  body?: string;
  messageId?: string;
  messageAttributes?: Record<string, { stringValue?: string } | undefined>;
}

interface SnsMessage {
  Message?: string;
}

interface EventBridgeEnvelope {
  detailType?: string;
  source?: string;
  detail?: {
    eventId?: string;
    correlationId?: string;
    payload?: unknown;
    metadata?: {
      traceparent?: string;
      trace_id?: string;
      span_id?: string;
    };
  };
}

type TraceContext = {
  traceparent: string;
  trace_id: string;
  span_id: string;
};

function generateTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateSpanId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function buildTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

function parseTraceparent(traceparent: string): { trace_id: string; span_id: string } | null {
  const match = /^\d{2}-([0-9a-f]{32})-([0-9a-f]{16})-\d{2}$/i.exec(traceparent);
  if (!match) return null;
  return { trace_id: match[1], span_id: match[2] };
}

function resolveTraceContext(traceparent?: string): TraceContext {
  const parsed = traceparent ? parseTraceparent(traceparent) : null;
  const trace_id = parsed?.trace_id || generateTraceId();
  const span_id = parsed?.span_id || generateSpanId();
  return { traceparent: traceparent || buildTraceparent(trace_id, span_id), trace_id, span_id };
}

function logJson(level: "INFO" | "ERROR", message: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ level, message, domain: DOMAIN_NAME, ...data }));
}

export const handler = async (
  event: { Records?: SqsRecord[] }
): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> => {
  initTelemetryLogger(event, { domain: "product-domain", service: "product-event-consumer" });
  logJson("INFO", "Product event consumer start", { recordCount: event.Records?.length ?? 0 });

  if (!IDEMPOTENCY_TABLE_NAME) {
    logJson("ERROR", "IDEMPOTENCY_TABLE_NAME not set", {});
    throw new Error("Internal server error");
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records || []) {
    const recordId = record.messageId || "unknown";
    try {
      const body = record.body;
      if (!body) {
        console.log("No body found in record, skipping", { recordId });
        continue;
      }

      const parsed = JSON.parse(body) as SnsMessage & EventBridgeEnvelope;
      const envelope = parsed.Message && typeof parsed.Message === "string"
        ? (JSON.parse(parsed.Message) as EventBridgeEnvelope)
        : parsed;

      const detailType = envelope.detailType || "UnknownDetailType";
      const detail = envelope.detail || {};
      const traceparent =
        record.messageAttributes?.traceparent?.stringValue ||
        detail.metadata?.traceparent;
      const traceContext = resolveTraceContext(traceparent);
      const eventId = detail.eventId || detail.correlationId || traceContext.trace_id || recordId;

      if (!(await acquireIdempotencyLock(client, eventId))) {
        logJson("INFO", "Duplicate event detected; skipping", { eventId, detailType, trace_id: traceContext.trace_id });
        continue;
      }

      switch (detailType) {
        case "MakerVerified":
          logJson("INFO", "Received MakerVerified event", { eventId, detailType, trace_id: traceContext.trace_id });
          break;
        default:
          logJson("INFO", "Unhandled event type", { detailType, eventId, trace_id: traceContext.trace_id });
          break;
      }

      await markIdempotencyComplete(client, eventId);
    } catch (err) {
      logJson("ERROR", "Failed to process record", { recordId, err });
      if (record.messageId) {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  return { batchItemFailures };
};

async function acquireIdempotencyLock(
  db: DynamoDBDocumentClient,
  idempotencyKey: string,
): Promise<boolean> {
  const expiresAt = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;
  try {
    await db.send(
      new PutCommand({
        TableName: IDEMPOTENCY_TABLE_NAME,
        Item: {
          id: idempotencyKey,
          status: "IN_PROGRESS",
          expires_at: expiresAt,
        },
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
    return true;
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err ? (err as { name?: string }).name : "";
    if (name === "ConditionalCheckFailedException") {
      return false;
    }
    throw err;
  }
}

async function markIdempotencyComplete(
  db: DynamoDBDocumentClient,
  idempotencyKey: string,
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;
  await db.send(
    new UpdateCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: { id: idempotencyKey },
      UpdateExpression: "SET #s = :done, expires_at = :exp",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":done": "COMPLETED",
        ":exp": expiresAt,
      },
    })
  );
}