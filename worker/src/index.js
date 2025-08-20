// Imports
import axios from "axios";
import {EmailMessage} from "cloudflare:email";

// Initializations
const cloudFunctionURL = "https://guimail.guiruggiero.com/"; // TODO: limit access
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

// Interceptor to handle retries
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
        // List of allowed senders
        const allowedSenders = [
            env.EMAIL_GUI,
            // env.EMAIL_UM,
            // env.EMAIL_GEORGIA,
        ].filter(Boolean).map(sender => sender.toLowerCase()); // Forced lowercase

        console.log("Subject:", message.headers.get("Subject"));

        // Check if sender is allowed
        if (!allowedSenders.includes(message.from.toLowerCase())) { // Case-insensitive
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

        // Call GuiMail
        const response = await axiosInstance.post("", null, {params: {
            from: message.from,
            headers: message.headers,
            raw: message.raw,
        }}).catch(error => { // Error calling GuiMail
            console.error(error); // TODO: Sentry
            message.setReject("Failed to call GuiMail");
        });
        const msg = response.data.msg;

        // GuiMail call successful
        if (response.data.success == true) {
            try {
                // Construct reply object
                const replyMessage = new EmailMessage(
                    env.EMAIL_GUIMAIL,
                    message.from,
                    msg,
                );

                await message.reply(replyMessage);

            } catch (error) {
                console.error(error); // TODO: Sentry
                message.setReject("Failed to respond");
            }
        
        // Error during GuiMail call
        } else { // TODO: Sentry inside function?
            message.setReject(msg);
        }
    },
};