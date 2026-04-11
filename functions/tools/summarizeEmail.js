// Import
import {Type} from "@google/genai";

export const definition = {
  name: "summarize_email",
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
  return {
    type: "summary",
    text: `Email summary:\n\n${args.summary}`,
  };
};
