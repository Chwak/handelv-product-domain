import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

interface CreateBatchInput {
  productId?: unknown;
  quantity?: unknown;
  producedAt?: unknown;
}

export const handler = async (event: { arguments?: { input?: CreateBatchInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "create-batch" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const productId = validateId(input.productId);
  if (!productId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const quantity = typeof input.quantity === 'number' ? input.quantity : Number(input.quantity ?? 1);
  const producedAt = typeof input.producedAt === 'string' ? input.producedAt : undefined;
  
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const existing = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
  );
  if (!existing.Item) throw new Error('Product not found');
  if (existing.Item.makerUserId !== auth) throw new Error('Forbidden');
  
  // Validate product type supports batches
  if (existing.Item.productType !== 'LIMITED_BATCH') {
    throw new Error('Batches can only be created for LIMITED_BATCH products');
  }

  const batchId = randomUUID();
  const now = new Date().toISOString();
  const newItem: any = { 
    productId,
    batchId, 
    quantity, 
    remainingQuantity: quantity,
    createdAt: now 
  };
  
  if (producedAt) {
    newItem.producedAt = producedAt;
  }

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET batches = list_append(if_not_exists(batches, :empty), :b)',
      ExpressionAttributeValues: { ':empty': [], ':b': [newItem] },
    })
  );
  return newItem;
};