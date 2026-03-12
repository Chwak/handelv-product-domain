import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { SQSEvent } from 'aws-lambda';

const PRODUCTS_TABLE_NAME = process.env.PRODUCTS_TABLE_NAME || '';

const dynamodbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface ReadyForShelfPayload {
  proposalId: string;
  makerId: string;
  collectorId: string;
  productId: string;
  newStatus: string;
  updatedAt: string;
}

export const handler = async (event: SQSEvent): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> => {
  console.log('===== COMMISSION READY FOR SHELF CONSUMER (Product Domain) =====');

  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  if (!PRODUCTS_TABLE_NAME) {
    throw new Error('PRODUCTS_TABLE_NAME not configured');
  }

  for (const record of event.Records ?? []) {
    const messageId = record.messageId ?? 'unknown';
    try {
      if (!record.body) throw new Error('Empty SQS message body');

      const envelope = JSON.parse(record.body);
      const detail = (envelope.detail ?? envelope) as ReadyForShelfPayload;

      const { proposalId, makerId, collectorId, productId, updatedAt } = detail;
      if (!productId || !proposalId) {
        throw new Error(`Missing required fields: productId=${productId}, proposalId=${proposalId}`);
      }

      const sealedAt = updatedAt ?? new Date().toISOString();

      await dynamodbDoc.send(
        new UpdateCommand({
          TableName: PRODUCTS_TABLE_NAME,
          Key: { productId },
          UpdateExpression:
            'SET passportSeal = :passportSeal, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':passportSeal': {
              proposalId,
              collectorId,
              makerId,
              commissionedAt: sealedAt,
              sealedAt,
            },
            ':updatedAt': sealedAt,
          },
          ConditionExpression: 'attribute_exists(productId)',
        }),
      );

      console.log('PassportSeal stamped on product', { productId, proposalId, collectorId });
    } catch (err) {
      console.error('Failed to process commission.proposal.ready_for_shelf record', { messageId, err });
      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};
