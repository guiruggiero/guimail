const {default: ical} = require("ical-generator");

// Create iCal invite
const cal = ical({prodId: "//Gui Ruggiero//GuiMail//EN"});
cal.createEvent({
    start: new Date("2025-10-15T08:00:00"),
    end: new Date("2025-10-15T09:00:00"),
    timezone: "America/Los_Angeles",
    summary: "Whatever summary",
    description: "Whatever description",
    location: "Whatever location",
});
const icsString = cal.toString();

console.log(icsString);

// icsString output

// BEGIN:VCALENDAR
// VERSION:2.0
// PRODID:-//GuiRuggiero//GuiMail//EN
// BEGIN:VEVENT
// UID:6cdca342-82f1-415d-946a-d3243bef5aa0
// SEQUENCE:0
// DTSTAMP:20251015T151725Z
// DTSTART;TZID=America/Los_Angeles:20251015T080000
// DTEND;TZID=America/Los_Angeles:20251015T090000
// SUMMARY:Whatever summary
// LOCATION:Whatever location
// DESCRIPTION:Whatever description
// END:VEVENT
// END:VCALENDAR