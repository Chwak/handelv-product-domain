import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.STOCK_MOVEMENTS_TABLE_NAME;

interface RecordStockMovementInput {
  makerUserId?: unknown;
  materialId?: unknown;
  movementType?: unknown;
  quantity?: unknown;
  unit?: unknown;
  costPerUnit?: unknown;
  totalCost?: unknown;
  supplierId?: unknown;
  orderId?: unknown;
  productId?: unknown;
  notes?: unknown;
}

const MOVEMENT_TYPES = new Set([
  'PURCHASE',
  'USAGE',
  'WASTE',
  'RETURN_TO_SUPPLIER',
  'ADJUSTMENT',
  'TRANSFER',
  'DAMAGED',
]);

const UNITS = new Set([
  'KILOGRAMS', 'GRAMS', 'POUNDS', 'OUNCES', 'LITERS', 'MILLILITERS',
  'METERS', 'CENTIMETERS', 'INCHES', 'FEET', 'SQUARE_METERS',
  'SQUARE_FEET', 'PIECES', 'SHEETS', 'ROLLS'
]);

const TWO_YEARS_SECONDS = 60 * 60 * 24 * 365 * 2;

export const handler = async (event: { arguments?: { input?: RecordStockMovementInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "record-stock-movement" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const input = event.arguments?.input || {};
  const makerUserId = validateId(input.makerUserId);
  if (!makerUserId) throw new Error('Invalid input format');

  if (authenticatedUserId !== makerUserId) throw new Error('Forbidden');

  const materialId = validateId(input.materialId);
  const movementType = typeof input.movementType === 'string' ? input.movementType : '';
  const quantity = Number(input.quantity);
  const unit = typeof input.unit === 'string' ? input.unit : '';
  const costPerUnit = input.costPerUnit === undefined ? undefined : Number(input.costPerUnit);
  const totalCost = input.totalCost === undefined ? undefined : Number(input.totalCost);

  if (!materialId) throw new Error('Invalid input format');
  if (!MOVEMENT_TYPES.has(movementType)) throw new Error('Invalid movement type');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Invalid quantity');
  if (!UNITS.has(unit)) throw new Error('Invalid unit');
  if (costPerUnit !== undefined && (!Number.isFinite(costPerUnit) || costPerUnit < 0)) {
    throw new Error('Invalid cost');
  }
  if (totalCost !== undefined && (!Number.isFinite(totalCost) || totalCost < 0)) {
    throw new Error('Invalid cost');
  }

  const movementId = randomUUID();
  const movementTimestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + TWO_YEARS_SECONDS;

  const item: any = {
    makerUserId,
    materialId,
    movementId,
    movementType,
    quantity,
    unit,
    movementTimestamp,
    ttl,
    'movementTimestamp#materialId': `${movementTimestamp}#${materialId}`,
  };

  if (costPerUnit !== undefined) item.costPerUnit = costPerUnit;
  if (totalCost !== undefined) {
    item.totalCost = totalCost;
  } else if (costPerUnit !== undefined) {
    item.totalCost = Number((costPerUnit * quantity).toFixed(2));
  }

  if (typeof input.supplierId === 'string' && input.supplierId.trim()) {
    item.supplierId = input.supplierId.trim();
  }
  if (typeof input.orderId === 'string' && input.orderId.trim()) {
    item.orderId = input.orderId.trim();
  }
  if (typeof input.productId === 'string' && input.productId.trim()) {
    item.productId = input.productId.trim();
  }
  if (typeof input.notes === 'string' && input.notes.trim()) {
    item.notes = input.notes.trim();
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return item;
};