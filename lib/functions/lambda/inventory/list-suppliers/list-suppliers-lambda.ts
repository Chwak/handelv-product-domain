import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.SUPPLIERS_TABLE_NAME;

interface ListSuppliersArgs {
  makerUserId?: unknown;
  limit?: unknown;
}

export const handler = async (event: { arguments?: ListSuppliersArgs; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "list-suppliers" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const args = event.arguments || {};
  const makerUserId = validateId(args.makerUserId);
  if (makerUserId && makerUserId !== authenticatedUserId) throw new Error('Forbidden');

  const limit = Number(args.limit);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50;

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'makerUserId = :userId',
    ExpressionAttributeValues: {
      ':userId': authenticatedUserId,
    },
    Limit: safeLimit,
  }));

  return {
    items: result.Items || [],
    nextToken: null,
  };
};