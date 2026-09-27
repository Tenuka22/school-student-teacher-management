import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@school-student-teacher-management/ui/components/alert-dialog";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@school-student-teacher-management/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@school-student-teacher-management/ui/components/select";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { IconBriefcase } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

interface TeacherPositionsProps {
  staffId: string;
  academicYearId: string;
  /**
   * The heading level for this section's title — see the same prop on
   * `TeacherQualifications`. `CardTitle` is a `div`, and this card is rendered at
   * two different depths, so the level is the caller's decision.
   */
  headingLevel?: 2 | 3;
}

const getScopeLabel = (scope: string) =>
  scope
    .replaceAll("_", " ")
    .replaceAll(/\b\w/gu, (character) => character.toUpperCase());

/**
 * The asterisk, and the word behind it.
 *
 * The scope is the one genuinely conditional requirement in this form, and it
 * only appears once "Sectional Head" is chosen. A bare `*` is a shape, not a
 * word, so the requirement is invisible to a screen-reader user; the glyph is
 * `aria-hidden` and the sentence beside it is what is announced.
 */
const RequiredMark = () => (
  <>
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
    <span className="sr-only"> (required)</span>
  </>
);

const SectionTitle = ({
  headingLevel,
  children,
}: {
  headingLevel: 2 | 3;
  children: React.ReactNode;
}) => {
  const className = "font-heading text-sm font-medium";
  if (headingLevel === 2) {
    return <h2 className={className}>{children}</h2>;
  }
  return <h3 className={className}>{children}</h3>;
};

/**
 * The three things this card holds, as three components.
 *
 * They were one 300-line `TeacherPositions`, and the linter's size rule was
 * right: a reader looking for "what happens when the assign is refused" had to
 * scroll past the list rendering, the empty state, the error panel and both
 * dialogs to find the one `catch` that answered it. Each piece is now a
 * component with its own props, and the card is the assembly.
 */

interface PositionOption {
  key: string;
  name: string;
  category: string;
}

interface PositionAssignment {
  id: string;
  position: string;
  sectionalScope: string | null;
}

const InlineError = ({ children }: { children: string }) => (
  <p
    role="alert"
    className="border-destructive/30 bg-destructive/5 text-destructive border px-3 py-2 text-xs"
  >
    {children}
  </p>
);

/**
 * The positions this teacher holds this year.
 *
 * A list, because it is one. Position rows separated by nothing read as one
 * paragraph, and the Remove buttons had no accessible relationship to the
 * position each one belonged to — hence the `sr-only` restatement of the label
 * inside each button's accessible name.
 */
const PositionList = ({
  assignments,
  getPositionName,
  onRemove,
  isRemovePending,
}: {
  assignments: PositionAssignment[];
  getPositionName: (key: string) => string;
  onRemove: (assignmentId: string, label: string) => void;
  isRemovePending: boolean;
}) => (
  <ul className="flex flex-col gap-3">
    {assignments.map((assignment) => {
      const label = [
        getPositionName(assignment.position),
        assignment.sectionalScope
          ? getScopeLabel(assignment.sectionalScope)
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return (
        <li
          key={assignment.id}
          className="flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="font-medium">{label}</p>
            <p className="text-muted-foreground">{assignment.position}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRemove(assignment.id, label)}
            disabled={isRemovePending}
          >
            Remove
            <span className="sr-only"> {label}</span>
          </Button>
        </li>
      );
    })}
  </ul>
);

/**
 * The assign form, and the refusal it can receive.
 *
 * The error line sits inside the form, between the fields and the button, and
 * the selection is never cleared by a refusal — so the reader's next action is
 * to change one field and press the button again, which is only possible if
 * everything they chose is still there.
 */
