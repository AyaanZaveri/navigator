// Sign-in presentation copied from Portalhop; kept local to the account dialog.
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[12px] border border-[var(--text-input-border)] bg-[var(--text-input-fill)] backdrop-blur-[12px] px-3 py-1 text-base leading-[1.4] tracking-normal text-foreground md:text-sm transition-[color,background-color,border-color,opacity,box-shadow] duration-200 ease-in-out motion-reduce:transition-none outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/22 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 focus-visible:aria-invalid:border-destructive focus-visible:aria-invalid:ring-destructive/20 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:focus-visible:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
