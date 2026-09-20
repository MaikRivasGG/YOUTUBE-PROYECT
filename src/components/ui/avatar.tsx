import { avatarColor, cn, initials } from "@/lib/utils";

const SIZES = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-10 text-sm",
} as const;

export function Avatar({
  name,
  id,
  url,
  size = "md",
  className,
  title,
}: {
  name: string | null | undefined;
  id: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  title?: string;
}) {
  const label = title ?? name ?? "Miembro del equipo";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatares externos arbitrarios
      <img
        src={url}
        alt={label}
        title={label}
        className={cn("rounded-full object-cover ring-2 ring-white", SIZES[size], className)}
      />
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        avatarColor(id),
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
  size = "md",
}: {
  people: { id: string; full_name: string; avatar_url?: string | null }[];
  max?: number;
  size?: keyof typeof SIZES;
}) {
  const visible = people.slice(0, max);
  const rest = people.length - visible.length;

  return (
    <div className="flex -space-x-1.5">
      {visible.map((person) => (
        <Avatar
          key={person.id}
          id={person.id}
          name={person.full_name}
          url={person.avatar_url}
          size={size}
        />
      ))}
      {rest > 0 ? (
        <span
          className={cn(
            "bg-ink-500 inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
            SIZES[size],
          )}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
