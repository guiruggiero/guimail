// Imports
import axios from "axios";
import axiosRetry from "axios-retry";

// Axios client factory with standard retry configuration
export const createRetryClient = (config, retries = 2) => {
  const client = axios.create(config);
  axiosRetry(client, {
    retries,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) =>
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500),
  });
  return client;
};
