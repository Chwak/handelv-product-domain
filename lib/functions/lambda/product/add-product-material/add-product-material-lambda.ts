import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

interface AddProductMaterialInput {
  productId?: unknown;
  name?: unknown;
  source?: unknown;
  locallySourced?: unknown;
  upcycled?: unknown;
  sustainable?: unknown;
  certificationId?: unknown;
}

export const handler = async (event: { arguments?: { input?: AddProductMaterialInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "add-product-material" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const productId = validateId(input.productId);
  if (!productId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const source = typeof input.source === 'string' ? input.source.trim() : '';
  const locallySourced = input.locallySourced === true;
  const upcycled = input.upcycled === true;
  const sustainable = input.sustainable === true;
  const certificationId = typeof input.certificationId === 'string' ? input.certificationId.trim() : undefined;
  
  if (name.length < 1 || name.length > 200) throw new Error('Invalid input format');
  if (source.length < 1 || source.length > 200) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const existing = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
  );
  if (!existing.Item) throw new Error('Product not found');
  if (existing.Item.makerUserId !== auth) throw new Error('Forbidden');

  const materialId = randomUUID();
  const now = new Date().toISOString();
  const newItem: any = { 
    productId,
    materialId, 
    name, 
    source,
    locallySourced,
    upcycled,
    sustainable,
    createdAt: now
  };
  
  // Only include certificationId if provided
  if (certificationId) {
    newItem.certificationId = certificationId;
  }

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET materials = list_append(if_not_exists(materials, :empty), :m)',
      ExpressionAttributeValues: { ':empty': [], ':m': [newItem] },
    })
  );
  return newItem;
};