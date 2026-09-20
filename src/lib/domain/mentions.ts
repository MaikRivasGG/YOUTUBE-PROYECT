/**
 * Menciones con @ en los comentarios.
 *
 * Se escribe `@Nombre Apellido` y al enviar se resuelve contra los miembros
 * del equipo. El texto se guarda tal cual y aparte viaja la lista de ids: asi
 * el comentario sigue leyendose bien aunque alguien cambie de nombre despues,
 * y el aviso no depende de volver a interpretar el texto.
 *
 * La base descarta de la lista a quien no sea del equipo, asi que esto es solo
 * comodidad de escritura, nunca una via para avisar a un tercero.
 */

export interface Mentionable {
  id: string;
  full_name: string;
}

/** Caracter por caracter, lo que se considera parte de un nombre tras la @. */
const NAME_CHAR = /[\p{L}\p{N}_. ]/u;

/**
 * Trozo de texto que el cursor esta escribiendo detras de una @.
 *
 * Devuelve null si el cursor no esta en una mencion: no hay @ antes, hay un
 * espacio doble de por medio o la @ va pegada a otra palabra (un email).
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;

  // Una @ pegada a texto por la izquierda es parte de otra cosa (un email).
  const before = at > 0 ? upto[at - 1] : " ";
  if (!/[\s(]/.test(before)) return null;

  const query = upto.slice(at + 1);
  if (query.includes("\n")) return null;
  // Se admite un espacio (nombre y apellido), no dos: ahi ya es prosa.
  if (/\s\s/.test(query) || query.split(" ").length > 2) return null;
  if (query.length > 0 && ![...query].every((char) => NAME_CHAR.test(char))) return null;

  return { query, start: at };
}

/** Miembros que encajan con lo escrito tras la @, por orden de cercania. */
export function matchMentions<T extends Mentionable>(members: T[], query: string, limit = 6): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return members.slice(0, limit);

  const starts: T[] = [];
  const contains: T[] = [];

  for (const member of members) {
    const name = member.full_name.toLowerCase();
    if (name.startsWith(needle)) starts.push(member);
    else if (name.includes(needle)) contains.push(member);
  }

  return [...starts, ...contains].slice(0, limit);
}

/** Sustituye la mencion a medio escribir por el nombre completo del miembro. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  member: Mentionable,
): { text: string; caret: number } {
  const inserted = `@${member.full_name} `;
  const next = text.slice(0, start) + inserted + text.slice(caret);
  return { text: next, caret: start + inserted.length };
}

/**
 * Ids de los miembros nombrados en el texto.
 *
 * Se comparan los nombres mas largos primero para que "@Ana Cortes" no se
 * resuelva como "@Ana" cuando existan las dos.
 */
export function resolveMentions<T extends Mentionable>(text: string, members: T[]): string[] {
  const lower = text.toLowerCase();
  const byLength = [...members].sort((a, b) => b.full_name.length - a.full_name.length);
  const found = new Set<string>();

  for (const member of byLength) {
    if (lower.includes(`@${member.full_name.toLowerCase()}`)) found.add(member.id);
  }

  return [...found];
}

export type CommentChunk =
  { type: "text"; value: string } | { type: "mention"; value: string; userId: string };

/** Parte un comentario en texto y menciones, para pintarlas distinto. */
export function splitMentions<T extends Mentionable>(
  body: string,
  mentionIds: string[],
  members: T[],
): CommentChunk[] {
  const named = members
    .filter((member) => mentionIds.includes(member.id))
    .sort((a, b) => b.full_name.length - a.full_name.length);

  if (named.length === 0) return [{ type: "text", value: body }];

  const chunks: CommentChunk[] = [];
  let rest = body;

  while (rest.length > 0) {
    let hit: { index: number; member: T } | null = null;

    for (const member of named) {
      const index = rest.toLowerCase().indexOf(`@${member.full_name.toLowerCase()}`);
      if (index !== -1 && (hit === null || index < hit.index)) hit = { index, member };
    }

    if (!hit) {
      chunks.push({ type: "text", value: rest });
      break;
    }

    if (hit.index > 0) chunks.push({ type: "text", value: rest.slice(0, hit.index) });

    const length = hit.member.full_name.length + 1;
    chunks.push({
      type: "mention",
      value: rest.slice(hit.index, hit.index + length),
      userId: hit.member.id,
    });
    rest = rest.slice(hit.index + length);
  }

  return chunks;
}
