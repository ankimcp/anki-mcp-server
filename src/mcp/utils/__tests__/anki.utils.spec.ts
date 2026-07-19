import { cleanHtml, extractRenderedCardContent } from "../anki.utils";

describe("cleanHtml", () => {
  it("returns an empty string for empty input", () => {
    expect(cleanHtml("")).toBe("");
  });

  it("strips plain HTML tags", () => {
    expect(cleanHtml("<b>Bold</b> and <i>italic</i>")).toBe("Bold and italic");
  });

  it("removes <style> blocks including their contents", () => {
    expect(cleanHtml("<style>.card { color: red; }</style>Answer text")).toBe(
      "Answer text",
    );
  });

  it("removes <script> blocks including their contents", () => {
    expect(cleanHtml('<script>alert("x")</script>Answer text')).toBe(
      "Answer text",
    );
  });

  it("converts <br> and block-closing tags to newlines", () => {
    expect(cleanHtml("Line 1<br>Line 2")).toBe("Line 1\nLine 2");
    expect(cleanHtml("Line 1<br/>Line 2")).toBe("Line 1\nLine 2");
    expect(cleanHtml("<div>Line 1</div><div>Line 2</div>")).toBe(
      "Line 1\nLine 2",
    );
    expect(cleanHtml("<p>Para 1</p><p>Para 2</p>")).toBe("Para 1\nPara 2");
  });

  it("decodes common HTML entities", () => {
    expect(
      cleanHtml("Tom &amp; Jerry &lt;3 &gt; &quot;q&quot; &#39;s&#39;"),
    ).toBe("Tom & Jerry <3 > \"q\" 's'");
    expect(cleanHtml("a&nbsp;b")).toBe("a b");
  });

  it("decodes &amp; last so double-encoded entities are preserved", () => {
    expect(cleanHtml("&amp;lt;")).toBe("&lt;");
    expect(cleanHtml("&amp;amp;")).toBe("&amp;");
  });

  it("collapses excess whitespace and blank lines", () => {
    expect(cleanHtml("a   \t  b")).toBe("a b");
    expect(cleanHtml("a<br><br><br>b")).toBe("a\nb");
  });

  it("preserves Anki media markers and cloze-rendered text", () => {
    expect(cleanHtml("Listen: [sound:hello.mp3]")).toBe(
      "Listen: [sound:hello.mp3]",
    );
    expect(cleanHtml('<span class="cloze">[...]</span>')).toBe("[...]");
  });
});

describe("extractRenderedCardContent", () => {
  it("extracts front and back for a forward card", () => {
    const result = extractRenderedCardContent({
      question: "¿Cómo estás?",
      answer: "¿Cómo estás?\n\n<hr id=answer>\n\nHow are you?",
    });
    expect(result).toEqual({ front: "¿Cómo estás?", back: "How are you?" });
  });

  it("extracts reversed direction for the reversed card of the same note", () => {
    const result = extractRenderedCardContent({
      question: "Hello",
      answer: "Hello\n\n<hr id=answer>\n\nこんにちは",
    });
    expect(result).toEqual({ front: "Hello", back: "こんにちは" });
  });

  it("keeps only the part after the <hr id=answer> marker", () => {
    const result = extractRenderedCardContent({
      question: "Front",
      answer: "Front<hr id=answer>Back only",
    });
    expect(result.back).toBe("Back only");
  });

  it("matches quoted and self-closing separator variants", () => {
    expect(
      extractRenderedCardContent({
        question: "Q",
        answer: 'Q<hr id="answer">Back',
      }).back,
    ).toBe("Back");
    expect(
      extractRenderedCardContent({
        question: "Q",
        answer: "Q<hr id='answer'>Back",
      }).back,
    ).toBe("Back");
    expect(
      extractRenderedCardContent({
        question: "Q",
        answer: "Q<hr id=answer />Back",
      }).back,
    ).toBe("Back");
  });

  it("matches id=answer regardless of position among other attributes", () => {
    expect(
      extractRenderedCardContent({
        question: "Q",
        answer: 'Q<hr class="sep" id=answer>Back',
      }).back,
    ).toBe("Back");
    expect(
      extractRenderedCardContent({
        question: "Q",
        answer: 'Q<hr id="answer" class="foo">Back',
      }).back,
    ).toBe("Back");
  });

  it("uses the whole answer when no separator is present", () => {
    const result = extractRenderedCardContent({
      question: "Q",
      answer: "Just the back",
    });
    expect(result.back).toBe("Just the back");
  });

  it("strips <style>/<script> blocks embedded in rendered output", () => {
    const result = extractRenderedCardContent({
      question: "<style>.card{}</style>Question",
      answer: "Question<hr id=answer><script>x()</script>Answer",
    });
    expect(result).toEqual({ front: "Question", back: "Answer" });
  });

  it("decodes entities in rendered content", () => {
    const result = extractRenderedCardContent({
      question: "Salt &amp; Pepper",
      answer: "Salt &amp; Pepper<hr id=answer>Se&nbsp;sal",
    });
    expect(result).toEqual({ front: "Salt & Pepper", back: "Se sal" });
  });

  it("handles empty question and answer", () => {
    expect(extractRenderedCardContent({ question: "", answer: "" })).toEqual({
      front: "",
      back: "",
    });
  });
});
