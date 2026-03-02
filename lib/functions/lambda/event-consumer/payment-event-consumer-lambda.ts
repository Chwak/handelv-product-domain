import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { initTelemetryLogger } from '../../../utils/telemetry-logger';

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME || '';
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME || '';
const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME || '';
const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60; // ✅ CRITICAL FIX: Extended to 7 days (was 24h)

interface SqsRecord {
  body?: string;
  messageId?: string;
  messageAttributes?: Record<string, { stringValue?: string } | undefined>;
}

interface EventBridgeEnvelope {
  detail?: {
    eventId?: string;
    correlationId?: string;
    eventType?: string;
    eventVersion?: number;
    payload?: string | PaymentCapturedEvent;
    metadata?: {
      traceparent?: string;
      trace_id?: string;
      span_id?: string;
    };
  };
}

interface PaymentCapturedEvent {
  paymentId?: string;
  collectorUserId?: string;
  orderId?: string;
  amount?: number;
  captureTime?: string;
  shelfItemId?: string; // Must be provided by Payment domain
  quantity?: number; // Must be provided by Payment domain
}

/**
 * Payment Event Consumer Lambda - Product Domain
 *
 * Listens to events from Payment Domain:
 * - payment.captured.v1 → Decrement inventory and emit product.shelf.item.updated.v1
 *
 * Coordinates with Order domain to finalize stock holds
 */
export const handler = async (
  event: { Records?: SqsRecord[] }
): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> => {
  initTelemetryLogger(event, { domain: "product-domain", service: "payment-event-consumer" });
  console.log('========== PAYMENT EVENT CONSUMER START (Product Domain) ==========');

  if (!PRODUCTS_TABLE_NAME) {
    console.error('PRODUCTS_TABLE_NAME not set');
    throw new Error('Internal server error');
  }

  if (!OUTBOX_TABLE_NAME) {
    console.error('OUTBOX_TABLE_NAME not set');
    throw new Error('Internal server error');
  }

  if (!IDEMPOTENCY_TABLE_NAME) {
    console.error('IDEMPOTENCY_TABLE_NAME not set');
    throw new Error('Internal server error');
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records || []) {
    const recordId = record.messageId || 'unknown';
    try {
      console.log('---------- Processing Record ----------');

      const body = record.body;
      if (!body) {
        console.log('No body found in record, skipping');
        continue;
      }

      let payload: PaymentCapturedEvent;
      let eventId: string | undefined;
      let eventType: string | undefined;
      let traceparent: string | undefined;

      // Parse EventBridge event from SQS
      try {
        const parsed = JSON.parse(body) as EventBridgeEnvelope;

        if (parsed.detail && typeof parsed.detail === 'object') {
          eventType = parsed.detail.eventType;
          eventId = parsed.detail.eventId || parsed.detail.correlationId;
          traceparent = parsed.detail.metadata?.traceparent;

          const detailPayload = parsed.detail.payload;
          if (typeof detailPayload === 'string') {
            payload = JSON.parse(detailPayload) as PaymentCapturedEvent;
          } else if (detailPayload && typeof detailPayload === 'object') {
            payload = detailPayload as PaymentCapturedEvent;
          } else {
            throw new Error('Invalid EventBridge detail payload');
          }
        } else {
          throw new Error('Invalid EventBridge envelope structure');
        }
      } catch (e) {
        console.error('Failed to parse EventBridge message; sending to DLQ', { recordId, err: e });
        throw e;
      }

      console.log('Event type:', eventType);

      // Check idempotency
      const idempotencyKey = eventId || traceparent || `${payload.paymentId}:${payload.orderId}`;
      if (!(await acquireIdempotencyLock(client, idempotencyKey))) {
        console.log('Duplicate event detected; skipping', { idempotencyKey });
        continue;
      }

      // Route to appropriate handler based on event type
      switch (eventType) {
        case 'payment.captured.v1':
          await handlePaymentCaptured(client, payload, traceparent);
          break;

        default:
          console.warn('Unknown event type, ignoring', { eventType });
      }

      await markIdempotencyComplete(client, idempotencyKey);
      console.log('Successfully processed event', { eventType, recordId });

    } catch (err) {
      console.error('Failed to process record', { recordId, err });
      if (record.messageId) {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  return { batchItemFailures };
};

/**
 * Handle payment.captured.v1
 * 
 * DECISION: This handler is now a NO-OP to prevent double inventory decrement.
 * Inventory is exclusively managed via order.stock.confirmed.v1 event path.
 * This consumer remains wired for potential future use cases (e.g., analytics, audit trails).
 */
async function handlePaymentCaptured(client: DynamoDBDocumentClient, payload: PaymentCapturedEvent, traceparent?: string): Promise<void> {
  const { paymentId, orderId } = payload;
  
  if (!paymentId || !orderId) {
    throw new Error('Missing required fields: paymentId or orderId');
  }

  // NO-OP: Inventory is now exclusively managed via order.stock.confirmed.v1
  // This prevents double-decrement when both payment.captured and order.stock.confirmed events fire
  console.log('payment.captured.v1 received (NO-OP: inventory managed via order.stock.confirmed.v1)');
  
  // Original payment.captured inventory decrement logic has been disabled
  return;
}

/**
 * Acquire idempotency lock to prevent duplicate event processing
 */
async function acquireIdempotencyLock(client: DynamoDBDocumentClient, idempotencyKey: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + IDEMPOTENCY_TTL_SECONDS;

  try {
    await client.send(
      new PutCommand({
        TableName: IDEMPOTENCY_TABLE_NAME,
        Item: {
          id: idempotencyKey,
          status: 'PROCESSING',
          created_at: now,
          expires_at: expiresAt,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      })
    );
    return true;
  } catch (err) {
    if ((err as any).name === 'ConditionalCheckFailedException') {
      return false; // Already processing or processed
    }
    throw err;
  }
}

/**
 * Mark idempotency processing as complete
 */
async function markIdempotencyComplete(client: DynamoDBDocumentClient, idempotencyKey: string): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: { id: idempotencyKey },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'COMPLETE' },
    })
  );
}
