/**
 * Zod → OpenAPI schema bridge.
 *
 * Request schemas in this document are DERIVED from the very schemas the server
 * validates with, never retyped. Hand-maintained API docs drift the moment
 * someone adds a field, and drifted docs are worse than none: they are believed.
 * Here, adding a field to a validation schema changes the published contract in
 * the same commit, or the type-check fails.
 *
 * Zod 4 converts to JSON Schema natively (`z.toJSONSchema`), so this needs no
 * extra dependency — only the adjustments below, where JSON Schema and OpenAPI
 * disagree.
 */

import { z } from "zod";

/** A JSON Schema object, loosely typed — OpenAPI accepts arbitrary keywords. */
export type JsonSchema = Record<string, unknown>;

/**
 * Converts a Zod schema to the JSON Schema OpenAPI expects.
 *
 * `io: "input"` is the important flag. Several schemas transform their input —
 * `booleanish` turns the string "false" into `false`, prices arrive as strings
 * and stay strings, emails are lowercased. Callers send the INPUT shape, so
 * documenting the output would describe a request nobody makes.
 *
 * `unrepresentable: "any"` keeps generation from throwing on constructs JSON
 * Schema cannot express (`z.coerce.date()`, most notably). Those come back as
 * an empty schema and are repaired by the override below.
 */
export const toOpenApiSchema = (schema: z.ZodType): JsonSchema => {
  const converted = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
    override: (context) => {
      const def = context.zodSchema._zod.def;

      /**
       * Dates arrive over HTTP as ISO strings — there is no date type in JSON —
       * and `z.coerce.date()` parses them. JSON Schema renders that as `{}`,
       * which tells a reader nothing, so it is restored to the string format
       * that actually goes on the wire.
       */
      if (def.type === "date") {
        context.jsonSchema.type = "string";
        context.jsonSchema.format = "date-time";
        context.jsonSchema.description ??=
          "ISO 8601 timestamp, e.g. 2026-07-27T19:30:00.000Z";
      }
    },
  }) as JsonSchema;

  // $schema belongs to a standalone JSON Schema document. Inside an OpenAPI
  // components block it is noise, and some tooling rejects it outright.
  delete converted.$schema;

  return converted;
};

/**
 * Splits an object schema into OpenAPI parameter objects.
 *
 * Query strings and path segments are documented one parameter at a time rather
 * than as a single body-like object, which is what makes Swagger UI render a
 * labelled input per field instead of a JSON textarea.
 */
export const toParameters = (
  schema: z.ZodType,
  location: "query" | "path"
): JsonSchema[] => {
  const converted = toOpenApiSchema(schema);
  const properties = (converted.properties ?? {}) as Record<string, JsonSchema>;
  const required = (converted.required ?? []) as string[];

  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: location,
    // Every path parameter is required by definition; a query parameter is
    // required only if the schema says so.
    required: location === "path" ? true : required.includes(name),
    description: property.description,
    schema: property,
  }));
};

/** Wraps a schema as an `application/json` request body. */
export const jsonBody = (schema: z.ZodType, description?: string): JsonSchema => ({
  required: true,
  description,
  content: { "application/json": { schema: toOpenApiSchema(schema) } },
});

/**
 * A `multipart/form-data` body: text fields from the Zod schema, plus the file.
 *
 * The menu-image endpoints accept multipart rather than JSON, so every field
 * arrives as a string — which is exactly why those schemas coerce numbers and
 * use `booleanish` for flags.
 */
export const multipartBody = (
  schema: z.ZodType,
  file: { field: string; description: string }
): JsonSchema => {
  const converted = toOpenApiSchema(schema);
  const properties = (converted.properties ?? {}) as Record<string, JsonSchema>;

  return {
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          ...converted,
          properties: {
            ...properties,
            [file.field]: {
              type: "string",
              format: "binary",
              description: file.description,
            },
          },
        },
      },
    },
  };
};
