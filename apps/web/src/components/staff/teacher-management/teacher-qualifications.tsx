import { qualificationDocumentStatusLabel } from "@school-student-teacher-management/db/constants/display";
import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@school-student-teacher-management/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@school-student-teacher-management/ui/components/dialog";
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
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { IconAward } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { QueryErrorPanel } from "@/components/query-error-panel";
import { formatApiErrorMessage } from "@/lib/api-error";
import { orpc } from "@/utils/orpc";

interface TeacherQualificationsProps {
  staffId: string;
  /**
   * The heading level for this section's title.
   *
   * `CardTitle` is a `div`, so a card is invisible in a document outline. This
   * section is rendered in two places at two depths — third-level inside the
   * profile dialog, whose own title is the second-level heading, and
   * second-level on the teacher portal's page, whose heading is the first-level
   * one — so the level has to be the caller's decision rather than a constant
   * that is right in one of them and a skipped level in the other.
   */
  headingLevel?: 2 | 3;
}

type ReviewStatus = "approved" | "rejected";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

const getQualificationLabel = (qualification: string) =>
  QUALIFICATION_LEVELS[qualification as keyof typeof QUALIFICATION_LEVELS]
    ?.label ?? qualification;

const getStatusVariant = (
  status: string
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "approved") {
    return "default";
  }
  if (status === "rejected") {
    return "destructive";
  }
  return "secondary";
};

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
 * The fields this row draws, and nothing else.
 *
 * `listQualifications` returns fifteen columns; a row component typed on the
 * whole row is a component whose signature changes every time the server grows a
 * column, and it is the shape that lets a renderer quietly start depending on
 * one. A narrow structural type keeps the row honest about what it reads.
 */
interface QualificationSummary {
  id: string;
  qualification: string;
  /** A year, so a number on the server — not a date string. */
  yearObtained: number | null;
  institution: string | null;
  subjectSpecialization: string | null;
  documentFileId: string | null;
  documentStatus: string;
  reviewNote: string | null;
  reviewedAt: string | null;
}

