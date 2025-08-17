import {sendReply} from "./reply.js";

export default {
    // eslint-disable-next-line no-unused-vars
    async email(message, env, ctx) {
        // List of allowed senders
        const allowedSenders = [
            env.EMAIL_GUI,
            env.EMAIL_UM,
            // env.EMAIL_GEORGIA,
        ];

        console.log("Subject:", message.headers.get("Subject"));

        // Sender allowed
        if (allowedSenders.includes(message.from)) {
            // TODO: send for LLM processing

            await sendReply(message, env);

            // message.setReject("Sender allowed");
        }
        
        // Sender not allowed
        else {
            // TODO: log details somewhere - Sentry logs?

            message.setReject("Sender not allowed");
        }
    },
};