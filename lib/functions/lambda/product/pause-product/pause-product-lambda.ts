import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

export const handler = async (event: { arguments?: { productId?: unknown }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "pause-product" });
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
  
  // Transition: READY_FOR_SHELF → BASEMENT
  if (item.status !== 'READY_FOR_SHELF') {
    throw new Error('Invalid status transition: Can only pause from READY_FOR_SHELF');
  }

  const now = new Date().toISOString();
  const result = await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'BASEMENT', ':now': now },
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes ?? item;
};