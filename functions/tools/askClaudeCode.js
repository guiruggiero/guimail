// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {runPrompt} from "../utils/claudeCode.js";

export const definition = {
  name: "ask_claude_code",
  description: "Forwards a coding task or question to Claude Code, which" +
    " has access to all project repos on the dev server. Use when the email" +
    " contains a development request or question about code.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      typed_instruction: {
        type: Type.STRING,
        description: "The user's instruction verbatim, extracted from the" +
          " beginning of the email up to (not including) the forwarded" +
          " message separator",
      },
      forwarded_content: {
        type: Type.STRING,
        description: "The forwarded email body with all HTML tags, inline" +
          " styles, and image references stripped, but overall structure" +
          " and content otherwise unchanged. Omit if there is no forwarded" +
          " message.",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the extraction (e.g., '0.85')",
      },
    },
    required: ["typed_instruction", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Assemble prompt for Claude Code
  const prompt = args.forwarded_content ?
    `${args.typed_instruction}\n\nContext (forwarded email):\n\n` +
      args.forwarded_content :
    args.typed_instruction;

  // Call Claude Code Gateway
  const {result, session_id: sessionId} = await runPrompt(prompt);

  if (!result) {
    throw new Error("Claude Code returned an empty result");
  }

  Sentry.logger.info("[8a] Function: Claude Code responded", {
    sessionId,
    resultLength: result.length,
  });

  return {
    type: "claude_code_response",
    text: result,
  };
};
