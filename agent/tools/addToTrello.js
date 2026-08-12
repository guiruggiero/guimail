// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {createTrelloCard} from "../utils/guiddleware.js";

export const definition = {
  name: "addToTrello",
  description: "Creates a Trello card for an actionable to-do. Use only" +
    " when the email explicitly mentions a 'card' or 'Trello' — for" +
    " open-ended to-dos without that language, use addToTasks instead.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: "Short card title, max 7 words",
      },
      description: {
        type: Type.STRING,
        description: "Any remaining context about the task" +
          " not captured by the title",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["name", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  const description = [args.description, "Created with Guimail"]
    .filter(Boolean).join("\n\n");

  const card = await createTrelloCard({name: args.name, description});

  Sentry.logger.info("[8] Tool: Trello card created", {cardId: card.id});

  return {
    type: "trelloCardCreated",
    text: `"${args.name}" added to Trello.`,
    link: {
      url: card.url,
      label: "View in Trello",
    },
    confidence: Math.round(args.confidence * 100),
    trelloCardId: card.id,
  };
};
