import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for renaming a field in an existing note type
 */
@McpController()
export class RenameModelFieldTool {
  private readonly logger = new Logger(RenameModelFieldTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "renameModelField",
    description:
      "Rename a field in an existing Anki note type (model). " +
      "Anki rewrites references to the old name in the note type's card templates (e.g., {{OldName}} becomes {{NewName}}); " +
      "Anki then validates all card templates when the note type is saved, and if any is invalid (for example it cannot be parsed, references a field the note type does not have, or has no field on the front), the rename fails. " +
      "Field names are case-sensitive; modelFieldNames lists the current ones.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe(
          'Name of the note type to modify (e.g., "Basic", "Latin Vocabulary")',
        ),
      oldFieldName: z
        .string()
        .min(1)
        .describe('Current name of the field to rename (e.g., "Notes")'),
      newFieldName: z
        .string()
        .min(1)
        .describe('New name for the field (e.g., "Grammar Notes")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      oldFieldName: z.string(),
      newFieldName: z.string(),
      message: z.string(),
    }),
    annotations: {
      title: "Rename Field in Note Type",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async renameModelField(
    @Payload()
    {
      modelName,
      oldFieldName,
      newFieldName,
    }: {
      modelName: string;
      oldFieldName: string;
      newFieldName: string;
    },
  ) {
    try {
      this.logger.log(
        `Renaming field "${oldFieldName}" → "${newFieldName}" in model "${modelName}"`,
      );

      if (oldFieldName === newFieldName) {
        return createErrorResponse(
          new Error(
            `Old and new field names are identical ("${oldFieldName}") — nothing to rename`,
          ),
          {
            modelName,
            oldFieldName,
            newFieldName,
            hint: "The new field name is the same as the current one, so there is nothing to rename.",
          },
        );
      }

      // Pre-flight: validating against the current fields gives clearer
      // errors than AnkiConnect's behavior — a missing source field raises a
      // raw "field was not found in {model}: {field}" upstream, and renaming
      // onto an existing name triggers Anki's ensure-unique mangle that
      // appends a "+" suffix instead of erroring.
      const fields = await this.ankiClient.invoke<string[]>("modelFieldNames", {
        modelName,
      });

      if (!fields || fields.length === 0) {
        return createErrorResponse(
          new Error(`Model "${modelName}" has no fields or does not exist`),
          {
            modelName,
            oldFieldName,
            newFieldName,
            hint: "Model not found. modelNames lists the available models.",
          },
        );
      }

      if (!fields.includes(oldFieldName)) {
        return createErrorResponse(
          new Error(
            `Field "${oldFieldName}" does not exist in model "${modelName}"`,
          ),
          {
            modelName,
            oldFieldName,
            newFieldName,
            hint: "Field names are case-sensitive. modelFieldNames lists the current field names.",
          },
        );
      }

      if (fields.includes(newFieldName)) {
        return createErrorResponse(
          new Error(
            `A field named "${newFieldName}" already exists in model "${modelName}". ` +
              'AnkiConnect would silently mangle the name with a "+" suffix instead of erroring.',
          ),
          {
            modelName,
            oldFieldName,
            newFieldName,
            hint: `A field named "${newFieldName}" already exists in this model.`,
          },
        );
      }

      // Case-variant collision: renaming "Foo" → "foo" is a legitimate case
      // change when it targets the field being renamed itself, so it is
      // allowed only in that case. A case-variant of a *different* field is
      // rejected — two fields differing only in case is almost certainly a
      // mistake.
      const caseVariant = fields.find(
        (f) =>
          f !== oldFieldName && f.toLowerCase() === newFieldName.toLowerCase(),
      );
      if (caseVariant) {
        return createErrorResponse(
          new Error(
            `Field "${newFieldName}" collides with existing field "${caseVariant}" ` +
              `in model "${modelName}" (names differ only in case)`,
          ),
          {
            modelName,
            oldFieldName,
            newFieldName,
            hint: `Field names are case-sensitive, but "${newFieldName}" differs from existing field "${caseVariant}" only in case, and names that differ only in case are rejected.`,
          },
        );
      }

      await this.ankiClient.invoke("modelFieldRename", {
        modelName,
        oldFieldName,
        newFieldName,
      });

      this.logger.log(
        `Successfully renamed field "${oldFieldName}" to "${newFieldName}" in model "${modelName}"`,
      );

      return {
        success: true,
        modelName,
        oldFieldName,
        newFieldName,
        message: `Successfully renamed field "${oldFieldName}" to "${newFieldName}" in model "${modelName}"`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to rename field "${oldFieldName}" in model "${modelName}"`,
        error,
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist")
      ) {
        return createErrorResponse(error, {
          modelName,
          oldFieldName,
          newFieldName,
          hint: "Model or field not found. modelNames and modelFieldNames list the valid names.",
        });
      }

      return createErrorResponse(error, {
        modelName,
        oldFieldName,
        newFieldName,
        hint: "This can happen when Anki is not running or the model or field name is wrong",
      });
    }
  }
}
