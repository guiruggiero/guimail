// Imports
import {createRetryClient} from "./axiosClient.js";

// Axios instance for Guiddleware
const guiddlewareClient = createRetryClient({
  baseURL: process.env.GUIDDLEWARE_URL,
  timeout: 10000, // 10s
  headers: {
    "Authorization": `Bearer ${process.env.GUIDDLEWARE_SECRET_GUIMAIL}`,
    "Content-Type": "application/json",
  },
});

// Creates a Splitwise expense; resolution/fallback logic lives in Guiddleware
export const createExpense = async (payload) => {
  const res = await guiddlewareClient.post("/splitwise/expenses", payload);
  return res.data;
};

// Creates a Google Calendar event
export const createCalendarEvent = async (payload) => {
  const res = await guiddlewareClient.post("/calendar/events", payload);
  return res.data;
};

// Resolves an IATA flight number to a FlightAware live-tracking URL
export const getFlightAwareUrl = async (flightNumber) => {
  const res = await guiddlewareClient.get("/flightaware/track", {
    params: {flightNumber},
  });
  return res.data.url;
};

// Creates a Google Task
export const createTask = async (payload) => {
  const res = await guiddlewareClient.post("/tasks", payload);
  return res.data;
};

// Writes cell ranges to a Google Sheet
export const updateSheet = async (payload) => {
  const res = await guiddlewareClient.post("/sheets/values", payload);
  return res.data;
};

// Creates a Trello card
export const createTrelloCard = async (payload) => {
  const res = await guiddlewareClient.post("/trello/cards", payload);
  return res.data;
};

// Full-text searches Trello card titles
export const searchTrelloCards = async (query) => {
  const res = await guiddlewareClient.get(
    "/trello/cards/search", {params: {q: query}},
  );
  return res.data.cards;
};

// Updates a Trello card's name, description, or list
export const updateTrelloCard = async (id, payload) => {
  const res = await guiddlewareClient.patch(`/trello/cards/${id}`, payload);
  return res.data;
};
