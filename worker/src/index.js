// Imports
import axios from "axios";
import {EmailMessage} from "cloudflare:email";

// Initializations
const cloudFunctionURL = "https://guimail.guiruggiero.com/";
const MAX_EMAIL_SIZE = 5 * 1024 * 1024; // 5MB

// Axios instance with retry configuration
const axiosInstance = axios.create({
    baseURL: cloudFunctionURL,
    timeout: 4000, // 4s
    retry: 2, // Number of retry attempts
    retryDelay: (retryCount) => {
        return retryCount * 1000; // 1s, then 2s between retries
    },
});

// Interceptor to handle retries - TODO: remove/simplify if CPU usage is high?
axiosInstance.interceptors.response.use(null, async (error) => {
    const config = error.config;
    
    // Only retry on network errors or 5xx responses
    if (!config || !config.retry || (error.response && error.response.status < 500 && error.response.status >= 0)) {
        return Promise.reject(error);
    }
    
    config.retryCount = config.retryCount || 0;
    
    if (config.retryCount >= config.retry) {
        return Promise.reject(error);
    }
    
    config.retryCount++;
    const delay = config.retryDelay(config.retryCount);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return axiosInstance(config);
});

export default {
    // eslint-disable-next-line no-unused-vars
    async email(message, env, ctx) {
        // Extract message data
        const from = message.from;
        const raw = message.raw;
        const rawSize = message.rawSize;
        const date = message.headers.get("Date");
        const subject = message.headers.get("Subject");
        const messageID = message.headers.get("Message-ID");
        const references = message.headers.get("References");

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

        // Call GuiMail
        const response = await axiosInstance.post("", raw, {
            headers: {
                "Authorization": `Bearer ${env.WORKER_SECRET}`,
                "Content-Type": "application/octet-stream",
            },
            params: {
                from: from,
                date: date,
                subject: subject,
                messageID: messageID,
                references: references,
            },
        }).catch(error => {
            console.error(error); // TODO: Sentry
            // await Sentry.flush(2000);

            message.setReject("Failed to call GuiMail");
            return;
        });

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