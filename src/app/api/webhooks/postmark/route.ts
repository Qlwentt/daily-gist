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
  Cc?: string;
  CcFull?: PostmarkRecipient[];
  OriginalRecipient?: string;
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

  if (!expectedToken || !authHeader?.startsWith("Basic ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const decoded = atob(authHeader.slice(6));
  const password = decoded.split(":").slice(1).join(":");
  if (password !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostmarkPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract the forwarding address from OriginalRecipient, To/ToFull, or Cc/CcFull
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || "inbound.dailygist.fyi";

  console.log("[postmark] To:", body.To);
  console.log("[postmark] OriginalRecipient:", body.OriginalRecipient);
  console.log("[postmark] ToFull:", JSON.stringify(body.ToFull));
  console.log("[postmark] CcFull:", JSON.stringify(body.CcFull));
  console.log("[postmark] From:", body.From);
  console.log("[postmark] Subject:", body.Subject);

  let toAddress = "";

  // 1. Check OriginalRecipient first (envelope recipient — most reliable for forwards)
  if (body.OriginalRecipient?.toLowerCase().endsWith(`@${inboundDomain}`)) {
    toAddress = body.OriginalRecipient;
  }

  // 2. Check ToFull
  if (!toAddress && body.ToFull && body.ToFull.length > 0) {
    const dgRecipient = body.ToFull.find((r) =>
      r.Email.toLowerCase().endsWith(`@${inboundDomain}`)
    );
    if (dgRecipient) toAddress = dgRecipient.Email;
  }

  // 3. Check CcFull (some forwarding setups put the address in Cc)
  if (!toAddress && body.CcFull && body.CcFull.length > 0) {
    const dgRecipient = body.CcFull.find((r) =>
      r.Email.toLowerCase().endsWith(`@${inboundDomain}`)
    );
    if (dgRecipient) toAddress = dgRecipient.Email;
  }

  // 4. Fallback: parse the To string
  if (!toAddress) {
    const addresses = body.To.split(",").map((a) => a.trim());
    toAddress =
      addresses.find((a) => a.toLowerCase().includes(`@${inboundDomain}`)) ||
      addresses[0];
  }

  console.log("[postmark] Resolved toAddress:", toAddress);

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
