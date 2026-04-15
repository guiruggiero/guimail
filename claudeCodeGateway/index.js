import express from "express";
import { spawn } from "child_process";
import { homedir } from "os";

const PORT = 3131;
const TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const AUTH_TOKEN = process.env.CLAUDE_GATEWAY_SECRET;
const SETTINGS_PATH = `${homedir()}/.claude/settings.json`;

if (!AUTH_TOKEN) {
    console.error("CLAUDE_GATEWAY_SECRET env var is not set");
    process.exit(1);
}

const app = express();
app.use(express.json());

app.post("/run", (req, res) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader || authHeader !== `Bearer ${AUTH_TOKEN}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    console.log(`[${new Date().toISOString()}] Prompt: ${prompt.slice(0, 100)}...`);

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
        }
    );

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
        child.kill("SIGTERM");
        console.error("Claude process timed out");
        if (!res.headersSent) {
            res.status(504).json({ error: "Claude timed out" });
        }
    }, TIMEOUT_MS);

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("close", (code) => {
        clearTimeout(timer);
        if (res.headersSent) return;

        if (code !== 0) {
            console.error(`Claude exited ${code}: ${stderr}`);
            return res.status(500).json({ error: "Claude process failed", details: stderr });
        }

        try {
            const parsed = JSON.parse(stdout);
            return res.json({
                result: parsed.result,
                session_id: parsed.session_id,
                cost_usd: parsed.cost_usd,
            });
        } catch {
            return res.json({ result: stdout });
        }
    });
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(`Claude gateway listening on 127.0.0.1:${PORT}`);
});