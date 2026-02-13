"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export function SaveButton() {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setSaved(false);
    } else if (wasPending.current) {
      wasPending.current = false;
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [pending]);

  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl min-w-[5rem] text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
      style={
        saved
          ? {
              background: "rgba(74, 157, 107, 0.1)",
              color: "#4a9d6b",
            }
          : {
              background: "#6b4c9a",
              color: "#faf7f2",
            }
      }
    >
      {pending ? "Saving..." : saved ? "Saved \u2713" : "Save"}
    </button>
  );
}
