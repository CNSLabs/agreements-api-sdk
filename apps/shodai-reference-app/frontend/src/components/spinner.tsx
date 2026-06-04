import * as React from "react"
import { cn } from "@/utils/cn"
import type { VariantProps } from "class-variance-authority"
import { spinnerVariants } from "./spinnerVariants"

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  spin?: boolean
}

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size, spin = true, ...props }, ref) => {
    if (!spin) return null

    return (
      <div
        ref={ref}
        className={cn(spinnerVariants({ size }), className)}
        {...props}
      />
    )
  }
)
Spinner.displayName = "Spinner"

export { Spinner }
