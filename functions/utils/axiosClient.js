// Imports
import axios from "axios";
import axiosRetry from "axios-retry";

export const defaultRetryCondition = (error) =>
  axiosRetry.isNetworkOrIdempotentRequestError(error) ||
  (error.response && error.response.status >= 500);

// Axios client factory with standard retry configuration
export const createRetryClient = (config, retries = 2, retryCondition = defaultRetryCondition) => {
  const client = axios.create(config);
  axiosRetry(client, {
    retries,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition,
  });
  return client;
};
