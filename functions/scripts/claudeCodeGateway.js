// Imports
import * as Sentry from "@sentry/node";
import {homedir} from "os";
import express from "express";
import helmet from "helmet";
import {spawn} from "child_process";

// Instrument error tracking
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  enableLogs: true,
});

// Configuration
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const SETTINGS_PATH = `${homedir()}/.claude/settings.json`;

// Initialize server and middleware
const app = express();
app.use(express.json({limit: "2mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security

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
  } catch {
    return res.status(401).send("Unauthorized");
  }

  // Validate prompt
  const {prompt} = req.body;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).send("Missing or invalid prompt");
  }

  Sentry.logger.info("[8c] Gateway: prompt fetched", {
    prompt: prompt.slice(0, 200),
  });

  // Spawn Claude Code as a child process
  const child = spawn(
    "claude",
    [
      "-p", prompt,
      "--bare",
      "--settings", SETTINGS_PATH,
      "--permission-mode", "dontAsk",
      "--output-format", "json",
    ],
    {
      cwd: homedir(),
      env: process.env,
    },
  );

  let stdout = "";
  let stderr = "";


  // --- TO BE REVIEWED --- START (TODO)


  // Kill the process and respond with a timeout error if it runs too long
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    Sentry.captureException(new Error("Claude process timed out"), {
      contexts: {prompt: {text: prompt.slice(0, 200)}},
    });
    if (!res.headersSent) {
      res.status(504).send("Claude timed out");
    }
  }, TIMEOUT_MS);

  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    if (res.headersSent) return;

    if (code !== 0) {
      Sentry.captureException(new Error(`Claude exited ${code}`), {
        contexts: {process: {code, stderr}},
      });
      return res.status(500).send("Claude process failed");
    }

    // Return structured fields if JSON, otherwise return raw stdout
    try {
      const parsed = JSON.parse(stdout);
      return res.json({
        result: parsed.result,
        session_id: parsed.session_id,
        cost_usd: parsed.cost_usd,
      });
    } catch {
      return res.json({result: stdout});
    }
  });
});


// --- TO BE REVIEWED --- END


// Start the server
const server = app.listen(process.env.EXPRESS_PORT, () => {
  console.log(`Gateway listening on port ${process.env.EXPRESS_PORT}`);

  if (process.send) process.send("ready"); // Let PM2 know app is ready
});

// Graceful shutdown
function gracefulShutdown() {
  server.close(() => {
    console.log("Server shut down");
    process.exit(0);
  });
}

// Handle termination signals
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
