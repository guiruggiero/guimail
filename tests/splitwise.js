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
    const response = await axiosInstance.post("/create_expense", {
        cost: amount,
        description: description,
        details: "Created via GuiMail",
        currency_code: "USD",
        group_id: 0, // Direct expense between users
        users__0__user_id: SPLITWISE_GUI_ID,
        users__0__paid_share: amount,
        users__0__owed_share: amount/2,
        users__1__user_id: SPLITWISE_GEORGIA_ID,
        users__1__paid_share: "0",
        users__1__owed_share: amount/2,
    });

    console.log("Expense created:", response.data);
}
createExpense("Test", "10.00");