import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, TransactWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import { randomUUID, randomBytes } from 'crypto';

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;
const OUTBOX_TABLE_NAME = process.env.OUTBOX_TABLE_NAME;

interface UpdateProductInput {
  productId?: unknown;
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  basePrice?: unknown;
  quantityAvailable?: unknown;
  status?: unknown;
}

export const handler = async (event: { arguments?: { input?: UpdateProductInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "update-product" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const productId = validateId(input.productId);
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

  const updates: string[] = ['updatedAt = :now'];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };

  if (input.title !== undefined) {
    const t = typeof input.title === 'string' ? input.title.trim() : '';
    if (t.length < 3 || t.length > 200) throw new Error('Invalid input format');
    updates.push('#title = :title');
    names['#title'] = 'title';
    values[':title'] = t;
  }
  if (input.description !== undefined) {
    const d = typeof input.description === 'string' ? input.description.trim() : '';
    if (d.length < 20 || d.length > 5000) throw new Error('Invalid input format');
    updates.push('#description = :desc');
    names['#description'] = 'description';
    values[':desc'] = d;
  }
  if (input.categoryId !== undefined) {
    const cid = validateId(input.categoryId);
    if (!cid) throw new Error('Invalid input format');
    updates.push('categoryId = :cid');
    values[':cid'] = cid;
  }
  if (input.basePrice !== undefined) {
    const p = Number(input.basePrice);
    if (!Number.isFinite(p) || p < 0.01 || p > 999999.99) throw new Error('Invalid input format');
    updates.push('basePrice = :price');
    values[':price'] = p;
  }
  if (input.quantityAvailable !== undefined) {
    const q = Number(input.quantityAvailable);
    if (!Number.isInteger(q) || q < 1 || q > 10000) throw new Error('Invalid input format');
    updates.push('quantityAvailable = :qty');
    values[':qty'] = q;
  }
  const validStatuses = ['CREATION', 'DRAFT', 'READY_FOR_SHELF', 'BASEMENT', 'SHIPPING'];
  if (input.status !== undefined) {
    const s = typeof input.status === 'string' ? input.status.trim() : '';
    if (!validStatuses.includes(s)) throw new Error('Invalid input format');
    
    // Enforce lifecycle transitions through dedicated mutations
    // Direct status updates only allowed for backwards compatibility
    if (s === 'SHIPPING' && item.status !== 'READY_FOR_SHELF') {
      throw new Error('Invalid status transition: Can only move to SHIPPING from READY_FOR_SHELF');
    }
    if (s === 'BASEMENT' && item.status === 'SHIPPING') {
      throw new Error('Invalid status transition: Cannot move to BASEMENT from SHIPPING');
    }
    
    updates.push('#status = :status');
    names['#status'] = 'status';
    values[':status'] = s;
  }

  if (updates.length <= 1) throw new Error('Invalid input format');

  // If product is READY_FOR_SHELF and significant fields will be updated, prepare outbox event
  const willBeReadyForShelf = input.status === 'READY_FOR_SHELF' || (input.status === undefined && item.status === 'READY_FOR_SHELF');
  const significantUpdate = input.title !== undefined || input.description !== undefined || 
                           input.basePrice !== undefined || input.quantityAvailable !== undefined;
  
  const shouldPublishEvent = willBeReadyForShelf && significantUpdate && OUTBOX_TABLE_NAME;

  if (shouldPublishEvent) {
    // Atomic update: product + outbox event together
    const now = new Date().toISOString();
    
    // Generate trace context
    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const traceparent = `00-${traceId}-${spanId}-01`;
    
    // Prepare outbox event for Discovery domain
    const eventId = randomUUID();
    const correlationId = randomUUID();
    
    // Build the updated product data for the event payload
    const updatedData = {
      productId,
      makerUserId: item.makerUserId,
      title: input.title !== undefined ? (typeof input.title === 'string' ? input.title.trim() : item.title) : item.title,
      description: input.description !== undefined ? (typeof input.description === 'string' ? input.description.trim() : item.description) : item.description,
      basePrice: input.basePrice !== undefined ? Number(input.basePrice) : item.basePrice,
      quantityAvailable: input.quantityAvailable !== undefined ? Number(input.quantityAvailable) : (item.quantityAvailable || 0),
      updatedAt: now,
    };
    
    const outboxPayload = {
      event: 'ProductUpdated',
      ...updatedData,
    };
    const expiresAtEpoch = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // ✅ CRITICAL FIX: 7 days TTL (was 24h)
    
    // Atomic transaction: Update product + Write outbox event
    // ✅ CRITICAL FIX: Added ConditionExpression to prevent race conditions
    const expressionValues = { ...values, ':lastUpdated': item.updatedAt };

    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { productId },
              UpdateExpression: 'SET ' + updates.join(', '),
              ConditionExpression: 'updatedAt = :lastUpdated', // ✅ CRITICAL FIX: Prevent concurrent updates
              ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
              ExpressionAttributeValues: expressionValues,
            },
          },
          {
            Put: {
              TableName: OUTBOX_TABLE_NAME!,
              Item: {
                eventId,
                eventType: 'product.shelf.item.updated.v1',
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
    
    // Fetch updated product to return
    const result = await client.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
    );
    return result.Item ?? item;
  } else {
    // No event needed - just update product
    const result = await client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { productId },
        UpdateExpression: 'SET ' + updates.join(', '),
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );
    return result.Attributes ?? item;
  }
};