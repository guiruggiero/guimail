import {createMimeMessage} from "mimetext";
import {EmailMessage} from "cloudflare:email";

export async function sendReply(message, env) {
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
        console.log(error);
        message.setReject("Failed to process email");
    }
}