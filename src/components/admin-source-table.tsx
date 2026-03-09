"use client";

type Source = {
  id: string;
  sender_email: string;
  sender_name: string | null;
  email_count: number;
};

export function AdminSourceTable({ sources }: { sources: Source[] }) {
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(45, 27, 78, 0.08)" }}>
            <th
              className="text-left px-5 py-3 font-medium"
              style={{ color: "#8a7f96" }}
            >
              Source
            </th>
            <th
              className="text-left px-5 py-3 font-medium"
              style={{ color: "#8a7f96" }}
            >
              Unprocessed
            </th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr
              key={source.id}
              style={{ borderBottom: "1px solid rgba(45, 27, 78, 0.04)" }}
            >
              <td className="px-5 py-3">
                <div className="font-medium" style={{ color: "#1a0e2e" }}>
                  {source.sender_name || source.sender_email}
                </div>
                {source.sender_name && (
                  <div className="text-xs" style={{ color: "#8a7f96" }}>
                    {source.sender_email}
                  </div>
                )}
              </td>
              <td className="px-5 py-3" style={{ color: "#5a4d6b" }}>
                {source.email_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sources.length === 0 && (
        <div className="px-5 py-8 text-center" style={{ color: "#8a7f96" }}>
          No newsletter sources found for the system user.
        </div>
      )}
    </div>
  );
}
