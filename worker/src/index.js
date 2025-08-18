import {extractBody, sendReply} from "./message.js";
// import {extractEvent} from "./llm.js"; // TODO: createEvent
// import {createEvent} from "./calendar.js";

export default {
    // eslint-disable-next-line no-unused-vars
    async email(message, env, ctx) {
        // List of allowed senders (forced lowercase)
        const allowedSenders = [
            env.EMAIL_GUI,
            env.EMAIL_UM,
            // env.EMAIL_GEORGIA,
        ].filter(Boolean).map(sender => sender.toLowerCase());
        
        const MAX_EMAIL_SIZE = 5 * 1024 * 1024; // 5MB
        
        console.log("Subject:", message.headers.get("Subject"));

        // Check if sender is allowed (case-insensitive)
        if (!allowedSenders.includes(message.from.toLowerCase())) {
            // TODO: log details somewhere - Sentry logs?

            message.setReject("Sender not allowed");
            return;
        }

        // Check for email size
        if (message.rawSize > MAX_EMAIL_SIZE) {
            // TODO: log details somewhere - Sentry logs?

            message.setReject("Email is too large");
            return;
        }

        // Extract email body from the message object
        const messageBody = await extractBody(message);
        

        // ---


        // Extract event information with LLM - TODO: via function to reduce worker CPU usage?
        // const eventData = await extractEvent(messageBody);

        // Put event in the calendar - TODO: via Function to simplify auth?
        // const eventLink = await createEvent(eventData);

        // Create event with LLM directly (with MCP) - TODO
        // const event = await createEvent(email.body);


        // ---


        // Confirm event creation
        // await sendReply(message, env, eventLink);
        await sendReply(message, env, messageBody);
    },
};