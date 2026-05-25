import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-canvas-soft animate-pulse rounded-app-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
