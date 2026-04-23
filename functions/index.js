// Imports
import * as Sentry from "@sentry/node";
import {GoogleGenAI, FunctionCallingConfigMode} from "@google/genai";
import {getPrompt} from "./utils/langfuse.js";
import {onRequest} from "firebase-functions/v2/https";
import PostalMime from "postal-mime";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import {
  definition as addToCalendarDef,
  handler as addToCalendarHandler,
} from "./tools/addToCalendar.js";
import {
  definition as summarizeEmailDef,
  handler as summarizeEmailHandler,
} from "./tools/summarizeEmail.js";
import {
  definition as addToBudgetDef,
  handler as addToBudgetHandler,
} from "./tools/addToBudget.js";
import {
  definition as addToSplitwiseDef,
  handler as addToSplitwiseHandler,
} from "./tools/addToSplitwise.js";
import {
  definition as askClaudeCodeDef,
  handler as askClaudeCodeHandler,
} from "./tools/askClaudeCode.js";

// Initializations
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enableLogs: true,
  integrations: [Sentry.googleGenAIIntegration({
    recordInputs: true,
    recordOutputs: true,
  })],
});
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Model configuration
const modelConfig = {
  model: "gemini-flash-latest",
  config: {
    thinkingConfig: {
      thinkingLevel: "high",
    },
    tools: [{
      functionDeclarations: [
        addToCalendarDef,
        summarizeEmailDef,
        addToBudgetDef,
        addToSplitwiseDef,
        askClaudeCodeDef,
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
  [addToCalendarDef.name]: addToCalendarHandler,
  [summarizeEmailDef.name]: summarizeEmailHandler,
  [addToBudgetDef.name]: addToBudgetHandler,
  [addToSplitwiseDef.name]: addToSplitwiseHandler,
  [askClaudeCodeDef.name]: askClaudeCodeHandler,
};

// Firebase function configuration
const functionConfig = {
  cors: true,
  maxInstances: 2,
  timeoutSeconds: 420, // 7 minutes
  memory: "512MiB",
};

export const guimail = onRequest(functionConfig, async (request, response) => {
  Sentry.logger.info("[4] Function: started");

  // Authenticate worker
  const authHeader = request.headers.authorization;
  const expectedToken = `Bearer ${process.env.WORKER_SECRET}`;
  if (authHeader !== expectedToken) {
    Sentry.logger.warn("Request not authenticated", {
      authHeaderPresent: !!authHeader,
      requestQuery: request.query,
    });

    response.status(401).send("Request not authenticated");

    await Sentry.flush(2000);
    return;
  }

  // Extract information from request
  const {
    from, subject: originalSubject, messageID, references, sessionId,
  } = request.query;
  const raw = request.rawBody;

  // Extract body from message
  let body;
  let messageBody;
  try {
    // Parse the message stream
    const parser = new PostalMime();
    body = await parser.parse(raw);

    // Use text body if it exists, otherwise the HTML body
    messageBody = body.text || body.html;
    if (!messageBody) throw new Error("Message has no text or HTML body");

    Sentry.logger.info("[5] Function: message body", {
      messageBodyLength: messageBody.length,
    });
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      raw: raw.toString().slice(0, 500),
    }});

    response.status(500).send("Body extraction error");

    await Sentry.flush(2000);
    return;
  }

  // Get model prompt
  let instructions;
  try {
    const promptResponse = await getPrompt("Guimail");
    instructions = promptResponse.prompt;

    Sentry.logger.info("[6] Function: prompt fetched", {
      version: promptResponse.version,
    });
  } catch (error) {
    Sentry.captureException(error);

    response.status(502).send("Prompt fetching error");

    await Sentry.flush(2000);
    return;
  }

  // Call Gemini
  let result;
  let toolCall;
  let handler;
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

    Sentry.logger.info("[7] Function: Gemini called",
      {toolName: toolCall.name});
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      geminiResult: result,
      messageBody: messageBody.slice(0, 500),
    }});

    response.status(502).send("Gemini call error");

    await Sentry.flush(2000);
    return;
  }

  // Execute appropriate tool handler
  let toolResult;
  try {
    toolResult = await handler(toolCall.args, {sessionId});
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      toolName: toolCall?.name,
      partialResult: toolResult,
    }});

    // Allow worker to retry on Google Sheets API errors
    const errorCode = (toolCall.name === "addToBudget") ? 502 : 500;
    response.status(errorCode).send("Tool handler error");

    await Sentry.flush(2000);
    return;
  }

  // Create message back
  let rawReply;
  try {
    // Set fields for threading
    const subjectStr = originalSubject ?? "";
    const subject = subjectStr.trim().toLowerCase().startsWith("re:") ?
      subjectStr : `Re: ${subjectStr}`; // Add "Re:" prefix
    const newReferences = [references, messageID].filter(Boolean).join(" ");

    // Build plain text and HTML sections in standard order:
    // main text → optional link → optional confidence → sign-off
    const textSections = [toolResult.text];
    const htmlSections = toolResult.html ?
      [toolResult.html] :
      toolResult.text.split("\n\n").map((s) => `<p>${s}</p>`);

    if (toolResult.link) {
      textSections.push(toolResult.link.url);
      htmlSections.push(
        `<p><a href="${toolResult.link.url}">${toolResult.link.label}</a></p>`,
      );
    }

    if (toolResult.confidence !== undefined) {
      const confidenceLine = `Confidence = ${toolResult.confidence}%`;
      textSections.push(confidenceLine);
      htmlSections.push(`<p>${confidenceLine}</p>`);
    }

    textSections.push("Thank you for using Guimail!");
    htmlSections.push("<p>Thank you for using Guimail!</p>");

    // Base message configuration
    const replyConfig = {
      from: `"Guimail" <${process.env.EMAIL_GUIMAIL}>`,
      to: from,
      subject,
      inReplyTo: messageID,
      references: newReferences,
      text: textSections.join("\n\n"),
      html: htmlSections.join(""),
      ...(toolResult.sessionId && {
        headers: {"X-Guimail-Session": toolResult.sessionId},
      }),
    };

    // Construct message
    const reply = new MailComposer(replyConfig);
    rawReply = await new Promise((resolve, reject) => {
      reply.compile().build((error, message) => {
        if (error) return reject(error);
        return resolve(message.toString());
      });
    });

    // Reply to message
    response.status(200).send(rawReply);

    Sentry.logger.info("[9] Function: done", {toolType: toolResult.type});

    await Sentry.flush(2000);
    return;
  } catch (error) {
    Sentry.captureException(error, {contexts: {
      toolResultType: toolResult.type,
    }});

    response.status(500).send("Reply creation error");

    await Sentry.flush(2000);
    return;
  }
});
