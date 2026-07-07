// Imports
import {google} from "googleapis";
import {getGoogleAuth, GOOGLE_RETRY_CONFIG} from "./googleAuth.js";

// Promise-cached Google Sheets client
let clientPromise;
export const getSheetsClient = () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const auth = getGoogleAuth(
        ["https://www.googleapis.com/auth/spreadsheets"]);
      return google.sheets({
        version: "v4", auth, retryConfig: GOOGLE_RETRY_CONFIG,
      });
    })();
  }
  return clientPromise;
};