const QualificationRow = ({
  qualification,
  onReview,
  isReviewPending,
}: {
  qualification: QualificationSummary;
  onReview: () => void;
  isReviewPending: boolean;
}) => (
  /*
   * A bordered block, not a `Card`.
   *
   * This list lives inside a `Card`, so a `Card` per qualification was a card
   * inside a card: a second ground, a second ring and a second set of padding
   * wrapped around each row, and the visual hierarchy said "these are four
   * important panels" about what is one list. A rule above each row gives the
   * same separation with one elevation declared once.
   */
  <li className="border-primary/12 flex flex-col gap-3 border-t pt-3 first:border-t-0 first:pt-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">
        {getQualificationLabel(qualification.qualification)}
      </p>
      <Badge variant={getStatusVariant(qualification.documentStatus)}>
        {qualificationDocumentStatusLabel(qualification.documentStatus)}
      </Badge>
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <div>
        <dt className="text-muted-foreground">Year</dt>
        <dd className="tabular-nums">{qualification.yearObtained ?? "—"}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-muted-foreground">Institution</dt>
        <dd className="truncate">{qualification.institution ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Specialization</dt>
        <dd>{qualification.subjectSpecialization ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Document</dt>
        <dd>{qualification.documentFileId ? "Attached" : "Not attached"}</dd>
      </div>
    </dl>
    {qualification.reviewNote ? (
      <div>
        <p className="text-muted-foreground">Review note</p>
        <p>{qualification.reviewNote}</p>
      </div>
    ) : null}
    {qualification.reviewedAt ? (
      <p className="text-muted-foreground">
        Reviewed {dateFormatter.format(new Date(qualification.reviewedAt))}
      </p>
    ) : null}
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      onClick={onReview}
      disabled={isReviewPending}
    >
      Review
    </Button>
  </li>
);

export const TeacherQualifications = ({
  staffId,
  headingLevel = 2,
}: TeacherQualificationsProps) => {
  const qualificationsQuery = useQuery(
    orpc.staff.listQualifications.queryOptions({
      input: { staffId, status: undefined },
    })
  );
  const reviewMutation = useMutation(
    orpc.staff.approveQualification.mutationOptions()
  );
  const [reviewingQualification, setReviewingQualification] = useState<
    NonNullable<typeof qualificationsQuery.data>[number] | null
  >(null);
  const [reviewNote, setReviewNote] = useState("");
  /**
   * The review dialog's own error.
   *
   * A refused review used to be a toast over a still-open dialog, so the note
   * the reviewer had just written survived but the reason for the refusal did
   * not — and the reviewer had no way to tell a transient network failure from
   * a qualification they are not allowed to decide. The line is inside the
   * dialog, next to the buttons that caused it.
   */
  const [reviewError, setReviewError] = useState<string | null>(null);
  /**
   * Which of the two verbs is running.
   *
   * `reviewMutation.isPending` is one flag for both buttons, so labelling them
   * from it alone printed "Saving…" on Reject *and* Approve at once, and the
   * reader was left guessing which decision was being written. This is the verb
   * that was pressed, and only that button says so.
   */
  const [pendingStatus, setPendingStatus] = useState<ReviewStatus | null>(null);

  const qualifications = qualificationsQuery.data ?? [];

  const openReview = (
    qualification: NonNullable<typeof qualificationsQuery.data>[number]
  ) => {
    setReviewingQualification(qualification);
    setReviewNote(qualification.reviewNote ?? "");
    setReviewError(null);
  };

  const submitReview = async (status: ReviewStatus) => {
    if (!reviewingQualification) {
      return;
    }

    setReviewError(null);
    setPendingStatus(status);

    try {
      await reviewMutation.mutateAsync({
        id: reviewingQualification.id,
        status,
        reviewNote: reviewNote.trim() || undefined,
      } as never);
      await qualificationsQuery.refetch();
      setReviewingQualification(null);
      toast.success(`Qualification ${status}`);
    } catch (error) {
      /*
        The dialog stays open, with the note the reviewer wrote still in it, and
        the refusal is printed inside it. A toast alone left the note intact but
        the reason gone, so the reviewer's next move was a guess.
      */
      setReviewError(
        formatApiErrorMessage(error, "Failed to review qualification")
      );
    }

    setPendingStatus(null);
  };

  const { isLoading, isError } = qualificationsQuery;

  return (
    <>
      <Card size="sm">
        <CardHeader className="border-b">
          <SectionTitle headingLevel={headingLevel}>
            Qualifications
          </SectionTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3" aria-busy={isLoading}>
          {isLoading ? (
            <>
              <span className="sr-only">Loading qualifications…</span>
              <div aria-hidden="true" className="flex flex-col gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </>
          ) : null}

          {/*
            The state that was missing.

            `qualifications` is `data ?? []`, so a failed read and a teacher with
            no qualifications were the same `[]` and the list printed "No
            qualifications recorded" — a confident claim about this teacher's
            file, printed by a request that learned nothing. A failed read is now
            answered in its own words, with a retry that really re-requests.
          */}
          {isError ? (
            <QueryErrorPanel
              message={formatApiErrorMessage(
                qualificationsQuery.error,
                "The server did not return this teacher's qualifications."
              )}
              onRetry={() => {
                void qualificationsQuery.refetch();
              }}
              title="This teacher's qualifications could not be loaded"
            />
          ) : null}

          {!isLoading && !isError && qualifications.length === 0 ? (
            <Empty className="min-h-32 border-none py-5">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconAward aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No qualifications recorded</EmptyTitle>
                <EmptyDescription>
                  Qualification records uploaded by the teacher appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {!isError && qualifications.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {qualifications.map((qualification) => (
                <QualificationRow
                  key={qualification.id}
                  qualification={qualification}
                  isReviewPending={reviewMutation.isPending}
                  onReview={() => openReview(qualification)}
                />
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(reviewingQualification)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewingQualification(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review qualification</DialogTitle>
            <DialogDescription>
              {reviewingQualification
                ? getQualificationLabel(reviewingQualification.qualification)
                : "Qualification review"}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => event.preventDefault()}
            aria-busy={reviewMutation.isPending}
          >
            <Field>
              <FieldLabel htmlFor="qualification-review-note">
                Review note
              </FieldLabel>
              <Textarea
                id="qualification-review-note"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Add context for the decision"
                rows={4}
                disabled={reviewMutation.isPending}
                aria-describedby="qualification-review-note-hint"
              />
              <FieldDescription id="qualification-review-note-hint">
                Optional. Stored on the qualification record and shown with it.
              </FieldDescription>
            </Field>
          </form>
          {reviewError ? (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/5 text-destructive border px-3 py-2 text-xs"
            >
              {reviewError}
            </p>
          ) : null}
          <DialogFooter>
            {/*
              Both verbs are real reviews, so neither is styled as the dangerous
              one: "Reject" is a decision this screen exists to record, and a
              destructive tone on it teaches people to click around dialogs.
              Both keep a fixed width so the footer does not jump when one of
              them goes pending.
            */}
            <Button
              type="button"
              variant="outline"
              onClick={() => submitReview("rejected")}
              disabled={reviewMutation.isPending}
              className="min-w-28"
            >
              {pendingStatus === "rejected" ? "Rejecting…" : "Reject"}
            </Button>
            <Button
              type="button"
              onClick={() => submitReview("approved")}
              disabled={reviewMutation.isPending}
              className="min-w-28"
            >
              {pendingStatus === "approved" ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
