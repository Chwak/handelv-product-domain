import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.SUPPLIERS_TABLE_NAME;

interface AddSupplierInput {
  makerUserId?: unknown;
  companyName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  website?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  postalCode?: unknown;
  materialsSupplied?: unknown;
  leadTimeDays?: unknown;
  minimumOrderValue?: unknown;
  paymentTerms?: unknown;
  sustainabilityCertified?: unknown;
  notes?: unknown;
}

const MATERIAL_TYPES = new Set([
  'WOOD', 'METAL', 'LEATHER', 'FABRIC', 'CERAMIC', 'GLASS',
  'STONE', 'PAPER', 'PLASTIC', 'RESIN', 'PAINT', 'FINISH',
  'ADHESIVE', 'HARDWARE', 'PACKAGING', 'OTHER'
]);

export const handler = async (event: { arguments?: { input?: AddSupplierInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "add-supplier" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const input = event.arguments?.input || {};
  const makerUserId = validateId(input.makerUserId);
  if (!makerUserId) throw new Error('Invalid input format');

  if (authenticatedUserId !== makerUserId) throw new Error('Forbidden');

  const companyName = typeof input.companyName === 'string' ? input.companyName.trim() : '';
  const country = typeof input.country === 'string' ? input.country.trim() : '';
  const materialsSupplied = Array.isArray(input.materialsSupplied) ? input.materialsSupplied : [];
  const leadTimeDays = Number(input.leadTimeDays);
  const minimumOrderValue = input.minimumOrderValue === undefined ? undefined : Number(input.minimumOrderValue);

  if (companyName.length < 1 || companyName.length > 200) throw new Error('Invalid input format');
  if (country.length < 1 || country.length > 100) throw new Error('Invalid input format');
  if (!Array.isArray(materialsSupplied) || materialsSupplied.length === 0) throw new Error('Invalid input format');
  if (!materialsSupplied.every((item) => typeof item === 'string' && MATERIAL_TYPES.has(item))) {
    throw new Error('Invalid input format');
  }
  if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) throw new Error('Invalid input format');
  if (minimumOrderValue !== undefined && (!Number.isFinite(minimumOrderValue) || minimumOrderValue < 0)) {
    throw new Error('Invalid input format');
  }

  const supplierId = randomUUID();
  const now = new Date().toISOString();

  const item: any = {
    makerUserId,
    supplierId,
    companyName,
    country,
    materialsSupplied,
    leadTimeDays,
    createdAt: now,
    updatedAt: now,
  };

  if (typeof input.contactName === 'string' && input.contactName.trim()) {
    item.contactName = input.contactName.trim();
  }
  if (typeof input.email === 'string' && input.email.trim()) {
    item.email = input.email.trim();
  }
  if (typeof input.phone === 'string' && input.phone.trim()) {
    item.phone = input.phone.trim();
  }
  if (typeof input.website === 'string' && input.website.trim()) {
    item.website = input.website.trim();
  }
  if (typeof input.address === 'string' && input.address.trim()) {
    item.address = input.address.trim();
  }
  if (typeof input.city === 'string' && input.city.trim()) {
    item.city = input.city.trim();
  }
  if (typeof input.state === 'string' && input.state.trim()) {
    item.state = input.state.trim();
  }
  if (typeof input.postalCode === 'string' && input.postalCode.trim()) {
    item.postalCode = input.postalCode.trim();
  }
  if (typeof input.paymentTerms === 'string' && input.paymentTerms.trim()) {
    item.paymentTerms = input.paymentTerms.trim();
  }
  if (typeof input.notes === 'string' && input.notes.trim()) {
    item.notes = input.notes.trim();
  }
  if (input.sustainabilityCertified === true || input.sustainabilityCertified === false) {
    item.sustainabilityCertified = input.sustainabilityCertified;
  }
  if (minimumOrderValue !== undefined) {
    item.minimumOrderValue = minimumOrderValue;
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return item;
};