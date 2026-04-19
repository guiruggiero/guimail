// Imports
import * as Sentry from "@sentry/node";
import {homedir} from "node:os";
import express from "express";
import helmet from "helmet";
import {spawn} from "node:child_process";

// Instrument error tracking
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  enableLogs: true,
});

// Configuration
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// Initialize server and middleware
const app = express();
app.use(express.json({limit: "2mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security

let activeRequests = 0;
const MAX_CONCURRENCY = 3;

// Run Claude Code endpoint
app.post(process.env.CLAUDE_CODE_GATEWAY_PATH, (req, res) => {
  Sentry.logger.info("[8b] Gateway: started");

  // Validate message signature
  try {
    // Get signature from header
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("No signature");
    const signature = authHeader.split(" ")[1];

    // Validate signature
    if (signature !== process.env.CLAUDE_CODE_GATEWAY_SECRET) {
      throw new Error("Invalid signature");
    }
  } catch (error) {
    Sentry.logger.warn("Gateway: unauthorized request", {
      authHeaderPresent: !!req.headers.authorization,
      reason: error.message,
    });

    return res.status(401).send("Unauthorized");
  }

  // Validate prompt
  const {prompt} = req.body;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).send("Missing or invalid prompt");
  }

  // Reject if already at capacity
  if (activeRequests >= MAX_CONCURRENCY) {
    Sentry.logger.warn("Gateway: request rejected, at capacity", {
      activeRequests,
    });

    return res.status(429).send("Too many concurrent requests");
  }
  activeRequests++;

  Sentry.logger.info("[8c] Gateway: prompt received", {
    prompt: prompt.slice(0, 500),
  });

  // Spawn Claude Code as a child process
  const child = spawn(
    "claude",
    [
      "-p", prompt,
      "--output-format", "json",
    ],
    {
      cwd: homedir(),
    },
  );

  let stdout = "";
  let stderr = "";

  // Kill the child and send 504 if it runs too long; close event still fires
  const timer = setTimeout(() => {
    child.kill("SIGTERM"); // non-blocking, close fires later
    Sentry.captureException(new Error("Claude Code timed out"), {contexts: {
      prompt: prompt.slice(0, 500),
    }});
    if (!res.headersSent) { // Guards double reply
      res.status(504).send("Claude Code timed out");
    }
  }, TIMEOUT_MS);

  // Buffer output chunks as they stream in
  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  // Fires when the child exits (normally or after SIGTERM)
  child.on("close", (code) => {
    clearTimeout(timer); // no-op if timeout already fired
    activeRequests--;

    // Timeout already replied, nothing left to do
    if (res.headersSent) return;

    if (code !== 0) {
      Sentry.captureException(new Error("Claude Code exited"), {contexts: {
        exitCode: code,
        stderr,
        stdout: stdout.slice(0, 500),
      }});

      return res.status(500).send("Claude Code process failed");
    }

    // Return structured fields if JSON, otherwise return raw stdout
    try {
      const parsed = JSON.parse(stdout);
      Sentry.logger.info("[8d] Gateway: Claude Code completed", {
        resultLength: parsed.result?.length,
      });

      return res.json({
        result: parsed.result,
        sessionId: parsed.session_id,
      });
    } catch {
      // Claude Code didn't return JSON, pass raw output through
      Sentry.logger.warn("Gateway: Claude Code returned non-JSON output", {
        stdout: stdout.slice(0, 500),
      });

      return res.json({result: stdout});
    }
  });
});

// Start the server
const server = app.listen(process.env.EXPRESS_PORT, () => {
  // console.log(`Gateway listening on port ${process.env.EXPRESS_PORT}`);
  Sentry.logger.info("Gateway: up and listening");

  if (process.send) process.send("ready"); // Let PM2 know app is ready
});

// Graceful shutdown
function gracefulShutdown() {
  server.close(async () => {
    // console.log(" Server shut down");
    Sentry.logger.info("Gateway: server shut down");

    await Sentry.flush(2000);
    process.exit(0);
  });
}

// Handle termination signals
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
