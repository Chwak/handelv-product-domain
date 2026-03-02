import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { initTelemetryLogger } from "../../../../utils/telemetry-logger";

const TABLE_NAME = process.env.WAITLIST_TABLE_NAME;

interface CreateWaitlistEntryInput {
  email?: unknown;
  interest?: unknown;
  source?: unknown;
}

const INTEREST_VALUES = new Set(["COLLECTOR", "MAKER", "BOTH"]);

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 200) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return null;
  return trimmed;
}

function normalizeInterest(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toUpperCase();
  if (!INTEREST_VALUES.has(value)) return null;
  return value;
}

function normalizeSource(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 100) return null;
  return trimmed;
}

export const handler = async (event: { arguments?: { input?: CreateWaitlistEntryInput } }) => {
  initTelemetryLogger(event, { domain: "product-domain", service: "create-waitlist-entry" });

  if (!TABLE_NAME) throw new Error("Internal server error");

  const input = event.arguments?.input || {};
  const email = normalizeEmail(input.email);
  const interest = normalizeInterest(input.interest) || "COLLECTOR";
  const source = normalizeSource(input.source) || "landing";

  if (!email) throw new Error("Invalid input format");

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const now = new Date().toISOString();

  const item = {
    email,
    interest,
    source,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(email)",
      })
    );
    return item;
  } catch (error: any) {
    if (error?.name !== "ConditionalCheckFailedException") {
      throw error;
    }
  }

  const existing = await client.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { email },
    })
  );

  return existing.Item ?? item;
};
