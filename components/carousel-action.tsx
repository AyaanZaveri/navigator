import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CarouselAction({
    className,
    size = "sm",
    ...props
}: ComponentProps<typeof Button>) {
    return (
        <Button
            variant="outline"
            size={size}
            {...props}
            className={cn(
                "bg-background/90 dark:bg-background/70! backdrop-blur-md border-border text-foreground rounded-xl shadow-none hover:bg-accent",
                className,
            )}
        />
    );
}
