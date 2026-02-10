export type RawEmailRow = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
};

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatEmailsForPodcast(emails: RawEmailRow[]): string {
  return emails
    .map((email) => {
      const senderName = email.from_name || email.from_email;
      const subject = email.subject || "(no subject)";
      const body =
        email.text_body ||
        (email.html_body ? stripHtml(email.html_body) : "(no content)");

      return `--- Newsletter: ${senderName} ---\nSubject: ${subject}\n\n${body}`;
    })
    .join("\n\n");
}
