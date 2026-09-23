import { cn, initials } from "@/lib/utils";

const SIZES = {
  xs: "size-4 rounded-[5px] text-[8px]",
  sm: "size-6 rounded-md text-[10px]",
  md: "size-9 rounded-lg text-[13px]",
} as const;

/** Logo del canal: su imagen si la tiene, o sus iniciales sobre su color. */
export function ChannelMark({
  name,
  color,
  imageUrl,
  size = "xs",
  className,
}: {
  name: string;
  color: string;
  imageUrl: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagenes subidas por el equipo
      <img
        src={imageUrl}
        alt=""
        className={cn("shrink-0 object-cover", SIZES[size], className)}
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-bold text-white",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}
