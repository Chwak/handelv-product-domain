import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

/**
 * Move Product to DRAFT Stage
 * Transition: CREATION → DRAFT
 * 
 * Use case: Maker completes product creation and marks it as draft (not yet published)
 */
export const handler = async (event: { arguments?: { productId?: unknown }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "move-product-to-draft" });
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
  
  // Valid transitions: CREATION → DRAFT
  if (item.status !== 'CREATION') {
    throw new Error('Invalid status transition: Can only move from CREATION to DRAFT');
  }

  const now = new Date().toISOString();
  // ✅ CRITICAL FIX: Added ConditionExpression to prevent race conditions
  const result = await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ConditionExpression: '#status = :creationStatus',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { 
        ':status': 'DRAFT', 
        ':creationStatus': 'CREATION',
        ':now': now 
      },
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes ?? item;
};
