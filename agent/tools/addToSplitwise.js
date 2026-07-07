// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {createExpense} from "../utils/guiddleware.js";

const SPLITWISE_LINK = {
  url: "https://secure.splitwise.com/#/activity",
  label: "View in Splitwise",
};

export const definition = {
  name: "addToSplitwise",
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
        description: "3-letter currency code, e.g. USD, EUR, BRL, GBP, JPY",
      },
      details: {
        type: Type.STRING,
        description: "Any remaining context about the expense " +
          "not captured by other fields",
      },
      date: {
        type: Type.STRING,
        description: "ISO date/time the expense actually took place, " +
          "only if mentioned or clearly implied (e.g., a receipt date). " +
          "Omit to use the current time.",
      },
      splitWith: {
        type: Type.ARRAY,
        items: {type: Type.STRING},
        description: "Lowercase names of friends to split with " +
          "(e.g., [\"georgia\", \"panda\"]). Omit to log for yourself only.",
      },
      paidBy: {
        type: Type.STRING,
        description: "Lowercase name of who paid (e.g., \"georgia\"). " +
          "Defaults to \"gui\" if omitted.",
      },
      owedAmounts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "Lowercase participant name, including " +
                "\"gui\" if they owe part of the expense",
            },
            owed: {
              type: Type.NUMBER,
              description: "Amount this person is responsible for",
            },
          },
          required: ["name", "owed"],
        },
        description: "Only for uneven splits, where people owe different " +
          "specified amounts (still a single payer, from paidBy). " +
          "Amounts must sum to the total amount. Omit entirely for a " +
          "simple equal split — do not use together with splitWith.",
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

// Format amount for display, falling back to plain string for codes
const formatAmount = (amount, currency) => {
  try {
    return new Intl.NumberFormat("en-US", {style: "currency", currency})
      .format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const capitalize = (name) => name.charAt(0).toUpperCase() + name.slice(1);

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }
  const confidence = Math.round(args.confidence * 100);

  // Splitwise's create_expense rejects an invalid currency_code on its own
  const currencyCode = args.currency.toUpperCase();
  const formattedAmount = formatAmount(args.amount, currencyCode);

  // Resolution, fallback logic, and expense creation all live in Guiddleware
  const {expense, fallback, issues, unknownNames} = await createExpense({
    description: args.title,
    amount: args.amount,
    currency: currencyCode,
    details: args.details,
    date: args.date,
    splitWith: args.splitWith,
    paidBy: args.paidBy,
    owedAmounts: args.owedAmounts,
    source: "Guimail",
  });

  Sentry.logger.info("[8] Tool: Splitwise expense added", {
    expenseId: expense?.id, fallback, issues, unknownNames,
  });

  // Uneven-split fallback: unresolved names or amounts didn't sum correctly
  if (fallback === "solo" && issues) {
    return {
      type: "splitwiseExpense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (solo, ${issues.join("; ").toLowerCase()}).` +
        "\n\nOpen Splitwise to fix this expense.",
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  // Equal-split fallback: one or more names couldn't be resolved
  if (fallback === "solo" && unknownNames) {
    const unknownList = unknownNames.map(capitalize).join(", ");
    return {
      type: "splitwiseExpense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (solo, could not find: ${unknownList}).` +
        "\n\nOpen Splitwise to add the missing people to this expense.",
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  // Uneven split, resolved successfully
  if (args.owedAmounts?.length > 0) {
    const withNames = args.owedAmounts
      .map(({name}) => capitalize(name)).join(", ");
    return {
      type: "splitwiseExpense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (custom split with ${withNames}).`,
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  // Equal split, resolved successfully
  const names = (args.splitWith ?? []).map((n) => n.toLowerCase());
  if (names.length > 0) {
    const withNames = names.map(capitalize).join(", ");
    return {
      type: "splitwiseExpense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (split with ${withNames}).`,
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  // Solo log, no co-payers
  return {
    type: "splitwiseExpense",
    text: `"${args.title}" of ${formattedAmount} added to Splitwise.` +
      `\n\nDetails: ${args.details}`,
    link: SPLITWISE_LINK,
    confidence,
  };
};
