// Import
import {LangfuseClient} from "@langfuse/client";

// Langfuse client
const langfuse = new LangfuseClient({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: "https://us.cloud.langfuse.com",
});

// Fetch the production version of a prompt by name
export const getPrompt = async (name) => {
  const res = await langfuse.prompt.get(name);
  return {prompt: res.prompt, version: res.version};
};

// Create a new prompt version without setting it as production
export const createPromptVersion = async (name, content) => {
  const res = await langfuse.prompt.create({
    name,
    type: "text",
    prompt: content,
    labels: [], // omit "production"
  });
  return res.version;
};
