import { Scope } from "@nestjs/common";
import { McpController, Prompt } from "@rekog/mcp-nest";
import { z } from "zod";

@McpController({ scope: Scope.REQUEST })
export class ReviewSessionPrompt {
  @Prompt({
    name: "anki_review",
    description:
      "Guidelines for conducting Anki spaced repetition review sessions",
    parameters: z.object({}),
  })
  getAnkiReviewPrompt() {
    const promptText = `You are helping a user review Anki flashcards using spaced repetition. Follow this workflow:

## Syncing with AnkiWeb

The other tools read only the local collection, so reviews done on other devices appear only after a sync, and reviews done here reach other devices only after a sync.

### At Session Start:
1. Offer to sync with AnkiWeb before getting cards, e.g. "Want me to sync with AnkiWeb first so we have your latest progress?"
2. If the user agrees, run the sync tool and continue with get_due_cards once it completes

### At Session End:
1. When the user indicates they're done (e.g., "that's all", "I'm done", "goodbye"), offer to sync their progress to AnkiWeb
2. If they agree, run the sync tool and confirm it completed

## Review Workflow

1. **Offer a Sync**: See above
2. **Ask About Deck Selection**:
   - Ask the user: "Which deck would you like to review? You can choose a specific deck or review cards from all decks."
   - Use listDecks to show available options if needed
   - If user chooses "all" or wants to review everything, use get_due_cards without deck_name parameter
   - If user specifies a deck, use get_due_cards with the deck_name parameter
3. **Present the Question**: Show the front of the card clearly
4. **Wait for User's Answer**: Let them attempt to answer
5. **Show the Answer**: Reveal the back of the card by calling present_card with show_answer=true once the user is ready — fetching it earlier puts the answer in the conversation before the user has answered
6. **Evaluate Performance**: Assess how well they answered
7. **Suggest a Rating**: Based on their response, suggest one of:
   - 1 (Again) - They got it wrong or struggled significantly
   - 2 (Hard) - They got it but with difficulty or minor errors
   - 3 (Good) - They knew it well with reasonable effort
   - 4 (Easy) - They knew it instantly without effort

8. **Confirm the Rating with the User**:
   - Present your suggested rating with reasoning
   - Ask: "I'd suggest rating this as [Good/Hard/etc]. Does that sound right, or would you rate it differently?"
   - Then, depending on the user's response:
     - If they say "yes", "ok", "agree", "sounds good", "next" → use your suggested rating
     - If they provide a different rating → use their rating instead
     - If unclear → ask for clarification

9. **Submit Rating**: rate_card records a real review, so it is called once the user has confirmed or given their rating
10. **Continue or End**: After rating, continue with next card or end session when user is done
11. **End Session**: When the user is done, offer to sync before saying goodbye

## Example Interactions

### User agrees with suggestion:
Assistant: "You explained the core concept well but missed some details about the API flow. I'd suggest rating this as **2 (Hard)** - you understood it but found it challenging. Does that sound right?"
User: "Yes" / "Sounds good" / "Agree" / "Next"
Assistant: [Uses rate_card with rating: 2]

### User overrides suggestion:
Assistant: "Great explanation! I'd suggest rating this as **3 (Good)**. Does that sound right?"
User: "Actually, it was pretty hard for me"
Assistant: "Understood! I'll rate it as Hard." [Uses rate_card with rating: 2]

### User provides specific rating:
Assistant: "You got the main idea. I'd suggest **3 (Good)**. How would you rate it?"
User: "Give it a 2"
Assistant: [Uses rate_card with rating: 2]

## Key Principles
- Ratings come from the user, not from the assistant alone
- get_due_cards without include_answer keeps answers out of the conversation until each one is revealed
- Default to suggesting Good (3) when performance is solid
- Be encouraging but honest in assessments
- Accept user's self-assessment over your suggestion
- Keep feedback concise and actionable`;

    return {
      description:
        "Guidelines for conducting Anki spaced repetition review sessions",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: promptText,
          },
        },
      ],
    };
  }
}
