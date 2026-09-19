// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {appendSheetRows} from "../utils/guiddleware.js";

const STOCK_LOAN_LINK = {
  url: "https://docs.google.com/spreadsheets/d/" +
    "1ijdayVxNIsFjXpI2TXxldrXged_kiGkDnPbTr-vzO9o/edit?gid=1490225386",
  label: "View stock loan spreadsheet",
};

export const definition = {
  name: "addStockLoanToSheet",
  description: "Extracts BTG Pactual stock loan (\"Aluguel\") transactions" +
    " from a PDF attachment and appends them to the spreadsheet",
  parameters: {
    type: Type.OBJECT,
    properties: {
      transactions: {
        type: Type.ARRAY,
        description: "One entry per stock loan transaction found in the" +
          " attachment(s)",
        items: {
          type: Type.OBJECT,
          properties: {
            settlementDate: {
              type: Type.STRING,
              description: "\"Data de Liquidação\", the transaction's" +
                " settlement date, in ISO format (YYYY-MM-DD)",
            },
            ticker: {
              type: Type.STRING,
              description: "\"Papel\", the B3 stock ticker (e.g., BERK34)",
            },
            netAmount: {
              type: Type.NUMBER,
              description: "\"Valor Líquido\", the net earnings for this" +
                " transaction, as a plain decimal number with a dot as" +
                " the decimal separator (e.g., 123.45)",
            },
          },
          required: ["settlementDate", "ticker", "netAmount"],
        },
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["transactions", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Validate at least one transaction was found
  if (!args.transactions || args.transactions.length === 0) {
    throw new Error("No stock loan transactions extracted");
  }

  // Append one row per transaction, never overwriting existing data
  await appendSheetRows({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Sheet2!A:C",
    values: args.transactions.map((transaction) => [
      transaction.settlementDate, transaction.ticker, transaction.netAmount,
    ]),
  });
  Sentry.logger.info("[8] Tool: stock loan rows appended", {
    count: args.transactions.length,
  });

  return {
    type: "stockLoanUpdate",
    text: `${args.transactions.length} stock loan transaction(s) added` +
      ` to the spreadsheet.`,
    link: STOCK_LOAN_LINK,
    confidence: Math.round(args.confidence * 100),
  };
};
