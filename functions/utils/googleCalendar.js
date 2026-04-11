// Imports
import {google} from "googleapis";
import {getGoogleAuth, GOOGLE_RETRY_CONFIG} from "./googleAuth.js";

// Promise-cached Google Calendar client
let clientPromise;
export const getCalendarClient = () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const auth = getGoogleAuth(
        ["https://www.googleapis.com/auth/calendar.events"]);
      return google.calendar({
        version: "v3", auth, retryConfig: GOOGLE_RETRY_CONFIG,
      });
    })();
  }
  return clientPromise;
};
