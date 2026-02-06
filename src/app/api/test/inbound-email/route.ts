import { NextResponse } from "next/server";
import { ingestEmail } from "@/lib/ingest-email";

type TestPayload = {
  to: string;
  from: string;
  fromName?: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: TestPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.to || !body.from) {
    return NextResponse.json(
      { error: "Missing required fields: to, from" },
      { status: 400 }
    );
  }

  const result = await ingestEmail({
    to: body.to.toLowerCase(),
    from: body.from,
    fromName: body.fromName || "",
    subject: body.subject || "",
    textBody: body.textBody || "",
    htmlBody: body.htmlBody || "",
  });

  return NextResponse.json(result.body, { status: result.status });
}
