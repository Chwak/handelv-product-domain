import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.MATERIAL_INVENTORY_TABLE_NAME;

interface UpdateStockInput {
  materialId?: unknown;
  currentStock?: unknown;
}

export const handler = async (event: { arguments?: { input?: UpdateStockInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "update-material-stock" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const input = event.arguments?.input || {};
  const materialId = validateId(input.materialId);
  const newStock = Number(input.currentStock);

  if (!materialId) throw new Error('Invalid input format');
  if (!Number.isFinite(newStock) || newStock < 0) throw new Error('Invalid stock value');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  
  // Get current material to verify ownership and calculate stock status
  const getResult = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { makerUserId: authenticatedUserId, materialId }
  }));

  if (!getResult.Item) throw new Error('Material not found');
  
  const reorderThreshold = getResult.Item.reorderThreshold || 0;
  let stockStatus = 'IN_STOCK';
  if (newStock === 0) {
    stockStatus = 'OUT_OF_STOCK';
  } else if (newStock <= reorderThreshold) {
    stockStatus = 'LOW_STOCK';
  }

  const now = new Date().toISOString();

  const updateResult = await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { makerUserId: authenticatedUserId, materialId },
    UpdateExpression: 'SET currentStock = :stock, stockStatus = :status, updatedAt = :now',
    ExpressionAttributeValues: {
      ':stock': newStock,
      ':status': stockStatus,
      ':now': now
    },
    ReturnValues: 'ALL_NEW'
  }));

  return updateResult.Attributes;
};