// Imports
import * as Sentry from "@sentry/node";
import {GoogleGenAI, Type, FunctionCallingConfigMode} from "@google/genai";
import {LangfuseClient} from "@langfuse/client";
import {fileURLToPath} from "node:url";
import {onRequest} from "firebase-functions/v2/https";
import PostalMime from "postal-mime";
import ical from "ical-generator";
import {google} from "googleapis";
import path from "node:path";
import axios from "axios";
import axiosRetry from "axios-retry";
import MailComposer from "nodemailer/lib/mail-composer/index.js";

// Initializations
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enableLogs: true,
});
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const langfuse = new LangfuseClient({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: "https://us.cloud.langfuse.com",
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Model tools
const createCalendarEvent = {
  name: "create_calendar_event",
  description: "Creates a calendar event with details extracted from the" +
    " email message including title and time, location, and description",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "Event title/name, max 7 words",
      },
      start: {
        type: Type.STRING,
        description: "Event start date and time in" +
          " ISO-8601 format (YYYY-MM-DDTHH:MM:SS)",
      },
      end: {
        type: Type.STRING,
        description: "Event end date and time in" +
          " ISO-8601 format (YYYY-MM-DDTHH:MM:SS)",
      },
      timeZone: {
        type: Type.STRING,
        description: "Event time zone in" +
          " IANA identifier (e.g., 'America/Los_Angeles')",
      },
      location: {
        type: Type.STRING,
        description: "Event location, be it physical or virtual",
      },
      description: {
        type: Type.STRING,
        description: "Additional details of the event," +
          " followed by the email subject line",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["summary", "start", "end", "timeZone", "confidence"],
  },
};
const summarizeEmail = {
  name: "summarize_email",
  description: "Creates a concise summary of the email content" +
    " in a single paragraph",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "A concise paragraph summarizing the key points" +
          " or action items from the email",
      },
    },
    required: ["summary"],
  },
};
const addToBudget = {
  name: "add_to_budget",
  description: "Adds a credit card statement balance to the budget" +
    " spreadsheet",
  parameters: {
    type: Type.OBJECT,
    properties: {
      issuer: {
        type: Type.STRING,
        enum: ["Chase", "Capital One", "Amex", "TF Bank", "Discover"],
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
const addToSplitwise = {
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

// Model configuration
const modelConfig = {
  model: "gemini-pro-latest",
  config: {
    temperature: 0.1,
    thinkingconfig: {
      thinkingbudget: 0,
    },
    tools: [{
      functionDeclarations: [
        createCalendarEvent,
        summarizeEmail,
        addToBudget,
        addToSplitwise,
      ],
    }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
      },
    },
  },
};

// Axios instance for Splitwise
const axiosInstance = axios.create({
  baseURL: "https://secure.splitwise.com/api/v3.0",
  headers: {"Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`},
});

// Retry configuration
axiosRetry(axiosInstance, {
  retries: 2, // Retry attempts
  retryDelay: axiosRetry.exponentialDelay, // 1s then 2s between retries
  // Only retry on network or 5xx errors
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500);
  },
});

// Splitwise error checker
const checkSplitwiseError = (expenseData) => {
  const {error, errors} = expenseData;

  if (error) throw new Error(`Splitwise API: ${error}`); // {error: ""}

  if (errors && Object.keys(errors).length > 0) { // {errors: {base: [""]}}
    const errorMessage = Object.values(errors).flat().join(", ");
    throw new Error(`Splitwise API: ${errorMessage}`);
  }
};

// Tool handlers
const toolHandlers = {
  create_calendar_event: async (args) => {
    // Validate confidence threshold
    if (args.confidence < 0.5) {
      throw new Error(`Low confidence: ${args.confidence}`);
    }

    // Create iCal invite
    const cal = ical({prodId: "//Gui Ruggiero//GuiMail//EN"});
    cal.createEvent({
      start: new Date(args.start),
      end: new Date(args.end),
      timezone: args.timeZone,
      summary: args.summary,
      description: args.description + "\n\nCreated with GuiMail",
      location: args.location,
    });
    const icsString = cal.toString();

    return {
      type: "calendar_event",
      text: `Event created. Confidence = ${args.confidence * 100}%`,
      icalEvent: {
        method: "REQUEST",
        content: icsString,
      },
    };
  },

  summarize_email: async (args) => {
    return {
      type: "summary",
      text: `Email summary:\n\n${args.summary}`,
    };
  },

  add_to_budget: async (args) => {
    // Validate confidence threshold
    if (args.confidence < 0.5) {
      throw new Error(`Low confidence: ${args.confidence}`);
    }

    // Create authenticated Google Sheets client
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, "service-account-key.json"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({version: "v4", auth});

    // Mapping of issuers and row numbers
    const issuerToRow = {
      "Chase": "2",
      "Capital One": "3",
      "Amex": "4",
      "TF Bank": "5",
      "Discover": "6",
    };

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
            values: [[new Date().toLocaleString("en-US", {timeZone: "CET"})]],
          },
        ],
      },
    });
    Sentry.logger.info("[6a] Function: Google Sheet updated");

    // Format balance for display
    const formattedBalance = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: args.currency,
    }).format(args.balance);

    // Build response text
    let responseText = `${args.issuer} balance of ${formattedBalance} ` +
      `added to budget spreadsheet\nConfidence = ${args.confidence * 100}%`;

    // Add to Splitwise
    if (args.issuer === "Capital One") {
      // Add expense on Splitwise
      const expenseResponse = await axiosInstance.post("/create_expense", {
        cost: args.balance.toFixed(2),
        description: "Capital One",
        details: "Created via GuiMail",
        currency_code: args.currency,
        group_id: 0, // Direct expense between users
        users__0__user_id: process.env.SPLITWISE_GUI_ID,
        users__0__paid_share: args.balance.toFixed(2),
        users__0__owed_share: (args.balance / 2).toFixed(2),
        users__1__user_id: process.env.SPLITWISE_GEORGIA_ID,
        users__1__paid_share: "0",
        users__1__owed_share: (args.balance / 2).toFixed(2),
      });
      checkSplitwiseError(expenseResponse.data);

      Sentry.logger.info("[6c] Function: Splitwise expense added", {
        expense: expenseResponse.data,
      });

      responseText += "\n\nExpense also added to Splitwise";
    }

    return {
      type: "budget_update",
      text: responseText,
    };
  },

  add_to_splitwise: async (args) => {
    // Validate confidence threshold
    if (args.confidence < 0.5) {
      throw new Error(`Low confidence: ${args.confidence}`);
    }

    // Add expense on Splitwise
    const expenseResponse = await axiosInstance.post("/create_expense", {
      cost: args.amount.toFixed(2),
      description: args.title,
      details: args.details + "\n\nCreated with GuiMail",
      currency_code: args.currency,
      group_id: 0, // Direct expense between users
      split_equally: true,
    });
    checkSplitwiseError(expenseResponse.data);

    // Format balance for display
    const formattedBalance = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: args.currency,
    }).format(args.amount);

    return {
      type: "splitwise_expense",
      text: `"${args.title}" of ${formattedBalance} added to ` +
        `Splitwise. Details:\n\n$${args.details}\n\nConfidence = ` +
        `${args.confidence * 100}%`,
    };
  },
};

