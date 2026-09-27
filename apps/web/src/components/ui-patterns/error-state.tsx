import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

interface ErrorStateProps {
  title?: string;
  /** The error itself; its message is shown when it has one. */
  error?: unknown;
  /** Re-runs the failed query (e.g. `query.refetch`). Omit when a retry can't help. */
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

const messageOf = (error: unknown): string | undefined =>
  error instanceof Error && error.message ? error.message : undefined;

/**
 * The failed-to-load counterpart of `Empty` and `Skeleton` (both from the UI
 * package). Only offers "Try again" when the caller passes a retry, since
 * a retry that does nothing would be one more dead button.
 */
export const ErrorState = ({
  title = "This could not be loaded",
  error,
  onRetry,
  isRetrying = false,
  className,
}: ErrorStateProps) => (
  <Empty role="alert" className={className}>
    <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
      <IconAlertTriangle aria-hidden="true" />
    </EmptyMedia>
    <EmptyTitle>{title}</EmptyTitle>
    <EmptyDescription>
      {messageOf(error) ??
        "Check your connection and try again. If it keeps happening, contact the system administrator."}
    </EmptyDescription>
    {onRetry ? (
      <EmptyContent>
        <Button variant="outline" onClick={onRetry} disabled={isRetrying}>
          <IconRefresh
            aria-hidden="true"
            className={isRetrying ? "animate-spin" : undefined}
          />
          {isRetrying ? "Trying again…" : "Try again"}
        </Button>
      </EmptyContent>
    ) : null}
  </Empty>
);
