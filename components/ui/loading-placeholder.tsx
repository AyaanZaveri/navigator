import { cn } from "@/lib/utils";
import styles from "./loading-placeholder.module.css";

// Reserve the final layout immediately, but don't flash placeholders on quick fetches.
export function LoadingPlaceholder({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn(styles.placeholder, className)}
      {...props}
    />
  );
}
