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
  // Verify webhook token
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.POSTMARK_WEBHOOK_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostmarkPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract the forwarding address from To/ToFull
  let toAddress = "";
  if (body.ToFull && body.ToFull.length > 0) {
    // Find the @dailygist.fyi recipient
    const dgRecipient = body.ToFull.find((r) =>
      r.Email.toLowerCase().endsWith("@dailygist.fyi")
    );
    toAddress = dgRecipient?.Email || body.ToFull[0].Email;
  } else {
    // Parse from To string — may contain multiple, find the dailygist one
    const addresses = body.To.split(",").map((a) => a.trim());
    toAddress =
      addresses.find((a) => a.toLowerCase().includes("@dailygist.fyi")) ||
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
