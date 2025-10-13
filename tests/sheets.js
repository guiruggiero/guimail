// Imports
// const {google} = require("googleapis");
import {google} from "googleapis";
// const path = require("node:path");
import path from "node:path";
import {fileURLToPath} from "node:url"; // ES module only
import {GOOGLE_SHEET_ID} from "../../secrets/guimail.mjs";

// Initializations
const newBalance = 72.48;
const __filename = fileURLToPath(import.meta.url); // ES module only
const __dirname = path.dirname(__filename); // ES module only
const issuerToRow = { // Mapping of issuers and row numbers
    "Chase": "2",
    "Capital One": "3",
    "Amex": "4",
    "TF Bank": "5",
    "Discover": "6",
};

async function addValue() {
    // Create authenticated Google Sheets client
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, "service-account-key.json"),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({version: "v4", auth});

    // Update one cell
    // const response = await sheets.spreadsheets.values.update({
    //     spreadsheetId: GOOGLE_SHEET_ID,
    //     range: "Y2",
    //     valueInputOption: "USER_ENTERED",
    //     resource: {
    //         values: [[newBalance]], // Must be in a 2D array
    //     },
    // });

    // Update multiple cells at the same time
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: GOOGLE_SHEET_ID,
        resource: {
            valueInputOption: "USER_ENTERED", // Data interpreted as if user typed
            data: [
                {
                    range: `Y${issuerToRow["Chase"]}`,
                    values: [[newBalance]], // Must be in a 2D array
                },
                {
                    range: `Z${issuerToRow["Chase"]}`,
                    values: [[new Date().toLocaleString("en-US", {timeZone: "CET"})]],
                },
            ]
        },
    });
    
    // console.log(response.data);
}

addValue();