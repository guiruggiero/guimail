// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {google} from "googleapis";
import {fileURLToPath} from "node:url";
import path from "node:path";

// ESM path resolution (needed for service-account-key.json)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calendar IDs (set in Firebase env vars)
const CALENDARS = {
  default: process.env.GOOGLE_CAL_DEFAULT_ID,
  shared: process.env.GOOGLE_CAL_SHARED_ID,
};

// Lazy-initialized Google Calendar client
let calendarClient;
const getCalendarClient = async () => {
  if (calendarClient) return calendarClient;
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, "..", "service-account-key.json"),
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  calendarClient = google.calendar({
    version: "v3",
    auth,
    retryConfig: {
      retry: 2,
      retryDelay: 1000,
      statusCodesToRetry: [[500, 599]],
      httpMethodsToRetry: ["POST"],
    },
  });
  return calendarClient;
};

export const definition = {
  name: "add_to_calendar",
  description: "Creates a calendar event with details extracted from the" +
    " email message including title and time, location, and description",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: {
        type: Type.STRING,
        description: "Event title/name, max 7 words",
      },
      start: {
        type: Type.STRING,
        description: "Event start: date-only (YYYY-MM-DD) for all-day" +
          " events, or date and time (YYYY-MM-DDTHH:MM:SS) for timed events",
      },
      end: {
        type: Type.STRING,
        description: "Event end: date-only (YYYY-MM-DD) for all-day" +
          " events, or date and time (YYYY-MM-DDTHH:MM:SS) for timed events",
      },
      timeZone: {
        type: Type.STRING,
        description: "Event time zone in" +
          " IANA identifier (e.g., 'America/Los_Angeles')",
      },
      location: {
        type: Type.STRING,
        description: "Event location, be it physical or virtual",
      },
      description: {
        type: Type.STRING,
        description: "Additional details of the event," +
          " followed by the email subject line",
      },
      calendar: {
        type: Type.STRING,
        enum: ["default", "shared"],
        description: "Calendar to add the event to: 'default' for Gui's" +
          " personal calendar, 'shared' for the calendar shared with Georgia",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: [
      "summary", "start", "end", "timeZone", "calendar", "confidence",
    ],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Get cached Google Calendar client
  const calendar = await getCalendarClient();

  // Build event resource
  const isAllDay = !args.start.includes("T");
  const eventResource = {
    summary: args.summary,
    description: (args.description ?? "") + "\n\nCreated with Guimail",
    location: args.location,
    // All-day events show as free; timed events show as busy
    transparency: isAllDay ? "transparent" : "opaque",
  };

  if (isAllDay) {
    eventResource.start = {date: args.start};
    eventResource.end = {date: args.end};
  } else {
    eventResource.start = {dateTime: args.start, timeZone: args.timeZone};
    eventResource.end = {dateTime: args.end, timeZone: args.timeZone};
  }

  // Create event via Google Calendar API
  const calendarId = CALENDARS[args.calendar ?? "default"];
  const result = await calendar.events.insert({
    calendarId,
    resource: eventResource,
  });
  Sentry.logger.info("[8a] Function: Google Calendar event created", {
    calendarId,
    eventId: result.data.id,
  });

  const calendarLabel = args.calendar === "shared" ?
    "G plus G" : "personal";

  return {
    type: "calendar_event",
    text: `Event "${args.summary}" added to ${calendarLabel} calendar.`,
    link: {
      url: result.data.htmlLink,
      label: "View in Google Calendar",
    },
    confidence: Math.round(args.confidence * 100),
  };
};
