// Imports
import {google} from "googleapis";
import {fileURLToPath} from "node:url";
import path from "node:path";

// ESM path resolution (needed for service-account-key.json)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the service account key file
export const KEY_FILE =
  path.join(__dirname, "..", "service-account-key.json");

// Shared retry configuration for Google API clients
export const GOOGLE_RETRY_CONFIG = {
  retry: 2,
  retryDelay: 1000,
  statusCodesToRetry: [[500, 599]],
  httpMethodsToRetry: ["POST"],
};

// Google service account auth client factory
export const getGoogleAuth = (scopes) =>
  new google.auth.GoogleAuth({keyFile: KEY_FILE, scopes});
