import { QUALIFICATION_LEVELS } from "@school-student-teacher-management/db/constants/teachers";
import { Badge } from "@school-student-teacher-management/ui/components/badge";
import { Button } from "@school-student-teacher-management/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  EmptyTitle,
} from "@school-student-teacher-management/ui/components/empty";
import {
  Field,
  FieldLabel,
} from "@school-student-teacher-management/ui/components/field";
import { Skeleton } from "@school-student-teacher-management/ui/components/skeleton";
import { Textarea } from "@school-student-teacher-management/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface TeacherQualificationsProps {
  staffId: string;
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

export const TeacherQualifications = ({
  staffId,
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

  const qualifications = qualificationsQuery.data ?? [];

  const openReview = (
    qualification: NonNullable<typeof qualificationsQuery.data>[number]
  ) => {
    setReviewingQualification(qualification);
    setReviewNote(qualification.reviewNote ?? "");
  };

  const submitReview = async (status: ReviewStatus) => {
    if (!reviewingQualification) {
      return;
    }

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
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to review qualification"
      );
    }
  };

  return (
    <>
      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>Qualifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {qualificationsQuery.isLoading &&
            Array.from({ length: 2 }, (_, index) => (
              <Skeleton
                key={`qualification-skeleton-${index}`}
                className="h-20 w-full"
              />
            ))}

          {!qualificationsQuery.isLoading && qualifications.length === 0 && (
            <Empty className="min-h-32 border-none py-5">
              <EmptyTitle>No qualifications recorded</EmptyTitle>
              <EmptyDescription>
                Qualification records uploaded by the teacher appear here.
              </EmptyDescription>
            </Empty>
          )}

          {qualifications.map((qualification) => (
            <Card key={qualification.id} size="sm">
              <CardHeader>
                <CardTitle>
                  {getQualificationLabel(qualification.qualification)}
                </CardTitle>
                <Badge
                  variant={getStatusVariant(qualification.documentStatus)}
                  className="mt-2 capitalize"
                >
                  {qualification.documentStatus}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground">Year</p>
                    <p>{qualification.yearObtained ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Institution</p>
                    <p className="truncate">
                      {qualification.institution ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Specialization</p>
                    <p>{qualification.subjectSpecialization ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Document</p>
                    <p>
                      {qualification.documentFileId
                        ? "Attached"
                        : "Not attached"}
                    </p>
                  </div>
                </div>
                {qualification.reviewNote && (
                  <div>
                    <p className="text-muted-foreground">Review note</p>
                    <p>{qualification.reviewNote}</p>
                  </div>
                )}
                {qualification.reviewedAt && (
                  <p className="text-muted-foreground">
                    Reviewed{" "}
                    {dateFormatter.format(new Date(qualification.reviewedAt))}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => openReview(qualification)}
                  disabled={reviewMutation.isPending}
                >
                  Review
                </Button>
              </CardContent>
            </Card>
          ))}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Qualification</DialogTitle>
            <DialogDescription>
              {reviewingQualification
                ? getQualificationLabel(reviewingQualification.qualification)
                : "Qualification review"}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="qualification-review-note">
              Review note
            </FieldLabel>
            <Textarea
              id="qualification-review-note"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Add context for the teacher"
              rows={4}
              disabled={reviewMutation.isPending}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitReview("rejected")}
              disabled={reviewMutation.isPending}
            >
              Reject
            </Button>
            <Button
              type="button"
              onClick={() => submitReview("approved")}
              disabled={reviewMutation.isPending}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
