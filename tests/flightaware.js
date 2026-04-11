// Imports
import axios from "axios";

// GET /flights/{ident}
async function getFlight(ident) {
    const response = await axios.get(
        `https://aeroapi.flightaware.com/aeroapi/flights/${ident}`,
        {headers: {"x-apikey": process.env.FLIGHTAWARE_AEROAPI_KEY}},
    );

    const flight = response.data?.flights?.[0];
    console.log("ident_iata:", flight?.ident_iata);
    console.log("ident_icao:", flight?.ident_icao);
    console.log("Full response:", JSON.stringify(response.data, null, 2));
}
getFlight("AA100");

// ---

// response.data examples

// Success
// TK

// Error
// TK