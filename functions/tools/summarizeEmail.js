// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";

export const definition = {
  name: "summarizeEmail",
  description: "Creates a concise summary of the email content" +
    " in a single paragraph",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "A concise paragraph summarizing the key points" +
          " or action items from the email",
      },
    },
    required: ["summary"],
  },
};

export const handler = async (args) => {
  Sentry.logger.info("[8] Tool: email summarized");
  
  return {
    type: "summary",
    text: `Email summary:\n\n${args.summary}`,
  };
};
