// Imports
import * as Sentry from "@sentry/cloudflare";
import axios from "axios";
import axiosRetry from "axios-retry";
import {EmailMessage} from "cloudflare:email";

// Initializations
const cloudFunctionURL = "https://guimail.guiruggiero.com/";
const MAX_EMAIL_SIZE = 5 * 1024 * 1024; // 5MB

// Axios instance
const axiosInstance = axios.create({
    baseURL: cloudFunctionURL,
    timeout: 32000, // 32s
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

export default Sentry.withSentry(
    env => ({
        dsn: env.SENTRY_DSN,
        tracesSampleRate: 1.0,
        enableLogs: true,
    }),
    
    {
        // eslint-disable-next-line no-unused-vars
        async email(message, env, ctx) {
            Sentry.logger.info("Worker: started");
            
            // Extract essential message data
            const from = message.from;
            const rawSize = message.rawSize;

            // List of allowed senders
            const allowedSenders = [
                env.EMAIL_GUI,
                env.EMAIL_UM,
                env.EMAIL_GEORGIA,
                env.EMAIL_PANDA,
            ].filter(Boolean).map(sender => sender.toLowerCase()); // Forced lowercase

            // Check if sender is allowed
            if (!allowedSenders.includes(from.toLowerCase())) { // Case-insensitive
                Sentry.logger.warn("Worker: sender not allowed", {sender: from});
                await Sentry.flush(2000);

                message.setReject("You're not a GuiMail user yet! Please, reach out to Gui at https://guiruggiero.com.");
                return;
            }
            Sentry.logger.info("Worker: message from", {sender: from});

            // Check for email size
            if (rawSize > MAX_EMAIL_SIZE) {
                Sentry.logger.warn("Worker: email too large", {size: rawSize});
                await Sentry.flush(2000);

                message.setReject("This was too large for GuiMail. Delete something (an attachment?) and try again, please.");
                return;
            }

            // Extract other message data
            const raw = message.raw;
            const subject = message.headers.get("Subject");
            const messageID = message.headers.get("Message-ID");
            const references = message.headers.get("References");
            Sentry.logger.info("Worker: message subject", {subject});

            // Call GuiMail
            let response;
            try {
                response = await axiosInstance.post("", raw, {
                    headers: {
                        "Authorization": `Bearer ${env.WORKER_SECRET}`,
                        "Content-Type": "application/octet-stream",
                    },
                    params: {from, subject, messageID, references},
                });
                Sentry.logger.info("Worker: GuiMail call successful");

            } catch (error) {
                // GuiMail responded with status 4xx or 5xx
                if (error.response) Sentry.logger.warn("Worker: GuiMail failed", {
                    status: error.response.status,
                    data: error.response.data,
                });

                // Other errors
                else Sentry.captureException(error, {contexts: {
                    from,
                    subject,
                    messageID,
                    references,
                    raw,
                }});
                await Sentry.flush(2000);

                message.setReject("Something went wrong. Don't worry, Gui has been notified");
                return;
            }

            // Construct reply object
            try {
                const replyMessage = new EmailMessage(
                    env.EMAIL_GUIMAIL,
                    from,
                    response.data,
                );

                Sentry.logger.info("Worker: done");
                await Sentry.flush(2000);

                await message.reply(replyMessage);
                return;

            } catch (error) {
                Sentry.captureException(error, {contexts: {
                    to: from,
                    reply: response.data,
                }});
                await Sentry.flush(2000);

                message.setReject("Something went wrong. Don't worry, Gui has been notified");
                return;
            }
        },
    },
);