/**
 * E2E tests for updateModelTemplates pre-flight card-name validation - STDIO transport
 *
 * Validates that updateModelTemplates:
 *   - persists changes when the card template name is correct (happy path)
 *   - rejects unknown card names with a hard error instead of a false success
 *     (AnkiConnect silently ignores unknown names, so without pre-flight
 *     validation the tool would report success while writing nothing)
 *   - rejects mis-cased card names (validation is case-sensitive)
 *   - leaves the model's real templates untouched on rejection
 *
 * Uses a dedicated throwaway model created in beforeAll so built-in models
 * (Basic, Cloze, ...) are never mutated.
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - Built project: npm run build
 */
import { callTool, setTransport, getTransport } from "./helpers";

/** Generate unique suffix to avoid duplicate conflicts */
function uniqueId(): string {
  return String(Date.now()).slice(-8);
}

type Templates = Record<string, { Front: string; Back: string }>;

/** Read the model's templates via the modelTemplates tool */
function readTemplates(modelName: string): Templates {
  const result = callTool("modelTemplates", { modelName });
  expect(result.success).toBe(true);
  expect(result).toHaveProperty("templates");
  return result.templates as Templates;
}

describe("E2E: updateModelTemplates validation (STDIO)", () => {
  const uid = uniqueId();
  const modelName = `STDIO_E2E_TmplModel_${uid}`;

  beforeAll(() => {
    setTransport("stdio");
    expect(getTransport()).toBe("stdio");

    // Dedicated throwaway model so built-in models are never touched
    const result = callTool("createModel", {
      modelName,
      inOrderFields: ["Front", "Back"],
      cardTemplates: [
        {
          Name: "Card 1",
          Front: "{{Front}}",
          Back: "{{FrontSide}}<hr id=answer>{{Back}}",
        },
        {
          Name: "Card 2",
          Front: "{{Back}}",
          Back: "{{FrontSide}}<hr id=answer>{{Front}}",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.modelName).toBe(modelName);
    expect(result.templateCount).toBe(2);
  });

  it("should update templates when the card name is correct (happy path)", () => {
    // Derive the real card name from a fresh read rather than hard-coding
    const before = readTemplates(modelName);
    const cardNames = Object.keys(before);
    expect(cardNames.length).toBeGreaterThan(0);
    const cardName = cardNames[0];

    const newFront = `<div class="e2e-front-${uid}">{{Front}}</div>`;
    const newBack = `{{FrontSide}}<hr id=answer><div class="e2e-back-${uid}">{{Back}}</div>`;

    const result = callTool("updateModelTemplates", {
      modelName,
      templates: {
        [cardName]: { Front: newFront, Back: newBack },
      },
    });

    expect(result.success).toBe(true);
    expect(result.modelName).toBe(modelName);
    expect(result.templateCount).toBe(1);
    expect(result.message).toContain("Successfully updated");

    // Verify the change actually persisted by reading it back
    const after = readTemplates(modelName);
    expect(after[cardName].Front).toBe(newFront);
    expect(after[cardName].Back).toBe(newBack);
  });

  it("should reject an unknown card name and leave templates unchanged", () => {
    // Snapshot the real templates before the rejected call
    const before = readTemplates(modelName);
    const validName = Object.keys(before)[0];
    const unknownName = `Nonexistent Card ${uid}`;

    const result = callTool("updateModelTemplates", {
      modelName,
      templates: {
        [unknownName]: {
          Front: "<b>should never be written</b>",
          Back: "<b>should never be written</b>",
        },
      },
    });

    // (a) Hard error, not a false success
    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain(unknownName);
    expect(result.error).toContain(`"${validName}"`);
    expect(result.message).toBeUndefined();
    expect(result).toHaveProperty("hint");
    expect(result.hint).toContain("case-sensitive");

    // (b) No silent partial write: templates are exactly the pre-call value
    const after = readTemplates(modelName);
    expect(after).toEqual(before);
  });

  it("should reject a mis-cased card name and leave templates unchanged", () => {
    const before = readTemplates(modelName);
    const realName = Object.keys(before)[0];
    const misCasedName = realName.toLowerCase();
    // Sanity check: the mis-cased variant must actually differ
    expect(misCasedName).not.toBe(realName);

    const result = callTool("updateModelTemplates", {
      modelName,
      templates: {
        [misCasedName]: {
          Front: "<b>should never be written</b>",
          Back: "<b>should never be written</b>",
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain(`"${misCasedName}"`);
    expect(result.error).toContain(`"${realName}"`);
    expect(result).toHaveProperty("hint");
    expect(result.hint).toContain("case-sensitive");

    // Model must be unchanged
    const after = readTemplates(modelName);
    expect(after).toEqual(before);
  });

  it("should reject updates for a model that does not exist", () => {
    const missingModel = `STDIO_E2E_NoSuchModel_${uid}`;
    const result = callTool("updateModelTemplates", {
      modelName: missingModel,
      templates: {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      },
    });

    expect(result.success).toBe(false);
    expect(result).toHaveProperty("error");
    expect(result.hint).toContain("modelNames");
  });
});
