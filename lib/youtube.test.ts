import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeId, youtubeEmbedUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

test("reconoce los formatos habituales de enlace", () => {
  for (const u of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL1`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `  https://youtu.be/${ID}  `,
  ]) assert.equal(parseYouTubeId(u), ID, u);
});

test("rechaza lo que no es un video de YouTube seguro", () => {
  for (const u of [
    "", "no es url", `http://youtu.be/${ID}`, `https://vimeo.com/${ID}`,
    `https://evil.com/watch?v=${ID}`, `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://evil.com/youtu.be/${ID}`, `javascript:alert(1)`,
    "https://www.youtube.com/watch?v=corto", "https://www.youtube.com/watch?v=" + "a".repeat(12),
    `https://www.youtube.com/watch?v=${ID}"onload="x`, "https://www.youtube.com/", "https://www.youtube.com/channel/UC123",
  ]) assert.equal(parseYouTubeId(u), null, u);
});

test("el embed usa youtube-nocookie con el ID", () => {
  assert.match(youtubeEmbedUrl(ID), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
});
