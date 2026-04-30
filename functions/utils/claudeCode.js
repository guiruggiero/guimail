// Imports
import {createRetryClient, defaultRetryCondition} from "./axiosClient.js";

// 504 means Claude Code timed out and retrying won't help
const gatewayRetryCondition = (error) =>
  error.response?.status !== 504 && defaultRetryCondition(error);

// Axios instance for Claude Code Gateway
const gatewayClient = createRetryClient({
  baseURL: process.env.CLAUDE_CODE_GATEWAY_URL,
  timeout: 185000, // ~3 minutes, slightly over gateway timeout
  headers: {
    "Authorization": `Bearer ${process.env.CLAUDE_CODE_GATEWAY_SECRET}`,
    "Content-Type": "application/json",
  },
}, 1, gatewayRetryCondition);

// Sends a prompt to Claude Code and returns the result text
export const runPrompt = async (prompt, sessionId, resumePrompt) => {
  const res = await gatewayClient.post("/run", {
    prompt, sessionId, resumePrompt,
  });
  return {
    result: res.data.result,
    sessionId: res.data.sessionId,
  };
};
