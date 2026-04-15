// Import
import {createRetryClient} from "./axiosClient.js";

// Axios instance for Claude Code Gateway
const gatewayClient = createRetryClient({
  baseURL: process.env.CLAUDE_CODE_GATEWAY_URL, // TODO: add to .env
  timeout: 185000, // ~3 minutes, slightly over gateway timeout
  headers: {
    "Authorization": `Bearer ${process.env.CLAUDE_CODE_GATEWAY_SECRET}`, // TODO: add to .env
    "Content-Type": "application/json",
  },
}, 1);

// Sends a prompt to Claude Code and returns the result text
export const runPrompt = async (prompt) => {
  const res = await gatewayClient.post("/run", {prompt});
  return {
    result: res.data.result,
    session_id: res.data.session_id,
  };
};
