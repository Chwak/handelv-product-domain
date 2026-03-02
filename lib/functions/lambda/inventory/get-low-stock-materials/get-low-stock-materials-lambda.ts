import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.MATERIAL_INVENTORY_TABLE_NAME;

export const handler = async (event: { identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "get-low-stock-materials" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  
  // Query all materials for this maker
  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'makerUserId = :userId',
    ExpressionAttributeValues: {
      ':userId': authenticatedUserId
    }
  }));

  const materials = result.Items || [];
  
  // Filter for LOW_STOCK or OUT_OF_STOCK
  const lowStockMaterials = materials.filter(item => 
    item.stockStatus === 'LOW_STOCK' || item.stockStatus === 'OUT_OF_STOCK'
  );

  return lowStockMaterials;
};