// Imports
import {Type} from "@google/genai";
import ical, {ICalEventTransparency} from "ical-generator";

export const definition = {
  name: "create_calendar_event",
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
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1 indicating" +
          " certainty of the data extraction (e.g., '0.85')",
      },
    },
    required: ["summary", "start", "end", "timeZone", "confidence"],
  },
};

export const handler = async (args) => {
  // Validate confidence threshold
  if (args.confidence < 0.5) {
    throw new Error(`Low confidence: ${args.confidence}`);
  }

  // Create iCal invite
  const isAllDay = !args.start.includes("T");
  const cal = ical({prodId: "//Gui Ruggiero//Guimail//EN"});
  cal.createEvent({
    start: new Date(args.start),
    end: new Date(args.end),
    timezone: args.timeZone,
    summary: args.summary,
    description: (args.description ?? "") + "\n\nCreated with Guimail",
    location: args.location,
    allDay: isAllDay,
    // All-day events show as free; timed events show as busy
    transparency: isAllDay ?
      ICalEventTransparency.TRANSPARENT :
      ICalEventTransparency.OPAQUE,
  });
  const icsString = cal.toString();

  return {
    type: "calendar_event",
    text: `Event created. Confidence = ${Math.round(args.confidence * 100)}%`,
    icalEvent: {
      method: "REQUEST",
      content: icsString,
    },
  };
};
