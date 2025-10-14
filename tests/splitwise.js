// Imports
import axios from "axios";
import axiosRetry from "axios-retry";
import {SPLITWISE_API_KEY, SPLITWISE_GUI_ID, SPLITWISE_GEORGIA_ID} from "../../secrets/guimail.mjs";
// console.log(SPLITWISE_API_KEY);

// Axios instance
const axiosInstance = axios.create({
    baseURL: "https://secure.splitwise.com/api/v3.0",
    headers: {"Authorization": `Bearer ${SPLITWISE_API_KEY}`},
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

// Get current user information
// async function getCurrentUser() {
//     const response = await axiosInstance.get("/get_current_user");

//     console.log("Current user:", response.data);
// }
// getCurrentUser();

// Create expense
async function createExpense(description, amount) {
    // With Georgia
    // const expense = {
    //     cost: amount.toFixed(2),
    //     description: description,
    //     details: "Created via GuiMail",
    //     currency_code: "USD",
    //     group_id: 0, // Direct expense between users
    //     users__0__user_id: SPLITWISE_GUI_ID,
    //     users__0__paid_share: amount.toFixed(2),
    //     users__0__owed_share: (amount/2).toFixed(2),
    //     users__1__user_id: SPLITWISE_GEORGIA_ID,
    //     users__1__paid_share: "0",
    //     users__1__owed_share: (amount/2).toFixed(2),
    // };
    
    // With myself
    const expense = {
        cost: amount.toFixed(2),
        description: description,
        details: "Created via GuiMail",
        currency_code: "USD",
        group_id: 0, // Direct expense between users
        split_equally: true,
    };

    // console.log(expense);

    const expenseResponse = await axiosInstance.post("/create_expense", expense);

    console.log("Expense created:", expenseResponse.data);
}
createExpense("Test", 10);

// expenseResponse.data examples

// Success
// {
//   expenses: [
//     {
//       id: 4101567962,
//       group_id: null,
//       expense_bundle_id: null,
//       description: 'Test',
//       repeats: false,
//       repeat_interval: null,
//       email_reminder: false,
//       email_reminder_in_advance: -1,
//       next_repeat: null,
//       details: 'Created via GuiMail',
//       comments_count: 0,
//       payment: false,
//       creation_method: null,
//       transaction_method: 'offline',
//       transaction_confirmed: false,
//       transaction_id: null,
//       transaction_status: null,
//       cost: '10.0',
//       currency_code: 'USD',
//       repayments: [Array],
//       date: '2025-10-13T17:56:21Z',
//       created_at: '2025-10-13T17:56:21Z',
//       created_by: [Object],
//       updated_at: '2025-10-13T17:56:21Z',
//       updated_by: null,
//       deleted_at: null,
//       deleted_by: null,
//       category: [Object],
//       receipt: [Object],
//       users: [Array]
//     }
//   ],
//   errors: {}
// }

// Error
// {
//     expenses: [],
//     errors: {
//         base: ["There are zero people involved in this expense! Make sure to add some before saving."]
//     }
// }