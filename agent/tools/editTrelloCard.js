// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {searchTrelloCards, updateTrelloCard} from "../utils/guiddleware.js";

export const definition = {
  name: "editTrelloCard",
  description: "Updates an existing Trello card: renames it, appends a" +
    " note, or moves it between lists. Use only when the email explicitly" +
    " mentions a 'card' or 'Trello'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "Search text to find the card by title (e.g. the" +
          " task name mentioned in the email). Omit only if this email is" +
          " a reply within an existing Guimail Trello thread, where the" +
          " target card is already known.",
      },
      name: {
        type: Type.STRING,
        description: "New title for the card. Omit if not renaming.",
      },
      note: {
        type: Type.STRING,
        description: "Text to add as a note on the card. Omit if no note" +
          " is being added.",
      },
      list: {
        type: Type.STRING,
        enum: ["todo", "inbox", "prioritized", "doing", "waiting", "done",
          "habits"],
        description: "List to move the card to, by name. Omit if not" +
          " moving to a specific list.",
      },
      direction: {
        type: Type.STRING,
        enum: ["left", "right"],
        description: "Move the card one list left or right along the" +
          " board's fixed list order, instead of a named list. Mutually" +
          " exclusive with list — omit one or the other.",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["confidence"],
  },
};

export const handler = async (args, {trelloCardId} = {}) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Resolve target card: prior thread's card, or a fresh search
  let cardId = trelloCardId;
  if (!cardId) {
    if (!args.query) {
      throw new Error("No card reference: missing query and no prior" +
        " Trello card in this thread");
    }

    const matches = await searchTrelloCards(args.query);

    // Zero or multiple matches: surface candidates to the human
    // Idea: could instead let Gemini pick via compositional function calling
    if (matches.length === 0) {
      Sentry.logger.info("[8] Tool: no Trello card matched", {
        query: args.query,
      });

      return {
        type: "trelloCardNotFound",
        text: `No Trello card found matching "${args.query}". Reply with` +
          " the exact card title to try again.",
        confidence: Math.round(args.confidence * 100),
      };
    }
    if (matches.length > 1) {
      Sentry.logger.info("[8] Tool: ambiguous Trello card match", {
        query: args.query, matchCount: matches.length,
      });

      return {
        type: "trelloCardAmbiguous",
        text: `Found ${matches.length} Trello cards matching` +
          ` "${args.query}":\n\n` +
          matches.map((card) => `"${card.name}" — ${card.url}`).join("\n") +
          "\n\nReply with the exact title to update a specific one.",
        html: `<p>Found ${matches.length} Trello cards matching` +
          ` "${args.query}":</p><ul>` +
          matches.map((card) =>
            `<li><a href="${card.url}">${card.name}</a></li>`).join("") +
          "</ul><p>Reply with the exact title to update a specific one.</p>",
        confidence: Math.round(args.confidence * 100),
      };
    }
    cardId = matches[0].id;
  }

  const result = await updateTrelloCard(cardId, {
    name: args.name, note: args.note, list: args.list,
    direction: args.direction,
  });

  Sentry.logger.info("[8] Tool: Trello card updated", {cardId: result.id});

  // Summarize whichever changes were applied
  const changes = [];
  if (args.name !== undefined) changes.push("renamed");
  if (args.note !== undefined) changes.push("note added");
  if (args.list !== undefined) {
    const listLabel = args.list.charAt(0).toUpperCase() + args.list.slice(1);
    changes.push(`moved to ${listLabel}`);
  }
  if (args.direction !== undefined) {
    changes.push(`moved ${args.direction} on the board`);
  }

  return {
    type: "trelloCardUpdated",
    text: `"${result.name}" updated on Trello (${changes.join(", ")}).`,
    link: {
      url: result.url,
      label: "View in Trello",
    },
    confidence: Math.round(args.confidence * 100),
    trelloCardId: result.id,
  };
};
