import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

interface AddProcessStepInput {
  productId?: unknown;
  title?: unknown;
  description?: unknown;
  durationMinutes?: unknown;
  mediaUrl?: unknown;
}

export const handler = async (event: { arguments?: { input?: AddProcessStepInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "add-process-step" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const input = event.arguments?.input || {};
  const productId = validateId(input.productId);
  if (!productId) throw new Error('Invalid input format');

  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : undefined;
  const durationMinutes = typeof input.durationMinutes === 'number' ? input.durationMinutes : undefined;
  const mediaUrl = typeof input.mediaUrl === 'string' ? input.mediaUrl.trim() : undefined;
  
  if (title.length < 1 || title.length > 200) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const existing = await client.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { productId } })
  );
  if (!existing.Item) throw new Error('Product not found');
  if (existing.Item.makerUserId !== auth) throw new Error('Forbidden');

  const stepId = randomUUID();
  const now = new Date().toISOString();
  const currentSteps = existing.Item.processSteps || [];
  const stepNumber = currentSteps.length + 1;
  
  const newItem: any = { 
    productId,
    stepId, 
    stepNumber,
    title,
    createdAt: now
  };
  
  // Only include optional fields if provided
  if (description) newItem.description = description;
  if (durationMinutes) newItem.durationMinutes = durationMinutes;
  if (mediaUrl) newItem.mediaUrl = mediaUrl;

  await client.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET processSteps = list_append(if_not_exists(processSteps, :empty), :s)',
      ExpressionAttributeValues: { ':empty': [], ':s': [newItem] },
    })
  );
  return newItem;
};