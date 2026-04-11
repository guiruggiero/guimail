// Import
import {LangfuseClient} from "@langfuse/client";

// Langfuse client
const langfuse = new LangfuseClient({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: "https://us.cloud.langfuse.com",
});

// Fetch a prompt by name
export const getPrompt = async (name) => {
  const res = await langfuse.prompt.get(name);
  return {prompt: res.prompt, version: res.version};
};
