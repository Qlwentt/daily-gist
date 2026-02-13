"use client";

import { useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: string;
  message: string;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function linkify(text: string, onLinkClick?: () => void): ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all"
        onClick={onLinkClick}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export function NotificationBanners({
  notifications,
}: {
  notifications: Notification[];
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(notifications.map((n) => [n.id, true]))
  );

  const dismiss = async (id: string) => {
    setVisible((prev) => ({ ...prev, [id]: false }));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const visibleNotifications = notifications.filter((n) => visible[n.id]);
  if (visibleNotifications.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className="flex items-start justify-between gap-4 rounded-xl px-4 py-3"
          style={{
            background: "rgba(232, 164, 74, 0.08)",
            border: "1px solid rgba(232, 164, 74, 0.15)",
            color: "#1a0e2e",
          }}
        >
          <p className="text-sm whitespace-pre-line">{linkify(notification.message, () => dismiss(notification.id))}</p>
          <button
            onClick={() => dismiss(notification.id)}
            className="flex-shrink-0 text-lg leading-none transition-colors cursor-pointer"
            style={{ color: "#e8a44a" }}
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
