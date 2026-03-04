import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

interface SeedCard {
  cardId: string;
  name: string;
  setId: string;
  setName: string;
  number: string;
  rarity?: string;
  imageUrl?: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function run(): Promise<void> {
  const tableName = required('TABLE_CARDS');
  const region = process.env.AWS_REGION ?? 'us-west-2';
  const seedFile = process.env.SEED_CARDS_FILE ?? './data/cards.seed.json';

  const fullPath = resolve(seedFile);
  const raw = readFileSync(fullPath, 'utf-8');
  const cards = JSON.parse(raw) as SeedCard[];

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const now = new Date().toISOString();

  for (const card of cards) {
    const normalizedName = normalizeName(card.name);
    const firstLetter = normalizedName.charAt(0) || '#';

    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: `CARD#${card.cardId}`,
          sk: 'META',
          cardId: card.cardId,
          name: card.name,
          normalizedName,
          setId: card.setId,
          setName: card.setName,
          number: card.number,
          rarity: card.rarity,
          imageUrl: card.imageUrl,
          gsi1pk: `SET#${card.setId}`,
          gsi1sk: `NAME#${normalizedName}#NUM#${card.number}`,
          gsi2pk: `NAME#${firstLetter}`,
          gsi2sk: `NAME#${normalizedName}#SET#${card.setId}#NUM#${card.number}`,
          createdAt: now,
          updatedAt: now,
          version: 1
        }
      })
    );
  }

  console.log(`Seeded ${cards.length} cards into ${tableName} (${region}).`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
