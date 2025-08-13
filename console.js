import {createMimeMessage} from "mimetext";
import {EmailMessage} from "cloudflare:email";

export default {
    async email(message, env, ctx) {
        // List of allowed senders
        const allowedSenders = [
            env.EMAIL_GUI,
        ];

        // message parameters: from, to, headers, raw, rawSize
        // message methods: setReject, await forward, await reply

        console.log(message.headers.get("Subject"));

        // Sender not allowed
        if (!allowedSenders.includes(message.from)) {
            // TODO: log details somewhere - Sentry logs?
            
            message.setReject("Address not allowed");
            return;
        }
        
        // Sender allowed
        else {
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
                msg.setSubject("Auto-reply"); // TODO: how does it work with reply-to?
                msg.addMessage({
                    contentType: 'text/plain',
                    data: "Email received"
                });

                const replyMessage = new EmailMessage(
                    env.EMAIL_GUIMAIL,
                    message.from,
                    msg.asRaw()
                );

                await message.reply(replyMessage);
                return;

            } catch (error) { // TODO: Sentry
                console.error(error);
                message.setReject("Failed to process email reply.");
                return;
            }
        }
    }
}