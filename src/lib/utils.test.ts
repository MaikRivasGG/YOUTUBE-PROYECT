import { describe, expect, it } from "vitest";

import { avatarColor, initials, isSafeHttpUrl, slugify } from "@/lib/utils";

describe("isSafeHttpUrl", () => {
  it("acepta http y https", () => {
    expect(isSafeHttpUrl("https://youtu.be/abc")).toBe(true);
    expect(isSafeHttpUrl("http://localhost:3000/x")).toBe(true);
  });

  it("rechaza esquemas peligrosos", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("rechaza texto que no es una URL", () => {
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("youtube.com/@canal")).toBe(false);
  });
});

describe("initials", () => {
  it("toma como mucho dos iniciales", () => {
    expect(initials("Clara Martin Ruiz")).toBe("CM");
    expect(initials("Ana")).toBe("A");
  });

  it("cae al valor por defecto sin nombre", () => {
    expect(initials("", "EQ")).toBe("EQ");
    expect(initials(null)).toBe("?");
  });
});

describe("avatarColor", () => {
  it("es estable para el mismo usuario", () => {
    expect(avatarColor("usuario-1")).toBe(avatarColor("usuario-1"));
  });
});

describe("slugify", () => {
  it("quita acentos y normaliza", () => {
    expect(slugify("Producción Diaria")).toBe("produccion-diaria");
    expect(slugify("  Mi Equipo!!  ")).toBe("mi-equipo");
  });
});
