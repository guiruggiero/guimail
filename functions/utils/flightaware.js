// Imports
import axios from "axios";
import axiosRetry from "axios-retry";

// Axios instance for FlightAware AeroAPI
const aeroApiClient = axios.create({
  baseURL: "https://aeroapi.flightaware.com/aeroapi",
  timeout: 8000,
  headers: {"x-apikey": process.env.FLIGHTAWARE_AEROAPI_KEY},
});

// Retry configuration
axiosRetry(aeroApiClient, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response && error.response.status >= 500),
});

// Resolves an IATA flight number to a FlightAware live-tracking URL
export const getFlightAwareUrl = async (flightNumber) => {
  const res = await aeroApiClient.get(`/flights/${flightNumber}`);
  const icao = res.data?.flights?.[0]?.ident_icao;
  return icao ?
    `https://www.flightaware.com/live/flight/${icao}` : null;
};