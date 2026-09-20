import { describe, expect, it } from "vitest";

import {
  insertMention,
  matchMentions,
  mentionQueryAt,
  resolveMentions,
  splitMentions,
} from "@/lib/domain/mentions";

const members = [
  { id: "ana", full_name: "Ana Cortes" },
  { id: "ana2", full_name: "Ana" },
  { id: "bruno", full_name: "Bruno Diaz" },
  { id: "carla", full_name: "Carla Ruiz" },
];

describe("mentionQueryAt", () => {
  it("detecta la mencion que se esta escribiendo", () => {
    const text = "Ojo @Bru";
    expect(mentionQueryAt(text, text.length)).toEqual({ query: "Bru", start: 4 });
  });

  it("admite nombre y apellido", () => {
    const text = "Hola @Ana Cor";
    expect(mentionQueryAt(text, text.length)?.query).toBe("Ana Cor");
  });

  it("no confunde un email con una mencion", () => {
    const text = "escribe a ana@estudio.com";
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });

  it("se corta cuando ya es prosa", () => {
    const text = "@Ana Cortes revisa esto";
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });

  it("devuelve null si no hay @", () => {
    expect(mentionQueryAt("sin menciones", 13)).toBeNull();
  });

  it("usa la posicion del cursor, no el final del texto", () => {
    const text = "@Bru y luego mas cosas";
    expect(mentionQueryAt(text, 4)).toEqual({ query: "Bru", start: 0 });
  });
});

describe("matchMentions", () => {
  it("pone delante a quien empieza por lo escrito", () => {
    const result = matchMentions(members, "a");
    expect(result[0].full_name).toBe("Ana Cortes");
  });

  it("tambien encuentra por el apellido", () => {
    expect(matchMentions(members, "ruiz").map((m) => m.id)).toEqual(["carla"]);
  });

  it("sin texto devuelve los primeros", () => {
    expect(matchMentions(members, "", 2)).toHaveLength(2);
  });
});

describe("insertMention", () => {
  it("sustituye lo escrito por el nombre completo", () => {
    const text = "Ojo @Bru";
    const result = insertMention(text, 4, text.length, members[2]);
    expect(result.text).toBe("Ojo @Bruno Diaz ");
    expect(result.caret).toBe(result.text.length);
  });

  it("conserva lo que venia despues del cursor", () => {
    const result = insertMention("Ojo @Bru mira esto", 4, 8, members[2]);
    expect(result.text).toBe("Ojo @Bruno Diaz  mira esto");
  });
});

describe("resolveMentions", () => {
  it("prefiere el nombre mas largo cuando uno contiene al otro", () => {
    expect(resolveMentions("@Ana Cortes revisa", members)).toContain("ana");
  });

  it("no repite a la misma persona", () => {
    expect(resolveMentions("@Bruno Diaz y otra vez @Bruno Diaz", members)).toEqual(["bruno"]);
  });

  it("devuelve vacio cuando no hay nadie nombrado", () => {
    expect(resolveMentions("sin menciones", members)).toEqual([]);
  });
});

describe("splitMentions", () => {
  it("separa texto y menciones", () => {
    const chunks = splitMentions("Ojo @Bruno Diaz con el audio", ["bruno"], members);
    expect(chunks).toEqual([
      { type: "text", value: "Ojo " },
      { type: "mention", value: "@Bruno Diaz", userId: "bruno" },
      { type: "text", value: " con el audio" },
    ]);
  });

  it("deja el cuerpo intacto si no hay menciones", () => {
    expect(splitMentions("texto plano", [], members)).toEqual([
      { type: "text", value: "texto plano" },
    ]);
  });

  it("no marca a quien no venga en la lista de ids", () => {
    const chunks = splitMentions("@Carla Ruiz mira", [], members);
    expect(chunks).toEqual([{ type: "text", value: "@Carla Ruiz mira" }]);
  });
});
