import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.STOCK_MOVEMENTS_TABLE_NAME;

interface GetStockMovementsArgs {
  makerUserId?: unknown;
  materialId?: unknown;
  limit?: unknown;
}

export const handler = async (event: { arguments?: GetStockMovementsArgs; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "get-stock-movements" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const args = event.arguments || {};
  const makerUserId = validateId(args.makerUserId);
  if (makerUserId && makerUserId !== authenticatedUserId) throw new Error('Forbidden');

  const materialId = validateId(args.materialId);
  const limit = Number(args.limit);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 50;

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  if (materialId) {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1-MaterialId',
      KeyConditionExpression: 'materialId = :materialId',
      FilterExpression: 'makerUserId = :userId',
      ExpressionAttributeValues: {
        ':materialId': materialId,
        ':userId': authenticatedUserId,
      },
      ScanIndexForward: false,
      Limit: safeLimit,
    }));

    return {
      items: result.Items || [],
      nextToken: null,
    };
  }

  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'makerUserId = :userId',
    ExpressionAttributeValues: {
      ':userId': authenticatedUserId,
    },
    ScanIndexForward: false,
    Limit: safeLimit,
  }));

  return {
    items: result.Items || [],
    nextToken: null,
  };
};