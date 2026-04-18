// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {getSheetsClient} from "../utils/googleSheets.js";
import {createExpenseWithGeorgia} from "../utils/splitwise.js";

// Mapping of issuers and row numbers
const issuerToRow = {
  "Chase": "2",
  "Capital One": "3",
  "Amex": "4",
  "Discover": "5",
};

export const definition = {
  name: "addToBudget",
  description: "Adds a credit card statement balance to the budget" +
    " spreadsheet",
  parameters: {
    type: Type.OBJECT,
    properties: {
      issuer: {
        type: Type.STRING,
        enum: ["Chase", "Capital One", "Amex", "Discover"],
        description: "Credit card issuer name",
      },
      balance: {
        type: Type.NUMBER,
        description: "Credit card statement balance without currency sign" +
          " (e.g., 127.43)",
      },
      currency: {
        type: Type.STRING,
        enum: ["USD", "EUR", "BRL"],
        description: "Credit card statement balance currency",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["issuer", "balance", "currency", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Get cached Google Sheets client
  const sheets = await getSheetsClient();

  // Update multiple cells at once
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    resource: {
      valueInputOption: "USER_ENTERED", // Data interpreted as if user typed
      data: [
        {
          range: `Y${issuerToRow[args.issuer]}`,
          values: [[args.balance]], // Must be in a 2D array
        },
        {
          range: `Z${issuerToRow[args.issuer]}`,
          values: [[
            new Date().toLocaleString("en-US", {timeZone: "CET"}),
          ]],
        },
      ],
    },
  });
  Sentry.logger.info("[8a] Tool: Google Sheet updated", {
    issuer: args.issuer,
    balance: args.balance,
    currency: args.currency,
  });

  // Format balance for display
  const formattedBalance = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: args.currency,
  }).format(args.balance);

  // Build response text
  let responseText = `${args.issuer} balance of ${formattedBalance} ` +
    `added to budget spreadsheet.`;

  // Add to Splitwise
  if (args.issuer === "Capital One") {
    const expenseResponse = await createExpenseWithGeorgia(
      "Capital One", args.balance, args.currency);

    Sentry.logger.info("[8b] Tool: Splitwise expense added", {
      expenseId: expenseResponse.data.expenses?.[0]?.id,
    });

    responseText += "\n\nExpense also added to Splitwise.";
  }

  return {
    type: "budget_update",
    text: responseText,
    confidence: Math.round(args.confidence * 100),
  };
};
