import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireAuthenticatedUser, validateId } from '../../../../utils/product-validation';
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.SUPPLIERS_TABLE_NAME;

interface UpdateSupplierInput {
  makerUserId?: unknown;
  supplierId?: unknown;
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
  reliabilityScore?: unknown;
  sustainabilityCertified?: unknown;
  notes?: unknown;
}

const MATERIAL_TYPES = new Set([
  'WOOD', 'METAL', 'LEATHER', 'FABRIC', 'CERAMIC', 'GLASS',
  'STONE', 'PAPER', 'PLASTIC', 'RESIN', 'PAINT', 'FINISH',
  'ADHESIVE', 'HARDWARE', 'PACKAGING', 'OTHER'
]);

export const handler = async (event: { arguments?: { input?: UpdateSupplierInput }; identity?: any }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "update-supplier" });
  if (!TABLE_NAME) throw new Error('Internal server error');

  const authenticatedUserId = requireAuthenticatedUser(event);
  if (!authenticatedUserId) throw new Error('Unauthorized');

  const input = event.arguments?.input || {};
  const makerUserId = validateId(input.makerUserId);
  const supplierId = validateId(input.supplierId);
  if (!makerUserId || !supplierId) throw new Error('Invalid input format');

  if (authenticatedUserId !== makerUserId) throw new Error('Forbidden');

  const updateExpressions: string[] = [];
  const expressionAttributeValues: Record<string, any> = {
    ':updatedAt': new Date().toISOString(),
  };

  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };

  const setIfString = (field: string, value: unknown, maxLen = 200) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (trimmed.length > maxLen) throw new Error('Invalid input format');
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = trimmed;
      updateExpressions.push(`#${field} = :${field}`);
    }
  };

  setIfString('companyName', input.companyName, 200);
  setIfString('contactName', input.contactName, 200);
  setIfString('email', input.email, 200);
  setIfString('phone', input.phone, 50);
  setIfString('website', input.website, 200);
  setIfString('address', input.address, 200);
  setIfString('city', input.city, 100);
  setIfString('state', input.state, 100);
  setIfString('country', input.country, 100);
  setIfString('postalCode', input.postalCode, 20);
  setIfString('paymentTerms', input.paymentTerms, 200);
  setIfString('notes', input.notes, 500);

  if (Array.isArray(input.materialsSupplied)) {
    if (!input.materialsSupplied.every((item) => typeof item === 'string' && MATERIAL_TYPES.has(item))) {
      throw new Error('Invalid input format');
    }
    expressionAttributeNames['#materialsSupplied'] = 'materialsSupplied';
    expressionAttributeValues[':materialsSupplied'] = input.materialsSupplied;
    updateExpressions.push('#materialsSupplied = :materialsSupplied');
  }

  if (input.leadTimeDays !== undefined) {
    const leadTimeDays = Number(input.leadTimeDays);
    if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) throw new Error('Invalid input format');
    expressionAttributeNames['#leadTimeDays'] = 'leadTimeDays';
    expressionAttributeValues[':leadTimeDays'] = leadTimeDays;
    updateExpressions.push('#leadTimeDays = :leadTimeDays');
  }

  if (input.minimumOrderValue !== undefined) {
    const minimumOrderValue = Number(input.minimumOrderValue);
    if (!Number.isFinite(minimumOrderValue) || minimumOrderValue < 0) throw new Error('Invalid input format');
    expressionAttributeNames['#minimumOrderValue'] = 'minimumOrderValue';
    expressionAttributeValues[':minimumOrderValue'] = minimumOrderValue;
    updateExpressions.push('#minimumOrderValue = :minimumOrderValue');
  }

  if (input.reliabilityScore !== undefined) {
    const reliabilityScore = Number(input.reliabilityScore);
    if (!Number.isFinite(reliabilityScore) || reliabilityScore < 0) throw new Error('Invalid input format');
    expressionAttributeNames['#reliabilityScore'] = 'reliabilityScore';
    expressionAttributeValues[':reliabilityScore'] = reliabilityScore;
    updateExpressions.push('#reliabilityScore = :reliabilityScore');
  }

  if (input.sustainabilityCertified === true || input.sustainabilityCertified === false) {
    expressionAttributeNames['#sustainabilityCertified'] = 'sustainabilityCertified';
    expressionAttributeValues[':sustainabilityCertified'] = input.sustainabilityCertified;
    updateExpressions.push('#sustainabilityCertified = :sustainabilityCertified');
  }

  updateExpressions.push('#updatedAt = :updatedAt');

  if (updateExpressions.length === 1) throw new Error('Invalid input format');

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const result = await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { makerUserId, supplierId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: 'attribute_exists(supplierId)',
    ReturnValues: 'ALL_NEW',
  }));

  return result.Attributes;
};