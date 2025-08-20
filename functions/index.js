// Imports
const fs = require("fs");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/v2/https");
const PostalMime = require("postal-mime");
const {createMimeMessage} = require("mimetext");

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
const apiKey = process.env.GEMINI_API_KEY; // TODO: add in console
const ai = new GoogleGenAI({apiKey: apiKey});

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

  // Create calendar event
  let eventLink = "";
  try {
    // eslint-disable-next-line no-undef
    eventLink = await createCalendarEvent(eventData); // TODO: implement
  } catch (error) {
    console.log(error); // TODO: Sentry
    // await Sentry.flush(2000);

    response.send({
      success: false,
      msg: `GuiMail error - Google Calendar call: ${error.message}`,
    });
    return;
  }

  // Confirm event creation
  try {
    // Get relevant content from message
    const originalSubject = request.query.headers.get("Subject") || "";
    const messageID = request.query.headers.get("Message-ID");

    // Initialize message object
    const msg = createMimeMessage();

    // Set fields for threading
    const subject = originalSubject.trim().toLowerCase().startsWith("re:") ?
      originalSubject : `Re: ${originalSubject}`; // Add "Re:" prefix
    msg.setSubject(subject);
    msg.setHeader("In-Reply-To", messageID);
    const newReferences = [request.query.headers.get("References"),
      messageID].filter(Boolean).join(" ");
    msg.setHeader("References", newReferences);

    // Set content for email body
    msg.addMessage({
      contentType: "text/plain",
      data: `Event created: ${eventLink}`,
      // data: `Information extracted: ${messageBody}`, // TODO: testing
    });

    // Set remaining fields - TODO: add in console
    msg.setSender({name: "GuiMail", addr: process.env.EMAIL_GUIMAIL});
    msg.setRecipient(request.query.from);

    // Reply to message
    response.send({
      success: true,
      msg: msg,
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
