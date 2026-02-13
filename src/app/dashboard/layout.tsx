import Link from "next/link";
import { Instrument_Serif, DM_Sans } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${instrumentSerif.variable} ${dmSans.variable} min-h-screen`}
      style={{
        background: "#faf7f2",
        color: "#1a0e2e",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      }}
    >
      <nav
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{
          background: "rgba(250, 247, 242, 0.85)",
          borderBottom: "1px solid rgba(45, 27, 78, 0.06)",
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link
                href="/dashboard"
                className="text-xl font-normal"
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  letterSpacing: "-0.02em",
                  color: "#1a0e2e",
                }}
              >
                Daily Gist
              </Link>
              <div className="flex space-x-4">
                <Link
                  href="/dashboard"
                  className="text-sm font-medium transition-colors hover:opacity-70"
                  style={{ color: "#5a4d6b" }}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="text-sm font-medium transition-colors hover:opacity-70"
                  style={{ color: "#5a4d6b" }}
                >
                  Settings
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <form action="/auth/signout" method="POST">
                <button
                  type="submit"
                  className="text-sm px-3 py-1.5 rounded-lg transition-colors cursor-pointer hover:bg-red-50 hover:text-red-600"
                  style={{ color: "#8a7f96" }}
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
