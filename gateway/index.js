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
app.use(express.json({limit: "5mb"})); // POST request parser with size limit
app.use(helmet()); // HTTP header security

let activeRequests = 0;
const MAX_CONCURRENCY = 3;

// Run Claude Code endpoint
app.post(process.env.CLAUDE_CODE_GATEWAY_PATH, async (req, res) => {
    Sentry.logger.info("[8b] Gateway: started");

    // Validate message signature
    const authHeader = req.headers.authorization;
    const signature = authHeader?.split(" ")[1];
    if (!authHeader || signature !== process.env.CLAUDE_CODE_GATEWAY_SECRET) {
        Sentry.logger.warn("Gateway: unauthorized request", {
            authHeaderPresent: !!authHeader,
            reason: authHeader ? "Invalid signature" : "No signature",
        });

        return res.status(401).send("Unauthorized");
    }

    // Validate prompt
    const {prompt, sessionId, resumePrompt} = req.body;
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
        resuming: !!sessionId,
    });

    // Spawns Claude Code with the given CLI args; resolves with parsed result
    const spawnClaude = (cliArgs) => new Promise((resolve, reject) => {
        const child = spawn("claude", cliArgs, {cwd: homedir()});
        const chunks = []; // stdout buffered as Buffers, joined once on close
        let stderr = "";

        // Kill the child and send 504 if it runs too long
        const timer = setTimeout(() => {
            child.kill("SIGTERM"); // non-blocking, close fires later
            Sentry.captureException(new Error("Claude Code timed out"), {
                contexts: {prompt: prompt.slice(0, 500)},
            });

            // Guards double reply
            if (!res.headersSent) res.status(504).send("Claude Code timed out");

            reject(new Error("Claude Code timed out"));
        }, TIMEOUT_MS);

        // Buffer output chunks as they stream in
        child.stdout.on("data", (d) => {
            chunks.push(d);
        });
        child.stderr.on("data", (d) => {
            stderr += d.toString();
        });

        // Binary can't be spawned (not found, permission denied)
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.on("close", (code) => {
            clearTimeout(timer); // No-op if timeout already fired
            if (res.headersSent) return reject(new Error("Already replied"));

            // Join all buffered chunks into one string
            const stdout = Buffer.concat(chunks).toString();

            // Claude Code failed (e.g. bad/expired session ID, binary crash)
            if (code !== 0) {
                return reject(Object.assign(
                    new Error("Claude Code exited with non-zero code"),
                    {code, stderr, stdout},
                ));
            }

            // Fall back to raw stdout if result isn't valid JSON
            try {
                const parsed = JSON.parse(stdout);
                resolve({result: parsed.result, sessionId: parsed.session_id});
            } catch {
                resolve({result: stdout, sessionId: undefined});
            }
        });
    });

    const freshArgs = ["-p", prompt, "--output-format", "json"];

    try {
        let runResult;

        // Resume an existing session, or start fresh if no sessionId
        if (sessionId) {
            const resumeArgs = [
                "-p", resumePrompt,
                "--resume", sessionId,
                "--output-format", "json",
            ];
            try {
                runResult = await spawnClaude(resumeArgs);
            } catch {
                // Timeout already replied, don't attempt a fallback
                if (res.headersSent) return;

                // Session expired or missing, fall back to a fresh session
                Sentry.logger.warn(
                    "Gateway: resume failed, starting fresh session",
                    {sessionId},
                );
                runResult = await spawnClaude(freshArgs);
            }
        } else {
            runResult = await spawnClaude(freshArgs);
        }

        Sentry.logger.info("[8d] Gateway: Claude Code completed", {
            resultLength: runResult.result?.length,
            resumed: !!sessionId,
        });
        return res.json(runResult);
    } catch (error) {
        Sentry.captureException(error, {contexts: {
            prompt: prompt.slice(0, 500),
        }});
        if (!res.headersSent) {
            res.status(500).send("Claude Code process failed");
        }
    } finally {
    // Always release the concurrency slot, on every exit path
        activeRequests--;
    }
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
