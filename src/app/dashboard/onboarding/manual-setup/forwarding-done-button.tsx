"use client";

export function ForwardingDoneButton() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/onboarding/forwarding-complete", { method: "POST" });
        window.location.href = "/dashboard";
      }}
      className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
      style={{ background: "#6b4c9a", color: "#faf7f2" }}
    >
      Done
    </button>
  );
}
