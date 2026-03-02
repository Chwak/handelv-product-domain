import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GlueClient, GetSchemaVersionCommand } from '@aws-sdk/client-glue';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME || '';
const SCHEMA_REGISTRY_NAME = process.env.SCHEMA_REGISTRY_NAME || '';
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

const glueClient = new GlueClient({});
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const schemaValidators = new Map<string, ValidateFunction>();

interface SqsRecord {
  body?: string;
  messageId?: string;
}

interface EventBridgeEnvelope {
  detail?: {
    eventId?: string;
    eventType?: string;
    eventVersion?: number;
    correlationId?: string;
    payload?: Record<string, unknown>;
  };
}

interface ProfileCreatedPayload {
  event?: string;
  userId?: string;
  email?: string;
  displayName?: string;
  shopName?: string;
  createdAt?: string;
}

export const handler = async (
  event: { Records?: SqsRecord[] }
): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> => {
  console.log('========== PRODUCT EVENT CONSUMER LAMBDA START ==========');
  console.log('Incoming event (raw):', JSON.stringify(event, null, 2));

  if (!IDEMPOTENCY_TABLE_NAME) {
    console.error('IDEMPOTENCY_TABLE_NAME not set');
    throw new Error('Internal server error');
  }
  if (!SCHEMA_REGISTRY_NAME) {
    console.error('SCHEMA_REGISTRY_NAME not set');
    throw new Error('Schema registry not configured');
  }

  const recordCount = event.Records?.length ?? 0;
  console.log('Product event consumer invoked', { recordCount });
  console.log('Event Records:', event.Records);

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records || []) {
    const recordId = record.messageId || 'unknown';
    try {
      console.log('---------- Processing Record ----------');
      console.log('Raw record:', JSON.stringify(record, null, 2));

      const body = record.body;
      console.log('Record body:', body);

      if (!body) {
        console.log('No body found in record, skipping');
        continue;
      }

      let eventType: string | undefined;
      let payload: ProfileCreatedPayload;
      let eventId: string | undefined;

      try {
        console.log('Attempting to parse body as JSON');
        const parsed = JSON.parse(body) as SqsRecord & EventBridgeEnvelope & ProfileCreatedPayload;
        console.log('Parsed body:', JSON.stringify(parsed, null, 2));

        if (parsed.detail && typeof parsed.detail === 'object') {
          eventType = parsed.detail.eventType;
          if (eventType) {
            await validateEventDetail(eventType, parsed.detail);
          }
          const detailPayload = parsed.detail.payload;
          if (typeof detailPayload === 'string') {
            payload = JSON.parse(detailPayload) as ProfileCreatedPayload;
          } else if (detailPayload && typeof detailPayload === 'object') {
            payload = detailPayload as ProfileCreatedPayload;
          } else {
            throw new Error('Invalid EventBridge detail payload');
          }
          eventId = parsed.detail.eventId;
        } else {
          console.error('Invalid message format; throwing so message goes to DLQ', { body: body?.slice(0, 200) });
          throw new Error('Invalid message format');
        }
      } catch (e) {
        console.error('Failed to parse SQS/EventBridge message body; throwing so message goes to DLQ', {
          body: body?.slice(0, 200),
          err: e,
        });
        throw e;
      }

      console.log('Final parsed payload:', JSON.stringify(payload, null, 2));

      const userId = payload.userId && typeof payload.userId === 'string' ? payload.userId.trim() : null;
      const email = payload.email && typeof payload.email === 'string' ? payload.email.trim() : null;
      const displayName = payload.displayName && typeof payload.displayName === 'string' ? payload.displayName.trim() : null;
      const shopName = payload.shopName && typeof payload.shopName === 'string' ? payload.shopName.trim() : null;

      console.log('Extracted data:', { userId, email, displayName, shopName, eventType, event: payload.event });

      if (!userId) {
        console.error('Missing userId in payload; throwing so message goes to DLQ', { payload });
        throw new Error('Invalid payload: userId required');
      }

      if (!eventType) {
        console.error('Missing eventType in event details; throwing so message goes to DLQ', { payload });
        throw new Error('Invalid payload: eventType required');
      }

      // Only process profile creation events (collector.profile.created.v1 or maker.profile.created.v1)
      const isCollectorProfileCreated = eventType === 'collector.profile.created.v1';
      const isMakerProfileCreated = eventType === 'maker.profile.created.v1';

      if (!isCollectorProfileCreated && !isMakerProfileCreated) {
        console.log('Unsupported event type, skipping:', { eventType });
        continue;
      }

      const idempotencyKey = eventId || `${userId}:${eventType}`;

      // Check if already processed
      console.log('Checking idempotency lock:', { idempotencyKey });
      try {
        const existingEntry = await client.send(
          new GetCommand({
            TableName: IDEMPOTENCY_TABLE_NAME,
            Key: { idempotencyKey },
          }),
        );

        if (existingEntry.Item) {
          console.log('Duplicate event detected; skipping', { idempotencyKey, userId });
          continue;
        }
      } catch (err) {
        console.error('Failed to check idempotency lock:', err);
        // Continue anyway - worst case we process twice but outbox pattern prevents full duplication
      }

      // For now, just log that we received the event
      // Product domain will handle these events at a read-model level
      // (e.g., indexing maker profiles in a separate "marketplace" table)
      console.log('Received profile creation event for product domain indexing', {
        userId,
        eventType,
        email: email || displayName || shopName,
      });

      // Store idempotency lock
      const now = new Date().toISOString();
      const expiresAtEpoch = Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS;

      try {
        await client.send(
          new PutCommand({
            TableName: IDEMPOTENCY_TABLE_NAME,
            Item: {
              idempotencyKey,
              createdAt: now,
              expiresAt: expiresAtEpoch,
              processed: true,
            },
          }),
        );
        console.log('Idempotency lock recorded', { idempotencyKey });
      } catch (err) {
        console.error('Failed to record idempotency lock:', err);
        // Log but continue - idempotency is best effort
      }
    } catch (err) {
      console.error('Failed to process record', { recordId, err });
      if (record.messageId) {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  console.log('========== PRODUCT EVENT CONSUMER LAMBDA END ==========');
  console.log('Batch item failures:', batchItemFailures);

  return { batchItemFailures };
};

async function getSchemaValidator(eventType: string): Promise<ValidateFunction> {
  const cached = schemaValidators.get(eventType);
  if (cached) return cached;

  const schemaVersion = await glueClient.send(
    new GetSchemaVersionCommand({
      SchemaId: {
        RegistryName: SCHEMA_REGISTRY_NAME,
        SchemaName: eventType,
      },
      SchemaVersionNumber: { LatestVersion: true },
    }),
  );

  if (!schemaVersion.SchemaDefinition) {
    throw new Error(`No schema definition found for ${eventType}`);
  }

  const schema = JSON.parse(schemaVersion.SchemaDefinition);
  const validate = ajv.compile(schema);
  schemaValidators.set(eventType, validate);
  return validate;
}

async function validateEventDetail(eventType: string, detail: unknown): Promise<void> {
  const validate = await getSchemaValidator(eventType);
  const valid = validate(detail);
  if (!valid) {
    const errors = validate.errors?.map((err: { instancePath?: string; message?: string }) => `${err.instancePath} ${err.message}`) || [];
    throw new Error(`Schema validation failed for ${eventType}: ${errors.join('; ')}`);
  }
}
