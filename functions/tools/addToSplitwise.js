// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {
  splitwiseClient,
  checkSplitwiseError,
  createSharedExpense,
  getPersonRegistry,
} from "../utils/splitwise.js";

const SPLITWISE_LINK = {url: "https://secure.splitwise.com/#/activity", label: "View in Splitwise"};

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
        description: "Any remaining context about the expense " +
          "not captured by other fields",
      },
      split_with: {
        type: Type.ARRAY,
        items: {type: Type.STRING},
        description: "Lowercase names of people to split with " +
          "(e.g., [\"georgia\", \"panda\"]). Omit to log for yourself only.",
      },
      paid_by: {
        type: Type.STRING,
        description: "Lowercase name of who paid (e.g., \"georgia\"). " +
          "Defaults to \"gui\" if omitted.",
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
  const confidence = Math.round(args.confidence * 100);

  // Format amount for display
  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: args.currency,
  }).format(args.amount);

  const names = (args.split_with ?? []).map((n) => n.toLowerCase());

  if (names.length > 0) {
    const registry = getPersonRegistry();

    // Resolve payer ID (defaults to Gui)
    const payerName = args.paid_by?.toLowerCase();
    const payerId = payerName ?
      registry.get(payerName) : process.env.SPLITWISE_ID_GUI;
    if (!payerId) throw new Error(`Unknown payer: ${payerName ?? "Gui"}`);

    // Resolve split_with to IDs; always include Gui
    const namedIds = names.map((n) => {
      const id = registry.get(n);
      if (!id) throw new Error(`Unknown person: ${n}`);
      return id;
    });
    const allIds = [...new Set([process.env.SPLITWISE_ID_GUI, ...namedIds])];

    // Others = all participants except the payer
    const otherIds = allIds.filter((id) => id !== payerId);

    const expenseResponse = await createSharedExpense(
      args.title, args.amount, args.currency, otherIds, payerId);

    Sentry.logger.info("[8c] Function: Splitwise expense added", {
      expense: expenseResponse.data,
    });

    const withNames = names.join(", ");
    return {
      type: "splitwise_expense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (split with ${withNames}).`,
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  // Solo log — no co-payers
  const expenseResponse = await splitwiseClient.post("/create_expense", {
    cost: args.amount.toFixed(2),
    description: args.title,
    details: args.details + "\n\nCreated with Guimail",
    currency_code: args.currency,
    group_id: 0, // Direct expense between users
    split_equally: true,
  });
  checkSplitwiseError(expenseResponse.data);
  Sentry.logger.info("[8d] Function: Splitwise expense added", {
    expense: expenseResponse.data,
  });

  return {
    type: "splitwise_expense",
    text: `"${args.title}" of ${formattedAmount} added to Splitwise.` +
      `\n\nDetails: ${args.details}`,
    link: SPLITWISE_LINK,
    confidence,
  };
};
