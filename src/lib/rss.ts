type EpisodeItem = {
  id: string;
  title: string;
  description: string;
  pubDate: string;
  audioUrl: string | null;
  audioSizeBytes: number | null;
  durationSeconds: number | null;
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function toRfc2822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

export function generateFeedXml(episodes: EpisodeItem[]): string {
  const items = episodes
    .map((ep) => {
      let enclosure = "";
      if (ep.audioUrl) {
        enclosure = `      <enclosure url="${escapeXml(ep.audioUrl)}" type="audio/mpeg" length="${ep.audioSizeBytes || 0}" />`;
      }

      let duration = "";
      if (ep.durationSeconds) {
        duration = `      <itunes:duration>${formatDuration(ep.durationSeconds)}</itunes:duration>`;
      }

      return `    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <pubDate>${toRfc2822(ep.pubDate)}</pubDate>
      <guid isPermaLink="false">${escapeXml(ep.id)}</guid>
${enclosure}
${duration}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Daily Gist</title>
    <description>Your newsletters, as a daily podcast</description>
    <link>${escapeXml(process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi")}</link>
    <language>en-us</language>
    <itunes:author>Daily Gist</itunes:author>
    <itunes:summary>Your newsletters, as a daily podcast</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="News" />
${items}
  </channel>
</rss>`;
}
