// Import
import {createRetryClient} from "./axiosClient.js";

export const splitwiseClient = createRetryClient({
  baseURL: "https://secure.splitwise.com/api/v3.0",
  timeout: 10000, // 10s
  headers: {"Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`},
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

// Person registry from SPLITWISE_ID_<NAME> env vars
let personRegistry = null;
export const getPersonRegistry = () => {
  if (personRegistry) return personRegistry;
  personRegistry = new Map();
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^SPLITWISE_ID_(.+)$/);
    if (match && value) personRegistry.set(match[1].toLowerCase(), value);
  }
  return personRegistry;
};

// Equal-split calculator for N+1 people (payer + others)
export const splitEqual = (amount, numOthers) => {
  const totalParts = numOthers + 1;
  const totalCents = Math.round(amount * 100);
  const perCents = Math.floor(totalCents / totalParts);
  const remainderCents = totalCents - perCents * totalParts;
  return {
    cost: (totalCents / 100).toFixed(2),
    payerOwed: ((perCents + remainderCents) / 100).toFixed(2),
    otherOwed: (perCents / 100).toFixed(2),
  };
};

// Creator for shared expenses (payer + N others, split equally)
export const createSharedExpense = async (
  description, amount, currency, otherPersonIds, payerId) => {
  const {cost, payerOwed, otherOwed} = splitEqual(
    amount, otherPersonIds.length);

  const payload = {
    cost,
    description,
    details: "Created with Guimail",
    currency_code: currency,
    group_id: 0,
    users__0__user_id: payerId,
    users__0__paid_share: cost,
    users__0__owed_share: payerOwed,
  };

  otherPersonIds.forEach((id, i) => {
    payload[`users__${i + 1}__user_id`] = id;
    payload[`users__${i + 1}__paid_share`] = "0.00";
    payload[`users__${i + 1}__owed_share`] = otherOwed;
  });

  const res = await splitwiseClient.post("/create_expense", payload);
  checkSplitwiseError(res.data);
  return res;
};

// Builds a Splitwise expense URL from an API response
export const buildExpenseUrl = (expenseData) => {
  const id = expenseData.expenses?.[0]?.id;
  return id ? `https://secure.splitwise.com/#/expenses/${id}` : null;
};

// Creator for expenses with Georgia (backward compat for addToBudget)
export const createExpenseWithGeorgia = async (
  description, amount, currency) => {
  return createSharedExpense(
    description, amount, currency,
    [process.env.SPLITWISE_ID_GEORGIA],
    process.env.SPLITWISE_ID_GUI);
};