// Firebase function configuration
const functionConfig = {
  cors: true,
  maxInstances: 2,
  timeoutSeconds: 60,
  memory: "512MiB",
};

export const guimail = onRequest(functionConfig, async (request, response) => {
  Sentry.logger.info("[4] Function: started");

  // Authenticate worker
  const authHeader = request.headers.authorization;
  const expectedToken = `Bearer ${process.env.WORKER_SECRET}`;
  if (authHeader !== expectedToken) {
    Sentry.logger.warn("Request not authenticated", {
      authHeader: authHeader,
      requestQuery: request.query,
    });
    await Sentry.flush(2000);

    response.status(401).send("Request not authenticated");
    return;
  }

  // Extract information from request
  const {from, subject: originalSubject, messageID, references} = request.query;
  const raw = request.rawBody;

  // Extract body from message
  let body = {};
  let messageBody = "";
  try {
    // Parse the message stream
    const parser = new PostalMime();
    body = await parser.parse(raw);

    // Use text body if it exists, otherwise the HTML body
    messageBody = body.text || body.html;
    if (!messageBody) throw new Error("Message has no text or HTML body");

    Sentry.logger.info("[5] Function: message body", {
      messageBody: messageBody.substring(0, 1000),
    });
  } catch (error) {
    Sentry.captureException(error, {contexts: {body}});
    await Sentry.flush(2000);

    response.status(500).send("Body extraction error");
    return;
  }

  // Get model prompt
  let instructions = "";
  try {
    const promptResponse = await langfuse.prompt.get("GuiMail");
    instructions = promptResponse.prompt;

    Sentry.logger.info("[6] Function: prompt fetched", {
      version: promptResponse.version,
      prompt: instructions.substring(0, 200),
    });
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);

    response.status(502).send("Prompt fetching error");
    return;
  }

  // Call Gemini
  let result = {};
  let toolCall = {};
  let handler = null;
  try {
    result = await ai.models.generateContent({
      ...modelConfig,
      config: {
        ...modelConfig.config,
        systemInstruction: instructions,
      },
      contents: messageBody,
    });

    // Validate tool call
    if (!result?.functionCalls || result.functionCalls.length === 0) {
      throw new Error("No tool call returned");
    }
    toolCall = result.functionCalls[0];
    handler = toolHandlers[toolCall.name];
    if (!handler) {
      throw new Error(`Unknown tool returned: ${toolCall.name}`);
    }

    Sentry.logger.info("[7] Function: Gemini called", {toolCall});
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      geminiResult: result,
      messageBody: messageBody.substring(0, 1000),
    }});
    await Sentry.flush(2000);

    response.status(502).send("Gemini call error");
    return;
  }

  // Execute appropriate tool handler
  let toolResult = {};
  try {
    toolResult = await handler(toolCall.args);

    Sentry.logger.info("[8] Function: tool handled", {toolResult});
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      toolName: toolCall?.name,
      toolCall: toolCall?.args,
      partialResult: toolResult,
    }});
    await Sentry.flush(2000);

    // Allow worker to retry on Google Sheets API errors
    const errorCode = (toolCall.name === "add_to_budget") ? 502 : 500;
    response.status(errorCode).send("Tool handler error");
    return;
  }

  // Create message back
  let rawReply = "";
  try {
    // Set fields for threading
    const subject = originalSubject.trim().toLowerCase().startsWith("re:") ?
      originalSubject : `Re: ${originalSubject}`; // Add "Re:" prefix
    const newReferences = [references, messageID].filter(Boolean).join(" ");

    // Base message configuration
    const replyConfig = {
      from: `"GuiMail" <${process.env.EMAIL_GUIMAIL}>`,
      to: from,
      subject,
      inReplyTo: messageID,
      references: newReferences,
      text: `${toolResult.text}\n\nThank you for using GuiMail!`,
    };

    // Add iCal if this was a calendar event
    if (toolResult.icalEvent) {
      replyConfig.icalEvent = toolResult.icalEvent;
    }

    // Construct message
    const reply = new MailComposer(replyConfig);
    rawReply = await new Promise((resolve, reject) => {
      reply.compile().build((error, message) => {
        if (error) return reject(error);
        return resolve(message.toString());
      });
    });

    Sentry.logger.info("[9] Function: done", {toolType: toolResult.type});
    await Sentry.flush(2000);

    // Reply to message
    response.status(200).send(rawReply);
    return;
  } catch (error) {
    Sentry.captureException(error, {contexts: {toolResult}});
    await Sentry.flush(2000);

    response.status(500).send("Reply creation error");
    return;
  }
});
