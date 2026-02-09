import { NextResponse } from "next/server";
import { ingestEmail } from "@/lib/ingest-email";

type PostmarkRecipient = {
  Email: string;
  Name?: string;
};

type PostmarkPayload = {
  From: string;
  FromName?: string;
  FromFull?: { Email: string; Name?: string };
  To: string;
  ToFull?: PostmarkRecipient[];
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Date?: string;
};

export async function POST(request: Request) {
  // Verify webhook via HTTP Basic auth
  // Postmark webhook URL format: https://postmark:TOKEN@www.dailygist.fyi/api/webhooks/postmark
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.POSTMARK_WEBHOOK_TOKEN;

  // TODO: Remove debug logging after confirming auth works
  console.log("[postmark-webhook] auth header present:", !!authHeader);
  console.log("[postmark-webhook] auth header starts with Basic:", authHeader?.startsWith("Basic "));
  console.log("[postmark-webhook] expected token present:", !!expectedToken);
  if (authHeader?.startsWith("Basic ")) {
    const debugDecoded = atob(authHeader.slice(6));
    console.log("[postmark-webhook] decoded credentials:", debugDecoded.replace(/:.+/, ":***"));
  }

  if (!expectedToken || !authHeader?.startsWith("Basic ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = atob(authHeader.slice(6));
  const password = decoded.split(":").slice(1).join(":");
  if (password !== expectedToken) {
    console.log("[postmark-webhook] password mismatch, lengths:", password.length, expectedToken.length);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostmarkPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract the forwarding address from To/ToFull
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || "inbound.dailygist.fyi";
  let toAddress = "";
  if (body.ToFull && body.ToFull.length > 0) {
    const dgRecipient = body.ToFull.find((r) =>
      r.Email.toLowerCase().endsWith(`@${inboundDomain}`)
    );
    toAddress = dgRecipient?.Email || body.ToFull[0].Email;
  } else {
    const addresses = body.To.split(",").map((a) => a.trim());
    toAddress =
      addresses.find((a) => a.toLowerCase().includes(`@${inboundDomain}`)) ||
      addresses[0];
  }

  // Extract sender email
  const fromEmail = body.FromFull?.Email || body.From;
  const fromName = body.FromFull?.Name || body.FromName || "";

  const result = await ingestEmail({
    to: toAddress.toLowerCase(),
    from: fromEmail,
    fromName,
    subject: body.Subject || "",
    textBody: body.TextBody || body.StrippedTextReply || "",
    htmlBody: body.HtmlBody || "",
    date: body.Date,
  });

  return NextResponse.json(result.body, { status: result.status });
}
