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
          className="flex items-start justify-between gap-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3"
        >
          <p className="text-sm whitespace-pre-line">{linkify(notification.message, () => dismiss(notification.id))}</p>
          <button
            onClick={() => dismiss(notification.id)}
            className="flex-shrink-0 text-yellow-600 hover:text-yellow-800 text-lg leading-none"
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
