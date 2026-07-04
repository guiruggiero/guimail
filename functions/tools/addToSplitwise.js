// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {
  getFriendRegistry,
  getSupportedCurrencies,
  createSoloExpense,
  createSharedExpense,
  createExpenseFromShares,
} from "../utils/splitwise.js";

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
          "(e.g., [\"georgia\", \"panda\"]). Omit to log for yourself only. " +
          "Do not use together with shares.",
      },
      paidBy: {
        type: Type.STRING,
        description: "Lowercase name of who paid (e.g., \"georgia\"). " +
          "Defaults to \"gui\" if omitted. Do not use together with shares.",
      },
      shares: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "Lowercase participant name, including " +
                "\"gui\" if involved",
            },
            paid: {
              type: Type.NUMBER,
              description: "Amount this person paid toward the expense " +
                "(0 if they didn't pay)",
            },
            owed: {
              type: Type.NUMBER,
              description: "Amount this person is responsible for",
            },
          },
          required: ["name", "paid", "owed"],
        },
        description: "Only for uneven splits or multiple payers. Include " +
          "every participant. Paid amounts must sum to the total amount, " +
          "and owed amounts must sum to the total amount. Omit entirely " +
          "for a simple equal split with one payer — use splitWith/paidBy " +
          "instead.",
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

// Formats an amount for display, falling back to a plain string if Intl
// doesn't recognize the currency code (Splitwise supports some pseudo/
// unofficial codes, e.g. BTC)
const formatAmount = (amount, currency) => {
  try {
    return new Intl.NumberFormat("en-US", {style: "currency", currency})
      .format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const titleCase = (name) => name.charAt(0).toUpperCase() + name.slice(1);

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }
  const confidence = Math.round(args.confidence * 100);

  // Validate currency against Splitwise's supported list
  const currencyCode = args.currency.toUpperCase();
  const supportedCurrencies = await getSupportedCurrencies();
  if (!supportedCurrencies.has(currencyCode)) {
    throw new Error(`Unsupported currency: ${args.currency}`);
  }
  const formattedAmount = formatAmount(args.amount, currencyCode);

  // Uneven splits / multiple payers via explicit per-person shares
  if (args.shares?.length > 0) {
    const friends = getFriendRegistry();

    const unknownNames = [];
    const resolvedShares = [];
    for (const share of args.shares) {
      const name = share.name.toLowerCase();
      const id = name === "gui" ?
        process.env.SPLITWISE_ID_GUI : friends.get(name);
      if (id) {
        resolvedShares.push({
          userId: id,
          paid: share.paid.toFixed(2),
          owed: share.owed.toFixed(2),
        });
      } else {
        unknownNames.push(name);
      }
    }

    const totalPaid = args.shares.reduce((sum, s) => sum + s.paid, 0);
    const totalOwed = args.shares.reduce((sum, s) => sum + s.owed, 0);
    const sumsValid = Math.abs(totalPaid - args.amount) < 0.01 &&
      Math.abs(totalOwed - args.amount) < 0.01;

    // Fall back to a solo expense if names couldn't be resolved or the
    // shares don't add up
    if (unknownNames.length > 0 || !sumsValid) {
      const issues = [];
      if (unknownNames.length > 0) {
        issues.push(
          `Could not resolve: ${unknownNames.map(titleCase).join(", ")}`);
      }
      if (!sumsValid) issues.push("Paid/owed amounts did not add up");

      const fallbackDetails = [args.details, issues.join("; ")]
        .filter(Boolean).join("\n\n");
      const expenseResponse = await createSoloExpense(
        args.title, args.amount, currencyCode, fallbackDetails, args.date);
      Sentry.logger.info(
        "[8] Tool: Splitwise solo expense added (invalid shares fallback)", {
          expenseId: expenseResponse.data.expenses?.[0]?.id,
          unknownNames,
          sumsValid,
        });

      return {
        type: "splitwiseExpense",
        text: `"${args.title}" of ${formattedAmount} added to ` +
          `Splitwise (solo, ${issues.join("; ").toLowerCase()}).` +
          "\n\nOpen Splitwise to fix this expense.",
        link: SPLITWISE_LINK,
        confidence,
      };
    }

    const expenseResponse = await createExpenseFromShares(
      args.title, args.amount, currencyCode, resolvedShares, args.details,
      args.date);

    Sentry.logger.info("[8] Tool: Splitwise shares expense added", {
      expense: expenseResponse.data,
    });

    const withNames = args.shares.map((s) => titleCase(s.name)).join(", ");
    return {
      type: "splitwiseExpense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (custom split with ${withNames}).`,
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  const names = (args.splitWith ?? []).map((n) => n.toLowerCase());

  if (names.length > 0) {
    const friends = getFriendRegistry();

    // Resolve payer ID (defaults to Gui)
    const payerName = args.paidBy?.toLowerCase();
    const payerId = payerName ?
      friends.get(payerName) : process.env.SPLITWISE_ID_GUI;
    if (!payerId) throw new Error(`Unknown payer: ${payerName ?? "Gui"}`);

    // Resolve names to IDs; collect unknowns instead of throwing
    const unknownNames = [];
    const namedIds = names.reduce((acc, n) => {
      const id = friends.get(n);
      if (id) acc.push(id);
      else unknownNames.push(n);
      return acc;
    }, []);

    // Fall back to solo expense if any names couldn't be resolved
    if (unknownNames.length > 0) {
      const unknownList = unknownNames.map(titleCase).join(", ");
      const fallbackDetails = [
        args.details, `Could not resolve: ${unknownList}`,
      ].filter(Boolean).join("\n\n");
      const expenseResponse = await createSoloExpense(
        args.title, args.amount, currencyCode, fallbackDetails, args.date);
      Sentry.logger.info(
        "[8] Tool: Splitwise solo expense added (unresolved names fallback)", {
          expenseId: expenseResponse.data.expenses?.[0]?.id,
          unknownNames,
        });

      return {
        type: "splitwiseExpense",
        text: `"${args.title}" of ${formattedAmount} added to ` +
          `Splitwise (solo, could not find: ${unknownList}).` +
          "\n\nOpen Splitwise to add the missing people to this expense.",
        link: SPLITWISE_LINK,
        confidence,
      };
    }

    const allIds = [...new Set([process.env.SPLITWISE_ID_GUI, ...namedIds])];

    // Others = all participants except the payer
    const otherIds = allIds.filter((id) => id !== payerId);

    const expenseResponse = await createSharedExpense(
      args.title, args.amount, currencyCode, otherIds, payerId,
      args.details, args.date);

    Sentry.logger.info("[8] Tool: Splitwise shared expense added", {
      expense: expenseResponse.data,
    });

    const withNames = names.map(titleCase).join(", ");
    return {
      type: "splitwiseExpense",
      text: `"${args.title}" of ${formattedAmount} added to ` +
        `Splitwise (split with ${withNames}).`,
      link: SPLITWISE_LINK,
      confidence,
    };
  }

  // Solo log, no co-payers
  const expenseResponse = await createSoloExpense(
    args.title, args.amount, currencyCode, args.details, args.date);
  Sentry.logger.info("[8] Tool: Splitwise solo expense added", {
    expense: expenseResponse.data,
  });

  return {
    type: "splitwiseExpense",
    text: `"${args.title}" of ${formattedAmount} added to Splitwise.` +
      `\n\nDetails: ${args.details}`,
    link: SPLITWISE_LINK,
    confidence,
  };
};
