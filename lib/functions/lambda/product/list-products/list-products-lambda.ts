import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";
import {
  encodeNextToken,
  parseNextToken,
  validateId,
  validateLimit,
  requireAuthenticatedUser,
} from '../../../../utils/product-validation';

const TABLE_NAME = process.env.PRODUCTS_TABLE_NAME;

interface AppSyncEvent {
  arguments?: {
    makerUserId?: unknown;
    categoryId?: unknown;
    status?: unknown;
    limit?: unknown;
    nextToken?: unknown;
  };
  identity?: any;
}

export const handler = async (event: AppSyncEvent) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "list-products" });
  if (!TABLE_NAME) {
    console.error('PRODUCTS_TABLE_NAME is not configured');
    throw new Error('Internal server error');
  }

  // Authorization: Only makers can list products
  const auth = requireAuthenticatedUser(event);
  if (!auth) throw new Error('Not authenticated');

  const args = event.arguments || {};
  const limit = validateLimit(args.limit, 20, 100);
  const startKey = parseNextToken(args.nextToken);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  let items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  const makerUserId = args.makerUserId ? validateId(args.makerUserId) : null;
  const categoryId = args.categoryId ? validateId(args.categoryId) : null;
  const status = typeof args.status === 'string' && args.status.trim() ? args.status.trim() : null;

  // Enforce that makers can only list their own products
  // (they cannot query other makers' products via categoryId or status filters without explicit makerUserId)
  if (makerUserId && makerUserId !== auth) {
    throw new Error('Forbidden');
  }

  // If no explicit makerUserId provided, default to the authenticated maker
  const effectiveMakerId = makerUserId || auth;

  if (effectiveMakerId) {
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1-MakerUserId',
        KeyConditionExpression: 'makerUserId = :mid',
        ExpressionAttributeValues: { ':mid': effectiveMakerId },
        Limit: limit,
        ExclusiveStartKey: startKey,
        ScanIndexForward: false,
      })
    );
    items = (result.Items ?? []) as Record<string, unknown>[];
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } else if (categoryId) {
    // For category queries, they can only see their own products by category
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1-MakerUserId', // Use maker index and filter
        KeyConditionExpression: 'makerUserId = :mid',
        ExpressionAttributeValues: { ':mid': auth, ':cid': categoryId },
        Limit: limit,
        ExclusiveStartKey: startKey,
        ScanIndexForward: false,
        FilterExpression: 'categoryId = :cid',
      })
    );
    items = (result.Items ?? []) as Record<string, unknown>[];
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } else if (status) {
    // For status queries, list their own products with that status
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1-MakerUserId',
        KeyConditionExpression: 'makerUserId = :mid',
        ExpressionAttributeValues: { ':mid': auth, ':st': status },
        Limit: limit,
        ExclusiveStartKey: startKey,
        ScanIndexForward: false,
        FilterExpression: '#status = :st',
        ExpressionAttributeNames: { '#status': 'status' },
      })
    );
    items = (result.Items ?? []) as Record<string, unknown>[];
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } else {
    // Default: list own products
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1-MakerUserId',
        KeyConditionExpression: 'makerUserId = :mid',
        ExpressionAttributeValues: { ':mid': auth },
        Limit: limit,
        ExclusiveStartKey: startKey,
        ScanIndexForward: false,
      })
    );
    items = (result.Items ?? []) as Record<string, unknown>[];
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  }

  return {
    items,
    nextToken: encodeNextToken(lastKey),
  };
};