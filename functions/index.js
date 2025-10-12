// Imports
const Sentry = require("@sentry/node");
const {GoogleGenAI, Type, FunctionCallingConfigMode} = require("@google/genai");
const fs = require("node:fs");
const {onRequest} = require("firebase-functions/v2/https");
const {default: PostalMime} = require("postal-mime");
const {default: ical} = require("ical-generator");
const MailComposer = require("nodemailer/lib/mail-composer");

// Initializations
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enableLogs: true,
});
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});
const instructions = fs.readFileSync("prompt.txt", "utf8");

// Model tool
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
      functionDeclarations: [createCalendarEvent],
    }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
      },
    },
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
  let eventData = {};
  try {
    const result = await ai.models.generateContent({
      ...modelConfig,
      contents: [{role: "user", parts: [{text: messageBody}]}],
    });

    // Validate tool call
    if (!result.functionCalls || result.functionCalls.length === 0) {
      throw new Error("Model did not return a function call");
    }
    const toolCall = result.functionCalls[0];
    if (toolCall.name !== "create_calendar_event") {
      throw new Error(`Unexpected function call: ${toolCall.name}`);
    }

    // Extract the event data from tool call
    eventData = toolCall.args;
    Sentry.logger.info("Function: event title", {title: eventData.summary});

    // Validate confidence threshold
    if (eventData.confidence < 0.5) {
      throw new Error(`Low confidence: ${eventData.confidence}`);
    }
  } catch (error) {
    Sentry.captureException(error, {contexts: {eventData}});
    await Sentry.flush(2000);

    response.status(502).send("Gemini call error");
    return;
  }

  // Create iCal invite
  let icsString = "";
  try {
    const cal = ical({
      name: "GuiMail",
      prodId: "//GuiRuggiero//GuiMail//EN",
    });
    cal.createEvent({
      start: new Date(eventData.start),
      end: new Date(eventData.end),
      timezone: eventData.timeZone,
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
    });
    icsString = cal.toString();
    Sentry.logger.info("Function: iCal created", {
      icsString: icsString.substring(0, 500),
    });
  } catch (error) {
    Sentry.captureException(error, {contexts: {icsString: icsString}});
    await Sentry.flush(2000);

    response.status(500).send("iCal creation error");
    return;
  }

  // Create message back
  let rawReply = "";
  try {
    // Set fields for threading
    const subject = originalSubject.trim().toLowerCase().startsWith("re:") ?
      originalSubject : `Re: ${originalSubject}`; // Add "Re:" prefix
    const newReferences = [references, messageID].filter(Boolean).join(" ");

    // Construct message object
    const reply = new MailComposer({
      from: `"GuiMail" <${process.env.EMAIL_GUIMAIL}>`,
      to: from,
      subject,
      inReplyTo: messageID,
      references: newReferences,
      text: `Event created. Confidence = ${eventData.confidence}.\n\n` +
        "Thank you for using GuiMail!",
      icalEvent: {
        method: "REQUEST",
        content: icsString,
      },
    });

    // Generate the message
    rawReply = await new Promise((resolve, reject) => {
      reply.compile().build((error, message) => {
        if (error) return reject(error);
        return resolve(message.toString());
      });
    });

    Sentry.logger.info("Function: done");
    await Sentry.flush(2000);

    // Reply to message
    response.status(200).send(rawReply);
    return;
  } catch (error) {
    Sentry.captureException(error, {contexts: {rawReply: rawReply}});
    await Sentry.flush(2000);

    response.status(500).send("Reply creation error");
    return;
  }
});
