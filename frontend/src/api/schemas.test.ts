// Compare les schémas Zod à backend/openapi.json : mêmes champs, mêmes champs obligatoires.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaRegistry, Unit, UNITS } from "./schemas";

type JsonSchema = { properties?: Record<string, unknown>; required?: string[]; enum?: string[] };

const openapi = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../backend/openapi.json", import.meta.url)), "utf-8"),
) as { components: { schemas: Record<string, JsonSchema> } };

// schémas internes à FastAPI, et le formulaire d'upload (envoyé en FormData)
const IGNORED = new Set(["HTTPValidationError", "ValidationError", "Body_upload_api_admin_uploads_post", "Unit"]);
const components = Object.entries(openapi.components.schemas).filter(([name]) => !IGNORED.has(name));

function isOptional(schema: z.ZodType): boolean {
  return schema.safeParse(undefined).success;
}

describe("schémas Zod ↔ OpenAPI", () => {
  it("chaque schéma OpenAPI a son équivalent Zod, et réciproquement", () => {
    expect(Object.keys(schemaRegistry).sort()).toEqual(components.map(([name]) => name).sort());
  });

  it.each(components)("%s : mêmes champs, même caractère obligatoire", (name, jsonSchema) => {
    const zodSchema = schemaRegistry[name as keyof typeof schemaRegistry] as unknown as z.ZodObject;
    const shape = zodSchema.shape as Record<string, z.ZodType>;
    expect(Object.keys(shape).sort()).toEqual(Object.keys(jsonSchema.properties ?? {}).sort());
    const requiredInZod = Object.entries(shape)
      .filter(([, field]) => !isOptional(field))
      .map(([key]) => key)
      .sort();
    expect(requiredInZod).toEqual([...(jsonSchema.required ?? [])].sort());
  });

  it("les unités sont les mêmes", () => {
    expect([...UNITS].sort()).toEqual([...(openapi.components.schemas.Unit.enum ?? [])].sort());
    expect(Unit.options).toHaveLength(8);
  });
});
