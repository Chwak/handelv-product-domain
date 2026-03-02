import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.MATERIAL_INVENTORY_TABLE_NAME;

export const handler = async (event: { arguments?: { materialId?: unknown }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "get-material-inventory" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const materialId = validateId(event.arguments?.materialId);
  if (!materialId) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { makerUserId: authenticatedUserId, materialId }
  }));

  if (!result.Item) throw new Error('Material not found');
  
  return result.Item;
};