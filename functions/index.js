// Imports
const fs = require("fs");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/v2/https");
const PostalMime = require("postal-mime");
const ical = require("ical-generator");
const MailComposer = require("nodemailer/lib/mail-composer");

// Get system instructions from file
const instructions = fs.readFileSync("prompt.txt", "utf8");

// Model configuration
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

// Initialize model
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Function configuration
const functionConfig = {
  cors: true,
  maxInstances: 2,
  timeoutSeconds: 20,
};

exports.guimail = onRequest(functionConfig, async (request, response) => {
  // Extract body from message
  let messageBody = "";
  try {
    const parser = new PostalMime();
    const body = await parser.parse(request.query.raw);

    // Use text body if it exists, otherwise the HTML body
    messageBody = body.text || body.html;
    if (!messageBody) throw new Error("Message has no text or HTML body");
  } catch (error) {
    console.log(error); // TODO: Sentry
    // await Sentry.flush(2000);

    response.send({
      success: false,
      msg: `GuiMail error - body extraction: ${error.message}`,
    });
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

    // Validate confidence threshold
    if (eventData.confidence < 0.5) {
      throw new Error("Low confidence in event extraction");
    }
  } catch (error) {
    console.log(error); // TODO: Sentry
    // await Sentry.flush(2000);

    response.send({
      success: false,
      msg: `GuiMail error - Gemini call: ${error.message}`,
    });
    return;
  }

  // Create iCal invite
  let icsString = "";
  try {
    const cal = ical({name: "Test calendar"});
    cal.createEvent({
      start: new Date(eventData.start.dateTime),
      end: new Date(eventData.end.dateTime),
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
    });
    icsString = cal.toString();
  } catch (error) {
    console.log(error); // TODO: Sentry
    // await Sentry.flush(2000);

    response.send({
      success: false,
      msg: `GuiMail error - iCal creation: ${error.message}`,
    });
    return;
  }

  // Create message back
  try {
    // Get relevant content from original message
    const originalSubject = request.query.headers.get("Subject") || "";
    const messageID = request.query.headers.get("Message-ID");

    // Set fields for threading
    const subject = originalSubject.trim().toLowerCase().startsWith("re:") ?
      originalSubject : `Re: ${originalSubject}`; // Add "Re:" prefix
    const newReferences = [request.query.headers.get("References"),
      messageID].filter(Boolean).join(" ");

    // Construct message object
    const reply = new MailComposer({
      from: `"GuiMail" <${process.env.EMAIL_GUIMAIL}>`,
      // to: request.query.from,
      subject: subject,
      inReplyTo: messageID,
      references: newReferences,
      text: eventData, // html
      icalEvent: {
        method: "REQUEST", // PUBLISH
        content: icsString,
      },
    });

    // Generate the message
    const rawReply = await new Promise((resolve, reject) => {
      reply.compile().build((error, message) => {
        if (error) return reject(error);
        return resolve(message.toString());
      });
    });

    // Reply to message
    response.send({
      success: true,
      msg: rawReply,
    });
    return;
  } catch (error) {
    console.log(error); // TODO: Sentry
    // await Sentry.flush(2000);

    response.send({
      success: false,
      msg: `GuiMail error - reply creation: ${error.message}`,
    });
    return;
  }
});
