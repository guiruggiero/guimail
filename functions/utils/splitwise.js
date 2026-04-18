// Import
import {createRetryClient} from "./axiosClient.js";

const splitwiseClient = createRetryClient({
  baseURL: "https://secure.splitwise.com/api/v3.0",
  timeout: 10000, // 10s
  headers: {"Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`},
});

// Splitwise error checker
const checkSplitwiseError = (expenseData) => {
  const {error, errors} = expenseData;

  if (error) throw new Error(`Splitwise API: ${error}`); // {error: ""}

  if (errors && Object.keys(errors).length > 0) { // {errors: {base: [""]}}
    const errorMessage = Object.values(errors).flat().join(", ");
    throw new Error(`Splitwise API: ${errorMessage}`);
  }
};

// Creator for solo expenses (single-user)
export const createSoloExpense = async (
  description, amount, currency, details = "") => {
  const fullDetails = [details, "Created with Guimail"]
    .filter(Boolean).join("\n\n");

  const res = await splitwiseClient.post("/create_expense", {
    cost: amount.toFixed(2),
    description,
    details: fullDetails,
    currency_code: currency,
    group_id: 0,
    split_equally: true,
  });
  checkSplitwiseError(res.data);
  return res;
};

// Friend registry from SPLITWISE_FRIENDS env var, array of {id, name, nickname}
let friendRegistry = null;
export const getFriendRegistry = () => {
  if (friendRegistry) return friendRegistry;

  friendRegistry = new Map();
  const raw = process.env.SPLITWISE_FRIENDS;
  if (!raw) return friendRegistry;

  let friends;
  try {
    friends = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse SPLITWISE_FRIENDS: ${error.message}`, {cause: error});
  }
  for (const {id, name, nickname} of friends) {
    const sid = String(id);

    const [firstName] = name.split(" ");
    friendRegistry.set(firstName.toLowerCase(), sid);
    friendRegistry.set(name.toLowerCase(), sid);

    if (nickname) {
      for (const part of nickname.split(/\s+or\s+/i)) {
        friendRegistry.set(part.trim().toLowerCase(), sid);
      }
    }
  }

  return friendRegistry;
};

// Equal-split calculator for N+1 people (payer + others)
const splitEqual = (amount, numOthers) => {
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
  description, amount, currency, otherPersonIds, payerId, details = "") => {
  const {cost, payerOwed, otherOwed} = splitEqual(
    amount, otherPersonIds.length);

  const fullDetails = [details, "Created with Guimail"]
    .filter(Boolean).join("\n\n");

  const payload = {
    cost,
    description,
    details: fullDetails,
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

// Creator for expenses with Georgia
export const createExpenseWithGeorgia = async (
  description, amount, currency) => {
  return createSharedExpense(
    description, amount, currency,
    [process.env.SPLITWISE_ID_GEORGIA],
    process.env.SPLITWISE_ID_GUI);
};
