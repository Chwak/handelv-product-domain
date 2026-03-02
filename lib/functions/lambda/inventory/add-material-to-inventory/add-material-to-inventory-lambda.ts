import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.MATERIAL_INVENTORY_TABLE_NAME;

interface AddMaterialInput {
  makerUserId?: unknown;
  materialName?: unknown;
  materialType?: unknown;
  currentStock?: unknown;
  unit?: unknown;
  reorderThreshold?: unknown;
  reorderQuantity?: unknown;
  costPerUnit?: unknown;
  supplierId?: unknown;
  location?: unknown;
  notes?: unknown;
  sustainable?: unknown;
  certified?: unknown;
  certificationId?: unknown;
  originCountry?: unknown;
}

const MATERIAL_TYPES = new Set([
  'WOOD', 'METAL', 'LEATHER', 'FABRIC', 'CERAMIC', 'GLASS', 
  'STONE', 'PAPER', 'PLASTIC', 'RESIN', 'PAINT', 'FINISH', 
  'ADHESIVE', 'HARDWARE', 'PACKAGING', 'OTHER'
]);

const UNITS = new Set([
  'KILOGRAMS', 'GRAMS', 'POUNDS', 'OUNCES', 'LITERS', 'MILLILITERS',
  'METERS', 'CENTIMETERS', 'INCHES', 'FEET', 'SQUARE_METERS', 
  'SQUARE_FEET', 'PIECES', 'SHEETS', 'ROLLS'
]);

export const handler = async (event: { arguments?: { input?: AddMaterialInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "add-material-to-inventory" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const input = event.arguments?.input || {};
  const makerUserId = validateId(input.makerUserId);
  if (!makerUserId) throw new Error('Invalid input format');
  
  if (authenticatedUserId !== makerUserId) throw new Error('Forbidden');

  const materialName = typeof input.materialName === 'string' ? input.materialName.trim() : '';
  const materialType = typeof input.materialType === 'string' ? input.materialType : '';
  const currentStock = Number(input.currentStock);
  const unit = typeof input.unit === 'string' ? input.unit : '';
  const reorderThreshold = Number(input.reorderThreshold);
  const reorderQuantity = Number(input.reorderQuantity);
  const costPerUnit = Number(input.costPerUnit);

  if (materialName.length < 1 || materialName.length > 200) throw new Error('Invalid input format');
  if (!MATERIAL_TYPES.has(materialType)) throw new Error('Invalid material type');
  if (!UNITS.has(unit)) throw new Error('Invalid unit');
  if (!Number.isFinite(currentStock) || currentStock < 0) throw new Error('Invalid stock value');
  if (!Number.isFinite(reorderThreshold) || reorderThreshold < 0) throw new Error('Invalid threshold');
  if (!Number.isFinite(reorderQuantity) || reorderQuantity < 0) throw new Error('Invalid reorder quantity');
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0) throw new Error('Invalid cost');

  const materialId = randomUUID();
  const now = new Date().toISOString();

  // Calculate stock status
  let stockStatus = 'IN_STOCK';
  if (currentStock === 0) {
    stockStatus = 'OUT_OF_STOCK';
  } else if (currentStock <= reorderThreshold) {
    stockStatus = 'LOW_STOCK';
  }

  const item: any = {
    makerUserId,
    materialId,
    materialName,
    materialType,
    currentStock,
    unit,
    reorderThreshold,
    reorderQuantity,
    stockStatus,
    costPerUnit,
    sustainable: input.sustainable === true,
    certified: input.certified === true,
    createdAt: now,
    updatedAt: now
  };

  // Optional fields
  if (typeof input.supplierId === 'string' && input.supplierId.trim()) {
    item.supplierId = input.supplierId.trim();
  }
  if (typeof input.location === 'string' && input.location.trim()) {
    item.location = input.location.trim();
  }
  if (typeof input.notes === 'string' && input.notes.trim()) {
    item.notes = input.notes.trim();
  }
  if (typeof input.certificationId === 'string' && input.certificationId.trim()) {
    item.certificationId = input.certificationId.trim();
  }
  if (typeof input.originCountry === 'string' && input.originCountry.trim()) {
    item.originCountry = input.originCountry.trim();
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  
  return item;
};