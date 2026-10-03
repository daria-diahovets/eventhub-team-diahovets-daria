import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { createOrderBody, listEventsQuery } from "../dist/schemas.js";

interface OpenApiDocument {
  paths: {
    "/events": {
      get: {
        parameters: Array<{ name: string; schema?: { minimum?: number; maximum?: number } }>;
      };
    };
  };
  components: {
    schemas: {
      CreateOrderRequest: {
        properties: { quantity: { minimum?: number; maximum?: number } };
      };
    };
  };
}

interface Check {
  name: string;
  specValue: number | undefined | null;
  zodValue: number | null;
}

const openapiPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
const doc = parse(readFileSync(openapiPath, "utf8")) as OpenApiDocument;

const limitParam = doc.paths["/events"].get.parameters.find((p) => p.name === "limit");
const quantityProp = doc.components.schemas.CreateOrderRequest.properties.quantity;

const limitSchema = listEventsQuery.shape.limit.removeDefault();

const checks: Check[] = [
  {
    name: "GET /events?limit - maximum",
    specValue: limitParam?.schema?.maximum,
    zodValue: limitSchema.maxValue,
  },
  {
    name: "GET /events?limit - minimum",
    specValue: limitParam?.schema?.minimum,
    zodValue: limitSchema.minValue,
  },
  {
    name: "CreateOrderRequest.quantity - maximum",
    specValue: quantityProp.maximum,
    zodValue: createOrderBody.shape.quantity.maxValue,
  },
  {
    name: "CreateOrderRequest.quantity - minimum",
    specValue: quantityProp.minimum,
    zodValue: createOrderBody.shape.quantity.minValue,
  },
];

const mismatches = checks.filter((c) => c.specValue !== c.zodValue);

if (mismatches.length > 0) {
  console.error("✖ openapi.yaml і Zod-схеми розійшлися:\n");
  for (const m of mismatches) {
    console.error(`  ${m.name}: openapi.yaml = ${m.specValue}, zod = ${m.zodValue}`);
  }
  console.error(
    "\nОновіть обидва джерела (packages/contracts/openapi.yaml і src/schemas.ts) синхронно. Див. docs/adr/0002-contract-bounds-sync.md.",
  );
  process.exit(1);
}

console.log(`✓ Межі openapi.yaml і Zod-схем синхронні (перевірено ${checks.length}).`);
