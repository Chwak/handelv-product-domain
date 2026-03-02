import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

interface GenerateCertificateInput {
  productId?: unknown;
  batchId?: unknown;
  recipientName?: unknown;
}

export const handler = async (event: { arguments?: { input?: GenerateCertificateInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "generate-certificate" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const productId = validateId(input.productId);
  if (!productId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const recipientName = typeof input.recipientName === 'string' ? input.recipientName.trim() : '';
  const batchId = input.batchId ? validateId(input.batchId) : null;
  if (recipientName.length < 1 || recipientName.length > 200) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const existing = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
  );
  if (!existing.Item) throw new Error('Product not found');
  if (existing.Item.makerUserId !== auth) throw new Error('Forbidden');

  const certificateId = randomUUID();
  const now = new Date().toISOString();
  const newItem = {
    certificateId,
    batchId: batchId ?? undefined,
    recipientName,
    issuedAt: now,
  };

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET certificates = list_append(if_not_exists(certificates, :empty), :c)',
      ExpressionAttributeValues: { ':empty': [], ':c': [newItem] },
    })
  );
  return newItem;
};