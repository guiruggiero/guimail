// console.log(process.env.SPLITWISE_API_KEY);

// Import
import {writeFileSync} from "node:fs";

// Base URL
const BASE_URL = "https://secure.splitwise.com/api/v3.0";

// Fetch wrapper
async function splitwiseFetch(path, options = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
            "Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`,
            ...options.headers,
        },
    });
    return response.json();
}

// Get current user information
async function getCurrentUser() {
    const data = await splitwiseFetch("/get_current_user");

    console.log("Current user:", data);
}
// getCurrentUser();

// Get friends
async function getFriends() {
    const data = await splitwiseFetch("/get_friends");

    const friends = data.friends.map(({id, first_name, last_name, email}) =>
        ({id, first_name, last_name, email})
    );
    writeFileSync(new URL("friends.json", import.meta.url), JSON.stringify(friends, null, 2));
    console.log("Written to friends.json");
}
// getFriends();

// Create expense with myself
async function createExpense(description, amount) {
    // With myself
    const expense = {
        cost: amount.toFixed(2),
        description: description,
        details: "Created with Guimail",
        currency_code: "USD",
        group_id: 0, // Direct expense between users
        split_equally: true,
    };
    // console.log(expense);

    const data = await splitwiseFetch("/create_expense", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(expense),
    });

    console.log("Expense ID:", data.expenses?.[0]?.id ?? data);
}
// createExpense("Test", 10);

// Share with Georgia
async function shareWithGeorgia(description, amount) {
    const totalCents = Math.round(amount * 100);
    const perCents = Math.floor(totalCents / 2);
    const remainderCents = totalCents - perCents * 2;
    const cost = (totalCents / 100).toFixed(2);
    const payerOwed = ((perCents + remainderCents) / 100).toFixed(2);
    const otherOwed = (perCents / 100).toFixed(2);

    const expense = {
        cost,
        description: description,
        details: "Created with Guimail",
        currency_code: "USD",
        group_id: 0, // Direct expense between users
        users__0__user_id: process.env.SPLITWISE_ID_GUI,
        users__0__paid_share: cost,
        users__0__owed_share: payerOwed,
        users__1__user_id: process.env.SPLITWISE_ID_GEORGIA,
        users__1__paid_share: "0.00",
        users__1__owed_share: otherOwed,
    };
    // console.log(expense);

    const data = await splitwiseFetch("/create_expense", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(expense),
    });

    console.log("Expense ID:", data.expenses?.[0]?.id ?? data);
}
// shareWithGeorgia("Test", 10);

// ---

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
//       details: 'Created with Guimail',
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