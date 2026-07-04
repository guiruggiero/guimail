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

// Skip the getSupportedCurrencies() lookup for these, no need for it
const COMMON_CURRENCIES = new Set(["USD", "EUR", "BRL"]);

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

// Resolves a lowercase name to a Splitwise ID; "gui" is the account owner
// (not a friend), everyone else comes from the friend registry
const resolveId = (name, friends) =>
  name === "gui" ? process.env.SPLITWISE_ID_GUI : friends.get(name);

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }
  const confidence = Math.round(args.confidence * 100);

  // Validate uncommon currencies against Splitwise's supported list; if the
  // lookup itself fails, skip it and let create_expense reject it instead -
  // this must not become a failure point for expense creation
  const currencyCode = args.currency.toUpperCase();
  if (!COMMON_CURRENCIES.has(currencyCode)) {
    let supportedCurrencies;
    try {
      supportedCurrencies = await getSupportedCurrencies();
    } catch (error) {
      Sentry.logger.warn(
        "[8] Tool: Splitwise currency lookup failed, skipping validation", {
          currency: currencyCode,
          error: error.message,
        });
    }
    if (supportedCurrencies && !supportedCurrencies.has(currencyCode)) {
      throw new Error(`Unsupported currency: ${args.currency}`);
    }
  }
  const formattedAmount = formatAmount(args.amount, currencyCode);

  const names = (args.splitWith ?? []).map((n) => n.toLowerCase());
  const hasOwedAmounts = args.owedAmounts?.length > 0;

  if (names.length > 0 || hasOwedAmounts) {
    const friends = getFriendRegistry();

    // Resolve payer ID (defaults to Gui)
    const payerName = args.paidBy?.toLowerCase();
    const payerId = resolveId(payerName ?? "gui", friends);
    if (!payerId) throw new Error(`Unknown payer: ${payerName ?? "Gui"}`);

    // Uneven split: single payer, different owed amounts per person
    if (hasOwedAmounts) {
      const unknownNames = [];
      const resolvedOwed = [];
      for (const {name, owed} of args.owedAmounts) {
        const lowerName = name.toLowerCase();
        const id = resolveId(lowerName, friends);
        if (id) resolvedOwed.push({userId: id, owed});
        else unknownNames.push(lowerName);
      }

      const totalOwed = args.owedAmounts.reduce((sum, s) => sum + s.owed, 0);
      const sumValid = Math.abs(totalOwed - args.amount) < 0.01;

      // Fall back to a solo expense if names couldn't be resolved or the
      // owed amounts don't add up
      if (unknownNames.length > 0 || !sumValid) {
        const issues = [];
        if (unknownNames.length > 0) {
          const unknownList = unknownNames
            .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
            .join(", ");
          issues.push(`Could not resolve: ${unknownList}`);
        }
        if (!sumValid) issues.push("Owed amounts did not add up");

        const fallbackDetails = [args.details, issues.join("; ")]
          .filter(Boolean).join("\n\n");
        const expenseResponse = await createSoloExpense(
          args.title, args.amount, currencyCode, fallbackDetails, args.date);
        Sentry.logger.info(
          "[8] Tool: Splitwise solo expense added (invalid split fallback)", {
            expenseId: expenseResponse.data.expenses?.[0]?.id,
            unknownNames,
            sumValid,
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

      // The payer is always a participant, even if they don't owe anything
      const payerIncluded = resolvedOwed.some((s) => s.userId === payerId);
      const shares = resolvedOwed.map(({userId, owed}) => ({
        userId,
        paid: userId === payerId ? args.amount.toFixed(2) : "0.00",
        owed: owed.toFixed(2),
      }));
      if (!payerIncluded) {
        shares.push({
          userId: payerId, paid: args.amount.toFixed(2), owed: "0.00",
        });
      }

      const expenseResponse = await createExpenseFromShares(
        args.title, args.amount, currencyCode, shares, args.details,
        args.date);

      Sentry.logger.info("[8] Tool: Splitwise uneven-split expense added", {
        expense: expenseResponse.data,
      });

      const withNames = args.owedAmounts
        .map(({name}) => name.charAt(0).toUpperCase() + name.slice(1))
        .join(", ");
      return {
        type: "splitwiseExpense",
        text: `"${args.title}" of ${formattedAmount} added to ` +
          `Splitwise (custom split with ${withNames}).`,
        link: SPLITWISE_LINK,
        confidence,
      };
    }

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
      const unknownList = unknownNames
        .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
        .join(", ");
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

    const withNames = names
      .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
      .join(", ");
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
