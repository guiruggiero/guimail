// Imports
const Sentry = require("@sentry/node");
const {GoogleGenAI, Type, FunctionCallingConfigMode} = require("@google/genai");
const fs = require("node:fs");
const {onRequest} = require("firebase-functions/v2/https");
const {default: PostalMime} = require("postal-mime");
const {default: ical} = require("ical-generator");
const {google} = require("googleapis");
const path = require("node:path");
const MailComposer = require("nodemailer/lib/mail-composer");

// Initializations
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enableLogs: true,
});
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const instructions = fs.readFileSync("prompt.txt", "utf8");

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
        description: "Event title/name",
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
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["issuer", "balance", "confidence"],
  },
};

// Model configuration
const modelConfig = {
  model: "gemini-2.5-pro",
  config: {
    systemInstruction: instructions,
    temperature: 0.1,
    thinkingconfig: {
      thinkingbudget: 0,
    },
    tools: [{
      functionDeclarations: [
        createCalendarEvent,
        summarizeEmail,
        addToBudget,
      ],
    }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
      },
    },
  },
};

// Tool handlers
const toolHandlers = {
  create_calendar_event: async (args) => {
    Sentry.logger.info("Function: tool create_calendar_event",
        {title: args.summary});

    // Validate confidence threshold
    if (args.confidence < 0.5) {
      throw new Error(`Low confidence: ${args.confidence}`);
    }

    // Create iCal invite
    const cal = ical({
      name: "GuiMail",
      prodId: "//GuiRuggiero//GuiMail//EN",
    });
    cal.createEvent({
      start: new Date(args.start),
      end: new Date(args.end),
      timezone: args.timeZone,
      summary: args.summary,
      description: args.description,
      location: args.location,
    });
    const icsString = cal.toString();
    Sentry.logger.info("Function: iCal created", {
      icsString: icsString.substring(0, 500),
    });

    return {
      type: "calendar_event",
      text: `Event created. Confidence = ${args.confidence * 100}%.`,
      icalEvent: {
        method: "REQUEST",
        content: icsString,
      },
    };
  },

  summarize_email: async (args) => {
    Sentry.logger.info("Function: tool summarize_email",
        {summaryLength: args.summary.length});

    return {
      type: "summary",
      text: `Email summary:\n\n${args.summary}`,
    };
  },

  add_to_budget: async (args) => {
    Sentry.logger.info("Function: tool add_to_budget", {issuer: args.issuer});

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

    // Build response text
    const responseText = `${args.issuer} balance ${args.balance} added` +
      ` to budget.\nConfidence = ${args.confidence * 100}%.`;

    return {
      type: "budget_update",
      text: responseText,
    };
  },
};

// Firebase function configuration
const functionConfig = {
  cors: true,
  maxInstances: 2,
  timeoutSeconds: 60,
};

exports.guimail = onRequest(functionConfig, async (request, response) => {
  Sentry.logger.info("Function: started");

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
    Sentry.logger.info("Function: message body", {
      messageBody: messageBody.substring(0, 1000),
    });
  } catch (error) {
    Sentry.captureException(error, {contexts: {body}});
    await Sentry.flush(2000);

    response.status(400).send("Body extraction error");
    return;
  }

  // Call Gemini
  let result;
  let toolCall = {};
  let handler;
  try {
    result = await ai.models.generateContent({
      ...modelConfig,
      contents: [{role: "user", parts: [{text: messageBody}]}],
    });

    // Validate tool call
    if (!result.functionCalls || result.functionCalls.length === 0) {
      throw new Error("No tool call returned");
    }
    toolCall = result.functionCalls[0];
    handler = toolHandlers[toolCall.name];
    if (!handler) {
      throw new Error(`Unknown tool returned: ${toolCall.name}`);
    }
  } catch (error) {
    Sentry.captureException(error, {contexts: {result}});
    await Sentry.flush(2000);

    response.status(502).send("Gemini call error");
    return;
  }

  // Execute appropriate tool handler
  let toolResult = {};
  try {
    toolResult = await handler(toolCall.args);
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      toolCall,
      partialResult: toolResult,
    }});
    await Sentry.flush(2000);

    response.status(400).send("Tool handler error");
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

    Sentry.logger.info("Function: done", {toolType: toolResult.type});
    await Sentry.flush(2000);

    // Reply to message
    response.status(200).send(rawReply);
    return;
  } catch (error) {
    Sentry.captureException(error, {contexts: {toolResult}});
    await Sentry.flush(2000);

    response.status(400).send("Reply creation error");
    return;
  }
});
