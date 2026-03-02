import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

interface CreateProductInput {
  makerUserId?: unknown;
  title?: unknown;
  description?: unknown;
  categoryId?: unknown;
  productType?: unknown;
  basePrice?: unknown;
  quantityAvailable?: unknown;
}

const PRODUCT_TYPES = new Set(['ONE_OF_ONE', 'LIMITED_BATCH', 'MADE_TO_ORDER']);

export const handler = async (event: { arguments?: { input?: CreateProductInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "create-product" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  // Get authenticated user from Cognito (already validated by AppSync)
  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const input = event.arguments?.input || {};
  const makerUserId = validateId(input.makerUserId);
  if (!makerUserId) throw new Error('Invalid input format');

  // User can only create products for themselves
  if (authenticatedUserId !== makerUserId) throw new Error('Forbidden');

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const categoryId = validateId(input.categoryId);
  const productType = typeof input.productType === 'string' && PRODUCT_TYPES.has(input.productType as any) ? input.productType : null;
  const basePrice = typeof input.basePrice === 'number' ? input.basePrice : Number(input.basePrice);

  if (title.length < 3 || title.length > 200) throw new Error('Invalid input format');
  if (description.length < 20 || description.length > 5000) throw new Error('Invalid input format');
  if (!categoryId || !productType) throw new Error('Invalid input format');
  if (!Number.isFinite(basePrice) || basePrice < 0.01 || basePrice > 999999.99) throw new Error('Invalid input format');

  let quantityAvailable: number | null = null;
  if (input.quantityAvailable != null) {
    const q = Number(input.quantityAvailable);
    if (!Number.isInteger(q) || q < 1 || q > 10000) throw new Error('Invalid input format');
    quantityAvailable = q;
  }
  if (productType === 'LIMITED_BATCH' && (quantityAvailable == null || quantityAvailable < 1)) {
    throw new Error('Invalid input format');
  }
  if ((productType === 'ONE_OF_ONE' || productType === 'MADE_TO_ORDER') && quantityAvailable != null) {
    quantityAvailable = null;
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const countResult = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1-MakerUserId',
      KeyConditionExpression: 'makerUserId = :mid',
      ExpressionAttributeValues: { ':mid': makerUserId },
      Select: 'COUNT',
    })
  );
  if ((countResult.Count ?? 0) >= 100) throw new Error('Maximum product limit reached');

  const now = new Date().toISOString();
  const productId = randomUUID();
  const item = {
    productId,
    makerUserId,
    title,
    description,
    categoryId,
    productType,
    basePrice,
    quantityAvailable: quantityAvailable ?? undefined,
    status: 'CREATION', // Product starts in CREATION stage
    createdAt: now,
    updatedAt: now,
  };

  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
};