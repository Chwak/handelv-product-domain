import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { validateId, requireAuthenticatedUser } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;
const PRODUCT_MEDIA_TABLE_NAME = process.env.PRODUCT_MEDIA_TABLE_NAME;

interface AppSyncEvent {
  arguments?: { productId?: unknown };
  identity?: any;
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "get-product" });
  if (!PRODUCTS_TABLE_NAME) {
    console.error('PRODUCTS_TABLE_NAME is not configured');
    throw new Error('Internal server error');
  }

  const args = event.arguments || {};
  const productId = validateId(args.productId);
  if (!productId) throw new Error('Invalid input format');

  // Authorization: Only makers can read their own products
  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  const productResult = await client.send(
    new GetCommand({
      TableName: PRODUCTS_TABLE_NAME,
      Key: { productId },
    })
  );

  const product = productResult.Item as Record<string, any> | undefined;
  if (!product) throw new Error('Product not found');

  // Verify requester is the product's maker
  if ((product.makerUserId as string) !== auth) {
    throw new Error('Forbidden');
  }

  let media: unknown[] = [];
  if (PRODUCT_MEDIA_TABLE_NAME) {
    const mediaResult = await client.send(
      new QueryCommand({
        TableName: PRODUCT_MEDIA_TABLE_NAME,
        KeyConditionExpression: 'productId = :lid',
        ExpressionAttributeValues: { ':lid': productId },
      })
    );
    media = mediaResult.Items ?? [];
  }

  return { ...product, media };
};