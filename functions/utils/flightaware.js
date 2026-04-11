// Import
import {createRetryClient} from "./axiosClient.js";

// Axios instance for FlightAware AeroAPI
const aeroApiClient = createRetryClient({
  baseURL: "https://aeroapi.flightaware.com/aeroapi",
  timeout: 8000,
  headers: {"x-apikey": process.env.FLIGHTAWARE_AEROAPI_KEY},
});

// Resolves an IATA flight number to a FlightAware live-tracking URL
export const getFlightAwareUrl = async (flightNumber) => {
  const res = await aeroApiClient.get(`/flights/${flightNumber}`);
  const icao = res.data?.flights?.[0]?.ident_icao;
  return icao ?
    `https://www.flightaware.com/live/flight/${icao}` : null;
};
