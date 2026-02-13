"use client";

import { useState } from "react";

export function CopyButton({
  text,
  variant = "light",
}: {
  text: string;
  variant?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer"
      style={
        variant === "dark"
          ? {
              background: "rgba(250, 247, 242, 0.1)",
              color: "rgba(250, 247, 242, 0.8)",
            }
          : {
              background: "rgba(45, 27, 78, 0.06)",
              color: "#1a0e2e",
            }
      }
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
