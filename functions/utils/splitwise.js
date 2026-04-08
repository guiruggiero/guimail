// Shared Splitwise utilities
import axios from "axios";
import axiosRetry from "axios-retry";

// Axios instance for Splitwise
export const axiosInstance = axios.create({
  baseURL: "https://secure.splitwise.com/api/v3.0",
  timeout: 10000, // 10s
  headers: {"Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`},
});

// Retry configuration
axiosRetry(axiosInstance, {
  retries: 2, // Retry attempts
  retryDelay: axiosRetry.exponentialDelay, // 1s then 2s between retries
  // Only retry on network or 5xx errors
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500);
  },
});

// Splitwise error checker
export const checkSplitwiseError = (expenseData) => {
  const {error, errors} = expenseData;

  if (error) throw new Error(`Splitwise API: ${error}`); // {error: ""}

  if (errors && Object.keys(errors).length > 0) { // {errors: {base: [""]}}
    const errorMessage = Object.values(errors).flat().join(", ");
    throw new Error(`Splitwise API: ${errorMessage}`);
  }
};

// Split calculator for 50/50 expenses
export const splitHalf = (amount) => {
  const costCents = Math.round(amount * 100);
  const halfCents = Math.floor(costCents / 2);
  return {
    cost: (costCents / 100).toFixed(2),
    halfShare: (halfCents / 100).toFixed(2),
    remainderShare: ((costCents - halfCents) / 100).toFixed(2),
  };
};

// Creator for expenses with Georgia
export const createExpenseWithGeorgia = async (
  description, amount, currency) => {
  const {cost, halfShare, remainderShare} = splitHalf(amount);

  const expenseResponse = await axiosInstance.post("/create_expense", {
    cost: cost,
    description: description,
    details: "Created with Guimail",
    currency_code: currency,
    group_id: 0, // Direct expense between users
    users__0__user_id: process.env.SPLITWISE_GUI_ID,
    users__0__paid_share: cost,
    users__0__owed_share: halfShare,
    users__1__user_id: process.env.SPLITWISE_GEORGIA_ID,
    users__1__paid_share: "0",
    users__1__owed_share: remainderShare,
  });
  checkSplitwiseError(expenseResponse.data);

  return expenseResponse;
};
