"use client";

import { useState, useEffect, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function linkify(text: string): ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export function GmailConfirmation() {
  const [confirmationBody, setConfirmationBody] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const poll = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, message")
        .eq("type", "gmail_forwarding_confirmation")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setConfirmationBody(data[0].message);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [supabase]);

  if (confirmationBody) {
    return (
      <div>
        <p
          className="text-sm font-medium mb-3"
          style={{ color: "#1a0e2e" }}
        >
          Gmail sent a confirmation email. Click the link below to verify:
        </p>
        <div
          className="rounded-xl p-4 text-sm whitespace-pre-line break-words"
          style={{
            background: "rgba(232, 164, 74, 0.06)",
            border: "1px solid rgba(232, 164, 74, 0.15)",
            color: "#1a0e2e",
          }}
        >
          {linkify(confirmationBody)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "rgba(45, 27, 78, 0.03)" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-5 h-5 border-2 rounded-full animate-spin flex-shrink-0"
          style={{
            borderColor: "rgba(107, 76, 154, 0.2)",
            borderTopColor: "#6b4c9a",
          }}
        />
        <div>
          <p className="text-sm" style={{ color: "#5a4d6b" }}>
            Waiting for Gmail&apos;s confirmation email...
          </p>
          <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
            After adding the forwarding address above, the confirmation will
            appear here automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
