import { Test, TestingModule } from "@nestjs/testing";
import { CreateDeckTool } from "../create-deck.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("CreateDeckTool", () => {
  let tool: CreateDeckTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreateDeckTool, AnkiConnectClient],
    }).compile();

    tool = module.get<CreateDeckTool>(CreateDeckTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should successfully create a simple deck", async () => {
    const deckName = "Spanish Vocabulary";
    const deckId = 1651445861967;

    ankiClient.invoke
      .mockResolvedValueOnce({ Default: 1 }) // deckNamesAndIds
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({ Default: 1, [deckName]: deckId }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckId).toBe(deckId);
    expect(result.deckName).toBe(deckName);
    expect(result.parentDeck).toBeUndefined();
    expect(result.parentExisted).toBeUndefined();
    expect(result.message).toContain("Successfully created");
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "deckNamesAndIds");
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "createDeck", {
      deck: deckName,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "deckNamesAndIds");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(3);
  });

  it("should create a parent::child deck structure when parent is new", async () => {
    const deckName = "Languages::Spanish";
    const deckId = 1651445861971;

    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds - parent does not exist
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({ Languages: 20, [deckName]: deckId }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckName).toBe(deckName);
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(result.parentExisted).toBe(false);
    expect(result.message).toContain('Created parent deck "Languages"');
    expect(result.message).toContain('child deck "Spanish"');
  });

  it("should report honestly when parent deck already exists", async () => {
    const deckName = "Languages::Spanish";
    const deckId = 1651445861972;

    ankiClient.invoke
      .mockResolvedValueOnce({ Languages: 10, Other: 11 }) // deckNamesAndIds - parent exists
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({
        Languages: 10,
        Other: 11,
        "Languages::Spanish": deckId,
      }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(result.parentExisted).toBe(true);
    expect(result.message).toContain('Found existing parent deck "Languages"');
    expect(result.message).toContain('created child deck "Spanish"');
  });

  it("should match an existing parent case-insensitively and report its stored spelling", async () => {
    const deckId = 1651445861973;

    ankiClient.invoke
      .mockResolvedValueOnce({ Languages: 10 }) // deckNamesAndIds
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({ Languages: 10, "Languages::Spanish": deckId }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName: "languages::Spanish" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckId).toBe(deckId);
    expect(result.deckName).toBe("Languages::Spanish");
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(result.parentExisted).toBe(true);
    expect(result.message).toContain('Found existing parent deck "Languages"');
    expect(ankiClient.invoke).toHaveBeenCalledWith("createDeck", {
      deck: "languages::Spanish",
    });
  });

  it("should report the parent Anki matched under Unicode case folding, from the stored name", async () => {
    const deckId = 1651445861974;

    ankiClient.invoke
      .mockResolvedValueOnce({ Straße: 55 }) // deckNamesAndIds - no toLowerCase match
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({ Straße: 55, "Straße::Kind": deckId }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName: "STRASSE::Kind" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckId).toBe(deckId);
    expect(result.deckName).toBe("Straße::Kind");
    expect(result.parentDeck).toBe("Straße");
    expect(result.childDeck).toBe("Kind");
    expect(result.parentExisted).toBe(true);
    expect(result.message).toContain('Found existing parent deck "Straße"');
    expect(ankiClient.invoke).toHaveBeenCalledTimes(3);
  });

  it("should fall back to the normalized input name when the post-create lookup fails", async () => {
    const deckId = 1651445861975;

    ankiClient.invoke
      .mockResolvedValueOnce({ Languages: 10 }) // deckNamesAndIds
      .mockResolvedValueOnce(deckId) // createDeck
      .mockRejectedValueOnce(new Error("deckNamesAndIds failed")); // after create

    const rawResult = await tool.execute({
      deckName: " languages :: Spanish ",
    });
    const result = parseToolResult(rawResult);

    expect(rawResult).not.toHaveProperty("isError", true);
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckId).toBe(deckId);
    expect(result.deckName).toBe("Languages::Spanish");
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(result.parentExisted).toBe(true);
  });

  it("should fall back to the normalized input name when the post-create lookup lacks the new id", async () => {
    const deckId = 1651445861976;

    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({ Default: 1 }); // after create, id missing

    const rawResult = await tool.execute({ deckName: "STRASSE::Kind" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckName).toBe("STRASSE::Kind");
    expect(result.parentDeck).toBe("STRASSE");
    expect(result.parentExisted).toBe(false);
    expect(result.message).toContain('Created parent deck "STRASSE"');
  });

  it("should not look up the stored name when createDeck is blocked in read-only mode", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockRejectedValueOnce(
        new Error(
          'Action "createDeck" is blocked: server is running in read-only mode.',
        ),
      ); // createDeck

    const rawResult = await tool.execute({ deckName: "New Deck" });
    const result = parseToolResult(rawResult);

    expect(rawResult).toHaveProperty("isError", true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("read-only mode");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
  });

  it("should reject deck with more than 2 levels", async () => {
    const deckName = "Languages::Spanish::Vocabulary";

    const rawResult = await tool.execute({ deckName });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("maximum 2 levels");
    expect(ankiClient.invoke).not.toHaveBeenCalled();
  });

  it("should reject deck name with empty parts", async () => {
    const rawResult = await tool.execute({ deckName: "::InvalidDeck" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("empty");
    expect(ankiClient.invoke).not.toHaveBeenCalled();
  });

  it.each(["Foo:::", ":"])(
    "should reject %p, whose part is empty once colons are stripped",
    async (deckName) => {
      const rawResult = await tool.execute({ deckName });
      const result = parseToolResult(rawResult);

      expect(rawResult).toHaveProperty("isError", true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
      expect(ankiClient.invoke).not.toHaveBeenCalled();
    },
  );

  it("should report an existing deck with the same case as not created", async () => {
    const deckName = "Existing Deck";

    ankiClient.invoke.mockResolvedValueOnce({
      [deckName]: 42,
      "Other Deck": 43,
    });

    const rawResult = await tool.execute({ deckName });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.isError).toBeUndefined();
    expect(result.message).toContain("already exists");
    expect(result.message).not.toContain("Successfully created");
    expect(result.created).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.deckId).toBe(42);
    expect(result.deckName).toBe(deckName);
    expect(ankiClient.invoke).not.toHaveBeenCalledWith(
      "createDeck",
      expect.anything(),
    );
  });

  it("should match an existing deck case-insensitively and return the stored name", async () => {
    ankiClient.invoke.mockResolvedValueOnce({
      "Languages::Spanish": 77,
    });

    const rawResult = await tool.execute({ deckName: "LANGUAGES::spanish" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.deckId).toBe(77);
    expect(result.deckName).toBe("Languages::Spanish");
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(result.parentExisted).toBe(true);
    expect(result.message).toContain('"Languages::Spanish" already exists');
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
  });

  it("should not call the write action for an existing deck in read-only mode", async () => {
    ankiClient.invoke.mockResolvedValueOnce({ "Read Only Deck": 5 }); // deckNamesAndIds

    const rawResult = await tool.execute({ deckName: "read only deck" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.deckName).toBe("Read Only Deck");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
  });

  it("should report an existing deck as not created when createDeck returns an id the lookup already had", async () => {
    // The name lookup misses (e.g. case folding beyond toLowerCase), but
    // AnkiConnect returns the id of the deck that already exists.
    ankiClient.invoke
      .mockResolvedValueOnce({ Straße: 55, Other: 56 }) // deckNamesAndIds
      .mockResolvedValueOnce(55); // createDeck

    const rawResult = await tool.execute({ deckName: "STRASSE" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.deckId).toBe(55);
    expect(result.deckName).toBe("Straße");
    expect(result.message).toContain('"Straße" already exists');
  });

  it("should send whitespace-padded input to createDeck unchanged and report the name Anki stored", async () => {
    const deckId = 1651445861980;

    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(deckId) // createDeck
      .mockResolvedValueOnce({ Languages: 30, "Languages::Spanish": deckId }); // deckNamesAndIds after create

    const rawResult = await tool.execute({
      deckName: "  Languages  ::  Spanish  ",
    });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckName).toBe("Languages::Spanish");
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(ankiClient.invoke).toHaveBeenCalledWith("createDeck", {
      deck: "  Languages  ::  Spanish  ",
    });
  });

  it("should match whitespace-padded input against an existing deck", async () => {
    ankiClient.invoke.mockResolvedValueOnce({ Spanish: 9 }); // deckNamesAndIds

    const rawResult = await tool.execute({ deckName: "  spanish " });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.deckName).toBe("Spanish");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
  });

  it("should report the name Anki stored for a colon-wrapped single-part name", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(321) // createDeck
      .mockResolvedValueOnce({ Foo: 321 }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName: ":Foo:" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckName).toBe("Foo");
    expect(ankiClient.invoke).toHaveBeenCalledWith("createDeck", {
      deck: ":Foo:",
    });
  });

  it("should strip leading and trailing colons when matching an existing deck", async () => {
    ankiClient.invoke.mockResolvedValueOnce({ Foo: 7 }); // deckNamesAndIds

    const rawResult = await tool.execute({ deckName: ":foo:" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.deckId).toBe(7);
    expect(result.deckName).toBe("Foo");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
  });

  it("should strip leading and trailing colons in the fallback name when the post-create lookup fails", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(321) // createDeck
      .mockRejectedValueOnce(new Error("deckNamesAndIds failed")); // after create

    const rawResult = await tool.execute({ deckName: ":Foo:" });
    const result = parseToolResult(rawResult);

    expect(rawResult).not.toHaveProperty("isError", true);
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckId).toBe(321);
    expect(result.deckName).toBe("Foo");
    expect(result.message).toContain('"Foo"');
  });

  it("should report the name Anki stored for input containing control characters", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(322) // createDeck
      .mockResolvedValueOnce({ Foo: 323, "Foo::Bar": 322 }); // deckNamesAndIds after create

    const rawResult = await tool.execute({ deckName: "Fo\no::Ba\x1fr" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckName).toBe("Foo::Bar");
    expect(ankiClient.invoke).toHaveBeenCalledWith("createDeck", {
      deck: "Fo\no::Ba\x1fr",
    });
  });

  it("should strip ASCII control characters when matching an existing deck", async () => {
    ankiClient.invoke.mockResolvedValueOnce({ "Foo::Bar": 8 }); // deckNamesAndIds

    const rawResult = await tool.execute({ deckName: "Fo\no::Ba\x1fr" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.exists).toBe(true);
    expect(result.deckId).toBe(8);
    expect(result.deckName).toBe("Foo::Bar");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
  });

  it("should strip ASCII control characters in the fallback name when the post-create lookup fails", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(322) // createDeck
      .mockRejectedValueOnce(new Error("deckNamesAndIds failed")); // after create

    const rawResult = await tool.execute({ deckName: "Fo\no::Ba\x1fr" });
    const result = parseToolResult(rawResult);

    expect(rawResult).not.toHaveProperty("isError", true);
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.deckId).toBe(322);
    expect(result.deckName).toBe("Foo::Bar");
    expect(result.parentDeck).toBe("Foo");
    expect(result.childDeck).toBe("Bar");
    expect(result.parentExisted).toBe(false);
  });

  it("should return an error when createDeck returns no deck id", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce({}) // deckNamesAndIds
      .mockResolvedValueOnce(null); // createDeck

    const rawResult = await tool.execute({ deckName: "Test Deck" });
    const result = parseToolResult(rawResult);

    expect(rawResult).toHaveProperty("isError", true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to create deck - unknown error");
  });

  it("should return an error and not create anything when the deck lookup fails", async () => {
    ankiClient.invoke.mockRejectedValueOnce(
      new Error("deckNamesAndIds failed"),
    );

    const rawResult = await tool.execute({ deckName: "Test Deck" });
    const result = parseToolResult(rawResult);

    expect(rawResult).toHaveProperty("isError", true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("deckNamesAndIds failed");
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(ankiClient.invoke).not.toHaveBeenCalledWith(
      "createDeck",
      expect.anything(),
    );
  });

  it("should handle AnkiConnect errors", async () => {
    ankiClient.invoke.mockRejectedValueOnce(new Error("AnkiConnect error"));

    const rawResult = await tool.execute({ deckName: "Test Deck" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("AnkiConnect error");
  });
});
