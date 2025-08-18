// Imports
import PostalMime from "postal-mime";
import {createMimeMessage} from "mimetext";
import {EmailMessage} from "cloudflare:email";

// Initialization
const MAX_EMAIL_SIZE = 5 * 1024 * 1024; // 5MB

export default {
    // eslint-disable-next-line no-unused-vars
    async email(message, env, ctx) {
        // List of allowed senders
        const allowedSenders = [
            env.EMAIL_GUI,
            env.EMAIL_UM,
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

        // --- TODO: implement in GuiMail
        // parameters: message.headers, message.raw, message.from
        // return: success/fail boolean; msg for true, text for false

        // Extract body from message
        let messageBody = "";
        try {
            const parser = new PostalMime();
            const body = await parser.parse(message.raw);

            // Return text body if it exists, otherwise the HTML body
            messageBody = body.text || body.html;
            if (!messageBody) throw new Error("Message has no text or HTML body");

        } catch (error) { // TODO: Sentry
            console.log(error);
            message.setReject("Failed to extract message body");
        }

        // TODO: call Gemini

        // Confirm event creation
        try {
            // Get relevant content from message
            const originalSubject = message.headers.get("Subject") || "";
            const messageId = message.headers.get("Message-ID");

            // Initialize message object
            const msg = createMimeMessage();

            // Set fields for threading
            const newSubject = originalSubject.trim().toLowerCase().startsWith("re:") ? originalSubject : `Re: ${originalSubject}`; // Add "Re:" prefix if not already present
            msg.setSubject(newSubject);
            msg.setHeader("In-Reply-To", messageId);
            const newReferences = [message.headers.get("References"), messageId].filter(Boolean).join(" ");
            msg.setHeader("References", newReferences);

            // Set content for email body
            msg.addMessage({
                contentType: "text/plain",
                // data: `Event created: ${eventLink}`, // TODO: return from GuiMail function
                data: `Information extracted: ${messageBody}`,
            });

            // Set remaining fields
            msg.setSender({name: "GuiMail", addr: env.EMAIL_GUIMAIL});
            msg.setRecipient(message.from);


            // ---


            // Construct reply object
            const replyMessage = new EmailMessage(
                env.EMAIL_GUIMAIL,
                message.from,
                msg.asRaw(),
            );

            await message.reply(replyMessage);

        } catch (error) { // TODO: Sentry
            console.log(error);
            message.setReject("Failed to respond");
        }
    },
};