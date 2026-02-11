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
      className={`px-4 py-2 rounded-md min-w-[5rem] text-sm font-medium ${
        saved
          ? "bg-green-100 text-green-700"
          : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      }`}
    >
      {pending ? "Saving..." : saved ? "Saved \u2713" : "Save"}
    </button>
  );
}
