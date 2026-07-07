// Imports
import * as Sentry from "@sentry/node";
import {Type} from "@google/genai";
import {createCalendarEvent, getFlightAwareUrl} from "../utils/guiddleware.js";

export const definition = {
  name: "addToCalendar",
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
      flightNumber: {
        type: Type.STRING,
        description: "IATA flight number for flight events" +
          " (e.g. 'AA123'). Omit for non-flight events.",
      },
      reminders: {
        type: Type.ARRAY,
        description: "Custom reminders/notifications before the event," +
          " overriding the calendar's default reminders. Omit to use the" +
          " calendar's default reminder settings.",
        items: {
          type: Type.OBJECT,
          properties: {
            method: {
              type: Type.STRING,
              enum: ["email", "popup"],
              description: "Notification method",
            },
            minutes: {
              type: Type.NUMBER,
              description: "Minutes before the event start to send the" +
                " reminder (e.g. 20160 for 2 weeks, 1440 for 1 day)",
            },
          },
          required: ["method", "minutes"],
        },
      },
      isSpecialProject: {
        type: Type.BOOLEAN,
        description: "True if the event relates to a specially-tagged" +
          " project, which colors it Basil (green) for quick visual" +
          " identification on the calendar. False for everything else.",
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

  // Resolve optional FlightAware URL first, then compose the description;
  // Guiddleware's /calendar/events stays generic and doesn't know about flights
  const flightAwareUrl = args.flightNumber ?
    await getFlightAwareUrl(args.flightNumber).catch((error) => {
      Sentry.captureException(error, {contexts: {
        flightNumber: args.flightNumber,
      }});
      return null;
    }) :
    null;

  const descriptionParts = [
    args.description ?? "",
    flightAwareUrl ? `Track flight: ${flightAwareUrl}` : null,
    "Created with Guimail",
  ].filter(Boolean);

  const result = await createCalendarEvent({
    summary: args.summary,
    start: args.start,
    end: args.end,
    timeZone: args.timeZone,
    location: args.location,
    description: descriptionParts.join("\n\n"),
    calendar: args.calendar,
    reminders: args.reminders,
    isSpecialProject: args.isSpecialProject,
  });

  Sentry.logger.info("[8] Tool: Google Calendar event created", {
    calendar: args.calendar, eventId: result.id,
  });

  const calendarLabel = args.calendar === "shared" ?
    "G plus G" : "personal";

  return {
    type: "calendarEvent",
    text: `Event "${args.summary}" added to ${calendarLabel} calendar.`,
    link: {
      url: result.link,
      label: "View in Google Calendar",
    },
    confidence: Math.round(args.confidence * 100),
  };
};
