import {createMimeMessage} from "mimetext";
import {EmailMessage} from "cloudflare:email";

export default {
    // eslint-disable-next-line no-unused-vars
    async email(message, env, ctx) {
        // List of allowed senders
        const allowedSenders = [
            env.EMAIL_GUI,
            env.EMAIL_UM,
            // env.EMAIL_GEORGIA,
        ];

        console.log(message.headers.get("Subject"));

        // Sender allowed
        if (allowedSenders.includes(message.from)) {
            // message.setReject("Sender allowed");

            // TODO: send for processing using function

            // await message.reply(
            //   "from: ", message.from, "/n",
            //   "to: ", message.to, "/n",
            //   "headers: ", message.headers, "/n",
            //   "rawSize: ", message.rawSize, "/n",
            //   "raw: ", message.raw, "/n",
            // );

            try {
                const msg = createMimeMessage();
                msg.setHeader("In-Reply-To", message.headers.get("Message-ID"));
                msg.setSender({name: "GuiMail", addr: env.EMAIL_GUIMAIL});
                msg.setRecipient(message.from);
                msg.setSubject("Auto-reply"); // TODO: how to make it be a thread reply?
                msg.addMessage({
                    contentType: "text/plain",
                    data: "Test complete - email received",
                });

                const replyMessage = new EmailMessage(
                    env.EMAIL_GUIMAIL,
                    message.from,
                    msg.asRaw(),
                );

                await message.reply(replyMessage);

            } catch (error) { // TODO: Sentry
                console.error(error);
                message.setReject("Failed to process email");
            }
        }
        
        // Sender not allowed
        else {
            message.setReject("Sender not allowed");

            // TODO: log details somewhere - Sentry logs?
        }
    },
};