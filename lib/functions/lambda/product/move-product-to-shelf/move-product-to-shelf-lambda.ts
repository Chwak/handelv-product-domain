import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import { randomUUID, randomBytes } from 'crypto';

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME;

/**
 * Move Product to READY_FOR_SHELF Stage
 * Transition: DRAFT → READY_FOR_SHELF or BASEMENT → READY_FOR_SHELF
 * 
 * Use case: Maker publishes product to make it visible to collectors
 * This is the ONLY stage where products are visible to collectors
 */
export const handler = async (event: { arguments?: { productId?: unknown }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "move-product-to-shelf" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const productId = validateId(event.arguments?.productId);
  if (!productId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const existing = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
  );
  const item = existing.Item;
  if (!item) throw new Error('Product not found');
  if (item.makerUserId !== auth) throw new Error('Forbidden');
  
  // Valid transitions: DRAFT → READY_FOR_SHELF, BASEMENT → READY_FOR_SHELF
  const validFromStates = ['DRAFT', 'BASEMENT'];
  if (!validFromStates.includes(item.status)) {
    throw new Error(`Invalid status transition: Can only move to READY_FOR_SHELF from ${validFromStates.join(' or ')}`);
  }

  const now = new Date().toISOString();
  
  // Generate trace context for distributed tracing
  const traceId = randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  const traceparent = `00-${traceId}-${spanId}-01`;
  
  // Prepare outbox event for Discovery domain
  const eventId = randomUUID();
  const correlationId = randomUUID();
  const outboxPayload = {
    event: 'ProductMovedToShelf',
    productId,
    makerUserId: item.makerUserId,
    title: item.title,
    description: item.description,
    categoryId: item.categoryId,
    basePrice: item.basePrice,
    quantityAvailable: item.quantityAvailable || 0,
    previousStatus: item.status,
    updatedAt: now,
  };
  const expiresAtEpoch = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // ✅ CRITICAL FIX: 7 days TTL (was 24h)
  
  // Atomic update: product status + outbox event
  // ✅ CRITICAL FIX: Added ConditionExpression to prevent race conditions
  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { productId },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ConditionExpression: '#status IN (:draft, :basement)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'READY_FOR_SHELF',
              ':draft': 'DRAFT',
              ':basement': 'BASEMENT',
              ':now': now,
            },
          },
        },
        {
          Put: {
            TableName: OUTBOX_TABLE_NAME!,
            Item: {
              eventId,
              eventType: 'product.shelf.item.published.v1',
              eventVersion: 1,
              eventSource: 'hand-made.product-domain',
              payload: JSON.stringify(outboxPayload),
              correlationId,
              traceparent,
              trace_id: traceId,
              span_id: spanId,
              status: 'PENDING',
              createdAt: now,
              expiresAt: expiresAtEpoch,
              retryCount: 0,
            },
          },
        },
      ],
    })
  );
  
  // Fetch updated product
  const result = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
  );
  return result.Item ?? item;
};
