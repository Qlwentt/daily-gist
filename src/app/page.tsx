import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Daily Gist</h1>
      <p className="text-xl text-gray-600 mb-8">
        Your newsletters, as a daily podcast
      </p>
      <Link
        href="/login"
        className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Get started
      </Link>
    </main>
  );
}
