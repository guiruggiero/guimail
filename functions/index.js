const fs = require("fs");
const {GoogleGenAI} = require("@google/genai");
const {onRequest} = require("firebase-functions/v2/https");
const PostalMime = require("postal-mime");
const {createMimeMessage} = require("mimetext");

// Initializations
const apiKey = process.env.GEMINI_API_KEY; // TODO: create new one, add in console
const ai = new GoogleGenAI({apiKey: apiKey}); // TODO: same thing with generation (not chat)?

// Get system instructions from file
const instructions = fs.readFileSync("prompt.txt", "utf8"); // TODO: write prompt

// Model configuration
const modelConfig = { // TODO: no safety
  model: "gemini-2.5-flash-lite-preview-06-17",
  config: {
    systemInstruction: instructions,
    temperature: 0.2, // TODO: experiment
    responseMimeType: "text/plain", // TODO: structured output, tool, MCP
    thinkingconfig: { // TODO better with some?
      thinkingbudget: 0,
    },
  },
};

exports.guimail = onRequest(
  {maxinstances: 2, timeoutSeconds: 20},
  async (request, response) => {
    // Extract body from message
    let messageBody = "";
    try {
      const parser = new PostalMime();
      const body = await parser.parse(request.query.raw);

      // Return text body if it exists, otherwise the HTML body
      messageBody = body.text || body.html;
      if (!messageBody) throw new Error("Message has no text or HTML body");

    } catch (error) {
      console.log(error); // TODO: Sentry
      response.send({
        success: false,
        msg: `GuiMail error: ${error.message}`
      });
    }

    // Call Gemini - TODO
    const chat = ai.chats.create(chatConfigWithHistory);
    try{
      // Call Gemini API and send response back
      const result = await chat.sendMessage({message: messageBody}); // TODO: generation not chat
      const guimailResponse = result.text;

    } catch (error) {
      console.log(error); // TODO: Sentry
      response.send({
        success: false,
        msg: `GuiMail error: ${error.message}`
      });
    }

    // Confirm event creation
    try {
      // Get relevant content from message
      const originalSubject = request.query.headers.get("Subject") || "";
      const messageID = request.query.headers.get("Message-ID");

      // Initialize message object
      const msg = createMimeMessage();

      // Set fields for threading
      const newSubject = originalSubject.trim().toLowerCase().startsWith("re:") ? originalSubject : `Re: ${originalSubject}`; // Add "Re:" prefix if not already present
      msg.setSubject(newSubject);
      msg.setHeader("In-Reply-To", messageID);
      const newReferences = [request.query.headers.get("References"), messageID].filter(Boolean).join(" ");
      msg.setHeader("References", newReferences);

      // Set content for email body
      msg.addMessage({
        contentType: "text/plain",
        // data: `Event created: ${eventLink}`, // TODO
        data: `Information extracted: ${messageBody}`,
      });

      // Set remaining fields
      msg.setSender({name: "GuiMail", addr: process.env.EMAIL_GUIMAIL}); // TODO: add in console
      msg.setRecipient(request.query.from);

      // Reply to message
      response.send({
        success: true,
        msg: msg
      });

    } catch (error) {
      console.log(error); // TODO: Sentry
      response.send({
        success: false,
        msg: `GuiMail error: ${error.message}`
      });
    }

    // Send error before function terminates
    // await Sentry.flush(1000);
  }
);
