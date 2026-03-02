import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;
const PRODUCT_MEDIA_TABLE_NAME = process.env.PRODUCT_MEDIA_TABLE_NAME;

interface AddProductMediaInput {
  productId?: unknown;
  url?: unknown;
  mediaType?: unknown;
  order?: unknown;
}

export const handler = async (event: { arguments?: { input?: AddProductMediaInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "add-product-media" });
  if (!PRODUCTS_TABLE_NAME || !PRODUCT_MEDIA_TABLE_NAME) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const productId = validateId(input.productId);
  if (!productId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const mediaType = typeof input.mediaType === 'string' ? input.mediaType.trim() : 'image/jpeg';
  const order = typeof input.order === 'number' ? input.order : 0;
  if (url.length < 1 || url.length > 2048) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const existing = await client.send(
    new GetCommand({ TableName: PRODUCTS_TABLE_NAME, Key: { productId } })
  );
  if (!existing.Item) throw new Error('Product not found');
  if (existing.Item.makerUserId !== auth) throw new Error('Forbidden');

  const mediaId = randomUUID();
  const now = new Date().toISOString();
  const item = { productId, mediaId, url, mediaType, order, createdAt: now };

  await client.send(
    new PutCommand({ TableName: PRODUCT_MEDIA_TABLE_NAME, Item: item })
  );
  return item;
};