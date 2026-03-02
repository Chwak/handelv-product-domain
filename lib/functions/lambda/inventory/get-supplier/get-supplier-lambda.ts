import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.SUPPLIERS_TABLE_NAME;

interface GetSupplierArgs {
  makerUserId?: unknown;
  supplierId?: unknown;
}

export const handler = async (event: { arguments?: GetSupplierArgs; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "get-supplier" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const args = event.arguments || {};
  const makerUserId = validateId(args.makerUserId);
  const supplierId = validateId(args.supplierId);
  if (!supplierId) throw new Error('Invalid input format');
  if (makerUserId && makerUserId !== authenticatedUserId) throw new Error('Forbidden');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const result = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { makerUserId: authenticatedUserId, supplierId },
  }));

  if (!result.Item) throw new Error('Supplier not found');

  return result.Item;
};