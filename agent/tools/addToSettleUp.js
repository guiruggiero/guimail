// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {createExpense} from "../utils/guiddleware.js";

export const definition = {
  name: "addToSettleUp",
  description: "Adds an expense to Settle Up, optionally split with Georgia",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Short expense title, max 5 words",
      },
      amount: {
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
      otherPeople: {
        type: Type.ARRAY,
        items: {type: Type.STRING},
        description: "Names of anyone involved besides Gui and Georgia " +
          "(e.g., [\"panda\"]). If present, the expense is always logged " +
          "solely for Gui (Settle Up can't split with anyone else) with " +
          "these names noted in the details, even if Georgia is also " +
          "involved — splitEqually/guiOwes/georgiaOwes/paidBy are ignored " +
          "in that case.",
      },
      splitEqually: {
        type: Type.BOOLEAN,
        description: "True to split the expense 50/50 with Georgia. " +
          "Omit or false to log for yourself only. Only applies when " +
          "otherPeople is not given.",
      },
      guiOwes: {
        type: Type.NUMBER,
        description: "Only for an uneven split: exact amount Gui owes. " +
          "Must be given together with georgiaOwes, summing to amount. " +
          "Do not combine with splitEqually. Only applies when " +
          "otherPeople is not given.",
      },
      georgiaOwes: {
        type: Type.NUMBER,
        description: "Only for an uneven split: exact amount Georgia owes. " +
          "Must be given together with guiOwes, summing to amount. " +
          "Do not combine with splitEqually. Only applies when " +
          "otherPeople is not given.",
      },
      paidBy: {
        type: Type.STRING,
        description: "Lowercase name of who paid: \"gui\" or \"georgia\". " +
          "Only relevant for a split expense. Defaults to \"gui\".",
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

  const currencyCode = args.currency.toUpperCase();
  const formattedAmount = formatAmount(args.amount, currencyCode);

  // Anyone beyond Gui/Georgia forces a solo entry
  const hasOtherPeople = args.otherPeople?.length > 0;
  const hasUnevenSplit = args.guiOwes !== undefined ||
    args.georgiaOwes !== undefined;
  const split = hasOtherPeople ? undefined : (hasUnevenSplit ?
    {gui: args.guiOwes, georgia: args.georgiaOwes} :
    (args.splitEqually ? "equal" : undefined));

  const fullDetails = hasOtherPeople ?
    [args.details, `Also involved: ${args.otherPeople.map(capitalize)
      .join(", ")}`].filter(Boolean).join("\n\n") :
    args.details;

  // Validation/rejection logic lives in Guiddleware
  const {expense} = await createExpense({
    description: args.title,
    amount: args.amount,
    currency: currencyCode,
    details: fullDetails,
    date: args.date,
    split,
    paidBy: hasOtherPeople ? undefined : args.paidBy,
    source: "Guimail",
  });

  Sentry.logger.info("[8] Tool: Settle Up expense added", {
    expenseId: expense?.id,
  });

  if (hasOtherPeople) {
    const withNames = args.otherPeople.map(capitalize).join(", ");
    return {
      type: "settleUpExpense",
      text: `"${args.title}" of ${formattedAmount} added to Settle Up ` +
        `(solo, also involved: ${withNames}).`,
      confidence,
    };
  }

  if (split !== undefined) {
    return {
      type: "settleUpExpense",
      text: `"${args.title}" of ${formattedAmount} added to Settle Up ` +
        `(split with Georgia).`,
      confidence,
    };
  }

  return {
    type: "settleUpExpense",
    text: `"${args.title}" of ${formattedAmount} added to Settle Up.` +
      `\n\nDetails: ${args.details}`,
    confidence,
  };
};
