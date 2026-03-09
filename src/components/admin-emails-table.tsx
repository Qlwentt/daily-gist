"use client";

type EmailPair = {
  from_name: string | null;
  from_email: string;
  subject: string;
  count: number;
};

export function AdminEmailsTable({ emails }: { emails: EmailPair[] }) {
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
              Sender
            </th>
            <th
              className="text-left px-5 py-3 font-medium"
              style={{ color: "#8a7f96" }}
            >
              Subject
            </th>
            <th
              className="text-right px-5 py-3 font-medium"
              style={{ color: "#8a7f96" }}
            >
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email, i) => (
            <tr
              key={`${email.from_email}-${email.subject}-${i}`}
              style={{ borderBottom: "1px solid rgba(45, 27, 78, 0.04)" }}
            >
              <td className="px-5 py-3">
                <div className="font-medium" style={{ color: "#1a0e2e" }}>
                  {email.from_name || email.from_email}
                </div>
                {email.from_name && (
                  <div className="text-xs" style={{ color: "#8a7f96" }}>
                    {email.from_email}
                  </div>
                )}
              </td>
              <td className="px-5 py-3" style={{ color: "#5a4d6b" }}>
                {email.subject}
              </td>
              <td
                className="px-5 py-3 text-right"
                style={{ color: "#5a4d6b" }}
              >
                {email.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {emails.length === 0 && (
        <div className="px-5 py-8 text-center" style={{ color: "#8a7f96" }}>
          No emails received yet.
        </div>
      )}
    </div>
  );
}
