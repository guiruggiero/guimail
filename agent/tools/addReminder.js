// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {createTask} from "../utils/guiddleware.js";

export const definition = {
  name: "addReminder",
  description: "Adds a to-do item to Google Tasks",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Short task title, max 7 words",
      },
      notes: {
        type: Type.STRING,
        description: "Any remaining context about the task" +
          " not captured by the title",
      },
      due: {
        type: Type.STRING,
        description: "Due date (YYYY-MM-DD), only if mentioned or clearly" +
          " implied. Google Tasks only supports a date, not a time of day" +
          " — omit if no date is implied.",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["title", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  const notes = [args.notes, "Created with Guimail"]
    .filter(Boolean).join("\n\n");

  const task = await createTask({title: args.title, notes, due: args.due});

  Sentry.logger.info("[8] Tool: Google Task created", {taskId: task.id});

  return {
    type: "taskCreated",
    text: `"${args.title}" added to Google Tasks.`,
    confidence: Math.round(args.confidence * 100),
  };
};
