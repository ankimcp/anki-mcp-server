import { processClozeField } from "../anki.utils";

describe("processClozeField", () => {
  it("replaces active cloze with [blank] when no hint", () => {
    expect(processClozeField("{{c1::answer}}", 0)).toBe("[blank]");
  });

  it("replaces active cloze with [blank — hint: X] when hint present", () => {
    expect(processClozeField("{{c1::ottawa::starts with o}}", 0)).toBe(
      "[blank — hint: starts with o]",
    );
  });

  it("reveals non-active cloze answers", () => {
    const text =
      "{{c1::ottawa::starts with o}} and {{c2::toronto::starts with t}}";
    expect(processClozeField(text, 0)).toBe(
      "[blank — hint: starts with o] and toronto",
    );
  });

  it("masks the correct cloze when testing c2 (ord=1)", () => {
    const text =
      "{{c1::ottawa::starts with o}} and {{c2::toronto::starts with t}}";
    expect(processClozeField(text, 1)).toBe(
      "ottawa and [blank — hint: starts with t]",
    );
  });

  it("returns text unchanged when no cloze syntax present", () => {
    expect(processClozeField("plain text with no cloze", 0)).toBe(
      "plain text with no cloze",
    );
  });

  it("handles multiple cloze of same number", () => {
    const text = "{{c1::first}} and also {{c1::second}}";
    expect(processClozeField(text, 0)).toBe("[blank] and also [blank]");
  });

  it("reveals answers for skipped cloze numbers", () => {
    const text = "{{c1::one}} {{c2::two}} {{c3::three}}";
    expect(processClozeField(text, 1)).toBe("one [blank] three");
  });
});
