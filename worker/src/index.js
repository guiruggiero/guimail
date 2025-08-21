// Imports
import axios from "axios";
import axiosRetry from "axios-retry";
import {EmailMessage} from "cloudflare:email";

// Initializations
const cloudFunctionURL = "https://guimail.guiruggiero.com/";
const MAX_EMAIL_SIZE = 5 * 1024 * 1024; // 5MB

// Axios instance with retry configuration
const axiosInstance = axios.create({
    baseURL: cloudFunctionURL,
    timeout: 4000, // 4s
});

// Retry configuration
axiosRetry(axiosInstance, {
    retries: 2, // Number of retry attempts
    retryDelay: axiosRetry.exponentialDelay, // 1s then 2s between retries
    // Only retry on network errors or 5xx responses
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               (error.response && error.response.status >= 500);
    },
});

export default {
    // eslint-disable-next-line no-unused-vars
    async email(message, env, ctx) {
        // Extract essential message data
        const subject = message.headers.get("Subject");
        const from = message.from;
        const rawSize = message.rawSize;

        // Show on Cloudflare console
        console.log("Subject:", subject);

        // List of allowed senders
        const allowedSenders = [
            env.EMAIL_GUI,
            // env.EMAIL_UM,
            // env.EMAIL_GEORGIA,
        ].filter(Boolean).map(sender => sender.toLowerCase()); // Forced lowercase

        // Check if sender is allowed
        if (!allowedSenders.includes(from.toLowerCase())) { // Case-insensitive
            // TODO: log details somewhere - Sentry logs?

            message.setReject("Sender not allowed");
            return;
        }

        // Check for email size
        if (rawSize > MAX_EMAIL_SIZE) {
            // TODO: log details somewhere - Sentry logs?

            message.setReject("Email is too large");
            return;
        }

        // Extract other message data
        const raw = message.raw;
        const date = message.headers.get("Date");
        const messageID = message.headers.get("Message-ID");
        const references = message.headers.get("References");

        // Call GuiMail
        let response;
        try {
            response = await axiosInstance.post("", raw, {
                headers: {
                    "Authorization": `Bearer ${env.WORKER_SECRET}`,
                    "Content-Type": "application/octet-stream",
                },
                params: {from, date, subject, messageID, references},
            });
        } catch (error) {
            console.error(error); // TODO: Sentry
            // await Sentry.flush(2000);

            message.setReject("Failed to call GuiMail");
            return;
        }

        // Construct reply object
        try {
            const replyMessage = new EmailMessage(
                env.EMAIL_GUIMAIL,
                from,
                response.data,
            );

            await message.reply(replyMessage);
            return;
            
        } catch (error) {
            console.error(error); // TODO: Sentry
            // await Sentry.flush(2000);

            message.setReject("Failed to respond");
            return;
        }
    },
};