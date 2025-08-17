import PostalMime from "postal-mime";
import {createMimeMessage} from "mimetext";
import {EmailMessage} from "cloudflare:email";

// Extract email body from message
export async function extractBody(message) {
    try {
        const parser = new PostalMime();
        const email = await parser.parse(message.raw);

        // Return text body if it exists, otherwise the HTML
        const body = email.text || email.html;
        if (!body) throw new Error("Email has no text or HTML body");
        return body;

    } catch (error) { // TODO: Sentry
        console.log(error);
        message.setReject("Failed to extract email body");
    }
}

// Respond to message
export async function sendReply(message, env, eventLink) {
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
            // data: `Event created: ${eventLink}`,
            data: `messageBody: ${eventLink}`,
        });

        // Set remaining fields
        msg.setSender({name: "GuiMail", addr: env.EMAIL_GUIMAIL});
        msg.setRecipient(message.from);

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
}