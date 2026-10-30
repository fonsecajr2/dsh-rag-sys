import type { TranscriptSegment } from "@/types";

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Accepts "12:34" or "1:02:03" and returns seconds
export function parseTimestamp(value: string): number {
  const parts = value.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export interface VideoChunk {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Groups segments into chunks of roughly `windowSeconds`,
 * repeating the last `overlapSeconds` of one chunk at the start of the next.
 */
export function chunkSegments(
  segments: TranscriptSegment[],
  windowSeconds = 75,
  overlapSeconds = 10
): VideoChunk[] {
  const sorted = [...segments]
    .filter((s) => s.text.trim().length > 0)
    .sort((a, b) => a.start - b.start);

  const chunks: VideoChunk[] = [];
  let i = 0;

  while (i < sorted.length) {
    const startSeconds = sorted[i].start;
    const parts: string[] = [];
    let endSeconds = sorted[i].end;
    let j = i;

    while (j < sorted.length && sorted[j].start - startSeconds < windowSeconds) {
      parts.push(sorted[j].text.trim());
      endSeconds = sorted[j].end;
      j++;
    }

    chunks.push({ text: parts.join(" "), startSeconds, endSeconds });
    if (j >= sorted.length) break;

    // Step back so the next chunk overlaps this one
    let next = j;
    while (next > i + 1 && sorted[next - 1].start >= endSeconds - overlapSeconds) {
      next--;
    }
    i = next;
  }

  return chunks;
}

export function parseSubtitles(content: string): TranscriptSegment[] {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\n+/);
  const segments: TranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) continue;

    const [startRaw, endRaw] = lines[timeIdx]
      .split('-->')
      .map((s) => s.trim().split(/\s+/)[0].replace(',', '.'));

    const text = lines
      .slice(timeIdx + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '') // strip tags like <c> or <i>
      .trim();

    if (!text) continue;
    segments.push({
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw),
      text,
    });
  }
  return segments;
}