const PositionAssignForm = ({
  positions,
  sectionalScopes,
  selectedPosition,
  selectedScope,
  onSelectPosition,
  onSelectScope,
  onAssign,
  error,
  isAssignPending,
}: {
  positions: PositionOption[];
  sectionalScopes: string[];
  selectedPosition: string;
  selectedScope: string;
  onSelectPosition: (position: string | null) => void;
  onSelectScope: (scope: string | null) => void;
  onAssign: () => void;
  error: string | null;
  isAssignPending: boolean;
}) => {
  const selectedPositionData = positions.find(
    (position) => position.key === selectedPosition
  );
  const needsSectionalScope = selectedPosition === "sectionalHead";

  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="teacher-position">Position</FieldLabel>
          <Select value={selectedPosition} onValueChange={onSelectPosition}>
            <SelectTrigger id="teacher-position" className="w-full">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {positions.map((position) => (
                  <SelectItem key={position.key} value={position.key}>
                    {position.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {needsSectionalScope ? (
          <Field>
            <FieldLabel htmlFor="teacher-position-scope">
              Sectional scope <RequiredMark />
            </FieldLabel>
            <Select value={selectedScope} onValueChange={onSelectScope}>
              <SelectTrigger
                id="teacher-position-scope"
                className="w-full"
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby="teacher-position-scope-hint"
              >
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sectionalScopes.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {getScopeLabel(scope)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription id="teacher-position-scope-hint">
              Required for a sectional head assignment, and it is the scope the
              teacher will be accountable for.
            </FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onAssign}
          disabled={
            isAssignPending ||
            !selectedPositionData ||
            (needsSectionalScope && !selectedScope)
          }
          className="min-w-32"
        >
          {isAssignPending ? "Assigning…" : "Assign position"}
        </Button>
        {selectedPositionData ? (
          <Badge variant="outline">{selectedPositionData.category}</Badge>
        ) : null}
      </div>
    </>
  );
};

export const TeacherPositions = ({
  staffId,
  academicYearId,
  headingLevel = 2,
}: TeacherPositionsProps) => {
  const positionsQuery = useQuery(
    orpc.staff.listPositions.queryOptions({
      input: { academicYearId, staffId },
    })
  );
  const assignMutation = useMutation(
    orpc.staff.assignPosition.mutationOptions()
  );
  const removeMutation = useMutation(
    orpc.staff.removePosition.mutationOptions()
  );
  const [selectedPosition, setSelectedPosition] = useState("teacher");
  const [selectedScope, setSelectedScope] = useState("");
  const [removingAssignment, setRemovingAssignment] = useState<{
    id: string;
    label: string;
  } | null>(null);
  /**
   * The assign form's own error, beside the button that caused it.
   *
   * `assignPosition` refuses for reasons the form cannot pre-empt — the position
   * is already held by somebody else, or the sectional scope is one another
   * teacher already heads — and those refusals used to exist only as a toast
   * above a form that still looked ready to submit.
   */
  const [assignError, setAssignError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const positionData = positionsQuery.data;
  const positions = positionData?.positions ?? [];
  const sectionalScopes = positionData?.sectionalScopes ?? [];
  const assignments = positionData?.assignments ?? [];

  const getPositionName = (key: string) =>
    positions.find((position) => position.key === key)?.name ?? key;

  const handleAssign = async () => {
    setAssignError(null);
    try {
      await assignMutation.mutateAsync({
        staffId,
        academicYearId,
        position: selectedPosition,
        sectionalScope:
          selectedPosition === "sectionalHead"
            ? selectedScope || undefined
            : undefined,
      } as never);
      await positionsQuery.refetch();
      setSelectedScope("");
      toast.success("Position assigned");
    } catch (error) {
      setAssignError(formatApiErrorMessage(error, "Failed to assign position"));
    }
  };

  const handleRemove = async () => {
    if (!removingAssignment) {
      return;
    }

    setRemoveError(null);
    try {
      await removeMutation.mutateAsync({ id: removingAssignment.id } as never);
      await positionsQuery.refetch();
      setRemovingAssignment(null);
      toast.success("Position removed");
    } catch (error) {
      setRemoveError(formatApiErrorMessage(error, "Failed to remove position"));
    }
  };

  const { isLoading, isError } = positionsQuery;

  return (
    <>
      <Card size="sm">
        <CardHeader className="border-b">
          <SectionTitle headingLevel={headingLevel}>Positions</SectionTitle>
          <CardDescription>
            Position assignments apply only to the selected academic year.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4" aria-busy={isLoading}>
          {isLoading ? (
            <>
              <span className="sr-only">Loading positions…</span>
              <div aria-hidden="true" className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </>
          ) : null}

          {/*
            The state that was missing.

            `assignments` is `data?.assignments ?? []`, so a refused or failed
            read and a teacher who holds no position this year were the same empty
            array — and the card said "No positions assigned" about a year it had
            learned nothing about. A failed read now answers in its own words and
            offers a real retry.
          */}
          {isError ? (
            <QueryErrorPanel
              message={formatApiErrorMessage(
                positionsQuery.error,
                "The server did not return this year's positions."
              )}
              onRetry={() => {
                void positionsQuery.refetch();
              }}
              title="This year's positions could not be loaded"
            />
          ) : null}

          {!isLoading && !isError && assignments.length === 0 ? (
            <Empty className="min-h-28 border-none py-4">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBriefcase aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No positions assigned</EmptyTitle>
                <EmptyDescription>
                  Add a year-specific position below.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {assignments.length > 0 ? (
            <PositionList
              assignments={assignments}
              getPositionName={getPositionName}
              onRemove={(assignmentId, label) => {
                setRemoveError(null);
                setRemovingAssignment({ id: assignmentId, label });
              }}
              isRemovePending={removeMutation.isPending}
            />
          ) : null}

          {/*
            The assign form stays mounted while the list above is loading and
            after a failed read: the position catalogue is a separate fact from
            this teacher's assignments, and hiding the only way to add a position
            because a list failed would leave the card with no recovery at all.
            It simply cannot be submitted until the catalogue has arrived.
          */}
          <PositionAssignForm
            positions={positions}
            sectionalScopes={sectionalScopes}
            selectedPosition={selectedPosition}
            selectedScope={selectedScope}
            onSelectPosition={(value) => {
              setSelectedPosition(value ?? "teacher");
              setSelectedScope("");
              setAssignError(null);
            }}
            onSelectScope={(value) => {
              setSelectedScope(value ?? "");
              setAssignError(null);
            }}
            onAssign={handleAssign}
            error={assignError}
            isAssignPending={assignMutation.isPending}
          />
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(removingAssignment)}
        onOpenChange={(open) => {
          if (!open) {
            setRemovingAssignment(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remove position</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {removingAssignment?.label} from this academic year? The
            teacher&apos;s account role may be recalculated.
          </AlertDialogDescription>
          {removeError ? <InlineError>{removeError}</InlineError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
