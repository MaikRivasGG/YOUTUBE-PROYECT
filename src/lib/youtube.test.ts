import { describe, expect, it } from "vitest";

import { extractYouTubeId, youtubeThumbnailUrl } from "@/lib/youtube";

describe("extractYouTubeId", () => {
  it("reconoce el formato watch?v=", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("reconoce youtu.be", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  });

  it("reconoce shorts y embed", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("devuelve null con texto que no es un link de YouTube", () => {
    expect(extractYouTubeId("")).toBeNull();
    expect(extractYouTubeId("no es una url")).toBeNull();
    expect(extractYouTubeId("https://vimeo.com/123456")).toBeNull();
  });
});

describe("youtubeThumbnailUrl", () => {
  it("construye la URL publica de miniatura", () => {
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});
