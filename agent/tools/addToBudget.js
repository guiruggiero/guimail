// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {updateSheet, createExpense} from "../utils/guiddleware.js";

const BUDGET_LINK = {
  url: "https://docs.google.com/spreadsheets/d/" +
    "1GMidO01MErc7MY2tuXa7y-CGINtFhIssQejdG5J5SyY",
  label: "View budget spreadsheet",
};

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

  // Update multiple cells at once, via Guiddleware
  await updateSheet({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
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
    const {expense} = await createExpense({
      description: "Capital One",
      amount: args.balance,
      currency: args.currency,
      paidBy: "gui",
      splitWith: ["georgia"],
      source: "Guimail",
    });

    Sentry.logger.info("[8b] Tool: Splitwise expense added", {
      expenseId: expense?.id,
    });

    responseText += "\n\nExpense also added to Splitwise.";
  }

  return {
    type: "budgetUpdate",
    text: responseText,
    link: BUDGET_LINK,
    confidence: Math.round(args.confidence * 100),
  };
};
