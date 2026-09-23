import { cn, initials } from "@/lib/utils";

const SIZES = {
  xs: { square: "size-4 rounded-[5px] text-[8px]", circle: "size-4 rounded-full text-[8px]" },
  sm: { square: "size-6 rounded-md text-[10px]", circle: "size-6 rounded-full text-[10px]" },
  md: { square: "size-9 rounded-lg text-[13px]", circle: "size-9 rounded-full text-[13px]" },
  lg: { square: "size-11 rounded-xl text-[15px]", circle: "size-11 rounded-full text-[15px]" },
} as const;

/** Logo del canal: su imagen si la tiene, o sus iniciales sobre su color. */
export function ChannelMark({
  name,
  color,
  imageUrl,
  size = "xs",
  shape = "square",
  className,
}: {
  name: string;
  color: string;
  imageUrl: string | null;
  size?: keyof typeof SIZES;
  shape?: "square" | "circle";
  className?: string;
}) {
  const sizing = SIZES[size][shape];

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagenes subidas por el equipo
      <img src={imageUrl} alt="" className={cn("shrink-0 object-cover", sizing, className)} loading="lazy" />
    );
  }

  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center font-bold text-white", sizing, className)}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </span>
  );
}
