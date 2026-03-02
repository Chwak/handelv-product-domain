import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.SUPPLIERS_TABLE_NAME;

interface RemoveSupplierArgs {
  makerUserId?: unknown;
  supplierId?: unknown;
}

export const handler = async (event: { arguments?: RemoveSupplierArgs; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "remove-supplier" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const args = event.arguments || {};
  const makerUserId = validateId(args.makerUserId);
  const supplierId = validateId(args.supplierId);
  if (!supplierId) throw new Error('Invalid input format');
  if (makerUserId && makerUserId !== authenticatedUserId) throw new Error('Forbidden');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await client.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { makerUserId: authenticatedUserId, supplierId },
  }));

  return true;
};