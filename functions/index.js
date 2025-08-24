// Imports
const Sentry = require("@sentry/node");
const fs = require("fs");
const {GoogleGenAI} = require("@google/genai");
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
const parser = new PostalMime();

// Model configuration
const instructions = fs.readFileSync("prompt.txt", "utf8");
const modelConfig = {
  model: "gemini-2.5-pro",
  config: {
    systemInstruction: instructions,
    temperature: 0.1,
    thinkingconfig: {
      thinkingbudget: 0,
    },
    responseMimeType: "application/json", // Structured output
    responseSchema: {
      type: "object",
      properties: {
        summary: {type: "string"},
        start: {
          type: "object",
          properties: {
            dateTime: {type: "string"}, // ISO format
            timeZone: {type: "string"},
          },
        },
        end: {
          type: "object",
          properties: {
            dateTime: {type: "string"}, // ISO format
            timeZone: {type: "string"},
          },
        },
        location: {type: "string"},
        description: {type: "string"},
        confidence: {type: "number"}, // 0-1 score
      },
      required: ["summary", "start", "end", "confidence"],
    },
  },
};

// Function configuration
const functionConfig = {
  cors: true,
  maxInstances: 2,
  timeoutSeconds: 30,
};

exports.guimail = onRequest(functionConfig, async (request, response) => {
  Sentry.logger.info("Function: started");

  // Authenticate worker
  const authHeader = request.headers.authorization;
  const expectedToken = `Bearer ${process.env.WORKER_SECRET}`;
  if (authHeader !== expectedToken) {
    Sentry.captureException(new Error("Request not authenticated"),
        {contexts: {authHeader}});
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
    body = await parser.parse(raw);

    // Use text body if it exists, otherwise the HTML body
    messageBody = body.text || body.html;
    if (!messageBody) throw new Error("Message has no text or HTML body");
    Sentry.logger.info("Function: message body", {messageBody});
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      rawBody: raw,
      body,
      messageBody,
    }});
    await Sentry.flush(2000);

    response.status(400).send("Body extraction error");
    return;
  }

  // Call Gemini
  let eventData = {};
  try {
    const result = await ai.models.generateContent({
      ...modelConfig,
      contents: messageBody,
    });
    eventData = JSON.parse(result.text);
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
    const cal = ical({name: "GuiMail events"});
    cal.createEvent({
      start: new Date(eventData.start.dateTime),
      end: new Date(eventData.end.dateTime),
      timezone: eventData.start.timeZone,
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
    });
    icsString = cal.toString();
    Sentry.logger.info("Function: iCal created");
  } catch (error) {
    Sentry.captureException(error, {contexts: {icsString}});
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
    Sentry.captureException(error, {contexts: {rawReply}});
    await Sentry.flush(2000);

    response.status(500).send("Reply creation error");
    return;
  }
});
