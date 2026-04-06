import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {
  axiosInstance,
  checkSplitwiseError,
  createExpenseWithGeorgia,
} from "../utils/splitwise.js";

export const definition = {
  name: "add_to_splitwise",
  description: "Adds an expense to Splitwise to be shared with other people",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { // Splitwise `description`
        type: Type.STRING,
        description: "Short expense title, max 5 words",
      },
      amount: { // Splitwise `cost`
        type: Type.NUMBER,
        description: "Expense amount without currency sign (e.g., 127.43)",
      },
      currency: {
        type: Type.STRING,
        enum: ["USD", "EUR", "BRL"],
        description: "Expense currency",
      },
      details: {
        type: Type.STRING,
        description: "Summary of all other expense information, including " +
          "the people involved (e.g., 'Share with: Georgia, Panda, and Ma')",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["title", "amount", "currency", "details", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Format amount for display
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: args.currency,
  }).format(args.amount);

  // Google Fi/PG&E split with Georgia
  const isGeorgiaSplit = args.title.toLowerCase().includes("google fi") ||
    args.title.toLowerCase().includes("pg&e");
  if (isGeorgiaSplit) {
    const expenseResponse = await createExpenseWithGeorgia(
      args.title, args.amount, args.currency);

    Sentry.logger.info("[6c] Function: Splitwise expense added", {
      expense: expenseResponse.data,
    });

    return {
      type: "splitwise_expense",
      text: `${args.title} of ${formattedAmount} added to Splitwise`,
    };
  }

  // Add expense on Splitwise
  const expenseResponse = await axiosInstance.post("/create_expense", {
    cost: args.amount.toFixed(2),
    description: args.title,
    details: args.details + "\n\nCreated with Guimail",
    currency_code: args.currency,
    group_id: 0, // Direct expense between users
    split_equally: true,
  });
  checkSplitwiseError(expenseResponse.data);

  return {
    type: "splitwise_expense",
    text: `"${args.title}" of ${formattedAmount} added to ` +
      `Splitwise. Details:\n\n${args.details}\n\nConfidence = ` +
      `${args.confidence * 100}%`,
  };
};
