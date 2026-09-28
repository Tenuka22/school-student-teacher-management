import type { staff } from "@school-student-teacher-management/db/schema/staff";
import { Button } from "@school-student-teacher-management/ui/components/button";
import { IconUsersPlus } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { NewTeacherNextStepsDialog } from "@/components/staff/teacher-management/new-teacher-next-steps-dialog";
import { PortTeachersDialog } from "@/components/staff/teacher-management/port-teachers-dialog";
import { TeacherCsvImport } from "@/components/staff/teacher-management/teacher-csv-import";
import { TeacherDialogs } from "@/components/staff/teacher-management/teacher-dialogs";
import { TeachersDataTable } from "@/components/staff/teacher-management/teachers-data-table";
import {
  toListTeachersInput,
  validateTeachersRouteSearch,
  validateTeachersSearch,
} from "@/components/staff/teacher-management/teachers-search";
import type {
  TeachersSearch,
  TeacherRow,
} from "@/components/staff/teacher-management/teachers-search";
import { useTeachersRegister } from "@/components/staff/teacher-management/use-teachers-register";
import { PageHeader } from "@/components/ui-patterns/page-header";
import { downloadExportFile } from "@/lib/download-export";
import { pageHead } from "@/lib/page-title";
import { orpc } from "@/utils/orpc";

type Staff = typeof staff.$inferSelect;
interface AcademicYear {
  id: string;
  year: number;
  isCurrent: boolean;
}

const RouteComponent = ({ search }: { search: TeachersSearch }) => {
  const navigate = useNavigate();
  /**
   * The whole establishment, uncapped, and **only** for the CSV import's
   * reconciliation: it has to decide create-or-update for every row in a file, which
   * is a question about the school rather than about a page of it. The register on
   * screen is the paged `listTeachers` query instead, so a large College no longer
   * downloads its entire establishment to draw the first twenty-five teachers.
   */
  const listQuery = useQuery(orpc.staff.listStaff.queryOptions());
  const {
    teachers,
    total,
    sorting,
    pagination,
    rowSelection,
    hasFilters,
    isLoadingRegister,
    isFetchingRegister,
    isErrorRegister,
    refetchRegister,
    invalidateRegister,
    onSortingChange,
    onPaginationChange,
    onRowSelectionChange,
    onSearchChange,
    onResetSearch,
  } = useTeachersRegister(search);
  const currentYearQuery = useQuery(
    orpc.staff.listAcademicYears.queryOptions()
  );
  const currentYear = useMemo(() => {
    const years = currentYearQuery.data as unknown[] | undefined;
    return (
      (years?.find(
        (y) => (y as Record<string, unknown>).isCurrent === true
      ) as AcademicYear) || undefined
    );
  }, [currentYearQuery.data]);
  const createMutation = useMutation(orpc.staff.createStaff.mutationOptions());
  const updateMutation = useMutation(orpc.staff.updateStaff.mutationOptions());
  const deleteMutation = useMutation(orpc.staff.deleteStaff.mutationOptions());
  const exportTeachersMutation = useMutation(
    orpc.staff.exports.teachersExcel.mutationOptions()
  );
  const exportProfileMutation = useMutation(
    orpc.staff.exports.teacherProfilePdf.mutationOptions()
  );

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPortDialogOpen, setIsPortDialogOpen] = useState(false);
  const [newTeacher, setNewTeacher] = useState<Staff | null>(null);
  const [newTeacherCredentials, setNewTeacherCredentials] = useState<{
    username: string | null;
    password: string | null;
  }>({ username: null, password: null });

  const [selectedTeacher, setSelectedTeacher] = useState<Staff | null>(null);

  const { year } = Route.useParams();

  /** The uncapped list, for the CSV import only. The register uses `teachers`. */
  const importTeachers = (listQuery.data as Staff[] | undefined) ?? [];

  const handleCreateClick = useCallback(() => {
    setSelectedTeacher(null);
    setIsCreateDialogOpen(true);
  }, []);

  const handleEditClick = useCallback((teacher: Staff) => {
    setSelectedTeacher(teacher);
    setIsEditDialogOpen(true);
  }, []);

  /**
   * Takes only what it uses, and that is deliberate rather than loose: the row the
   * register hands over is the *list* shape (ISO date strings) and the row the
   * "new teacher" dialog hands over is the *record* shape (`Date`), so a parameter
   * typed for either one of them would not accept the other. The id is the only
   * thing this needs, and it is the only thing both shapes are guaranteed to share.
   */
  const handleManageTimetableClick = useCallback(
    (teacher: { id: string }) => {
      navigate({
        to: "/admin/$year/staff/teacher-timetable/$staffId",
        params: { year, staffId: teacher.id },
      });
    },
    [navigate, year]
  );

  const handleViewClick = useCallback((teacher: Staff) => {
    setSelectedTeacher(teacher);
    setIsViewDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((teacher: Staff) => {
    setSelectedTeacher(teacher);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleCreateSubmit = useCallback(
    async (data: unknown) => {
      const created = (await createMutation.mutateAsync(
        data as never
      )) as unknown as Staff & {
        loginUsername?: string;
        initialPassword?: string;
      };
      await Promise.all([listQuery.refetch(), invalidateRegister()]);
      setIsCreateDialogOpen(false);
      setNewTeacher(created);
      setNewTeacherCredentials({
        username: created.loginUsername ?? null,
        password: created.initialPassword ?? null,
      });
    },
    [createMutation, invalidateRegister, listQuery]
  );

  const handleEditSubmit = useCallback(
    async (data: unknown) => {
      if (!selectedTeacher) {
        return;
      }

      const updateData = data as Record<string, unknown>;
      await updateMutation.mutateAsync({
        id: selectedTeacher.id,
        ...updateData,
      } as never);
      await Promise.all([listQuery.refetch(), invalidateRegister()]);
      setIsEditDialogOpen(false);
      setSelectedTeacher(null);
    },
    [selectedTeacher, updateMutation, listQuery, invalidateRegister]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedTeacher) {
      return;
    }

    try {
      await deleteMutation.mutateAsync({
        id: selectedTeacher.id,
      } as never);
      await Promise.all([listQuery.refetch(), invalidateRegister()]);
      setIsDeleteDialogOpen(false);
      setSelectedTeacher(null);
      toast.success("Teacher deleted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete teacher"
      );
    }
  }, [selectedTeacher, deleteMutation, listQuery, invalidateRegister]);

  const handleExportClick = useCallback(async () => {
    try {
      const file = await exportTeachersMutation.mutateAsync();
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export teachers"
      );
    }
  }, [exportTeachersMutation]);

  const handleExportProfileClick = useCallback(async () => {
    if (!selectedTeacher) {
      return;
    }
    try {
      const file = await exportProfileMutation.mutateAsync({
        id: selectedTeacher.id,
      } as never);
      downloadExportFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to export profile"
      );
    }
  }, [selectedTeacher, exportProfileMutation]);

  const handleImportCreate = useCallback(
    async (data: Record<string, unknown>) => {
      await createMutation.mutateAsync(data as never);
      // The uncapped list for the import's own reconciliation, and the register on
      // screen — an imported teacher belongs on it too.
      await Promise.all([listQuery.refetch(), invalidateRegister()]);
    },
    [createMutation, listQuery, invalidateRegister]
  );

  const handleImportUpdate = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await updateMutation.mutateAsync({ id, ...data } as never);
      await Promise.all([listQuery.refetch(), invalidateRegister()]);
    },
    [updateMutation, listQuery, invalidateRegister]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Staff management"
        title="Teachers"
        description={
          <>Manage teacher records, qualifications, and assignments</>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setIsPortDialogOpen(true)}>
              <IconUsersPlus className="mr-2 size-4" />
              Import from previous year
            </Button>
            <TeacherCsvImport
              teachers={importTeachers}
              onCreate={handleImportCreate}
              onUpdate={handleImportUpdate}
            />
          </>
        }
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={handleExportClick}>
          Export to Excel
        </Button>
        <Button onClick={handleCreateClick}>Add teacher</Button>
      </div>

      <TeachersDataTable
        hasFilters={hasFilters}
        isError={isErrorRegister}
        isFetching={isFetchingRegister}
        isLoading={isLoadingRegister}
        onCreateClick={handleCreateClick}
        onDeleteClick={(teacher) => handleDeleteClick(toStaffRecord(teacher))}
        onEditClick={(teacher) => handleEditClick(toStaffRecord(teacher))}
        onManageTimetableClick={handleManageTimetableClick}
        onPaginationChange={onPaginationChange}
        onResetSearch={onResetSearch}
        onRetry={() => {
          void refetchRegister();
        }}
        onRowSelectionChange={onRowSelectionChange}
        onSearchChange={onSearchChange}
        onSortingChange={onSortingChange}
        onViewClick={(teacher) => handleViewClick(toStaffRecord(teacher))}
        pagination={pagination}
        rowSelection={rowSelection}
        search={search.q}
        sorting={sorting}
        teachers={teachers}
        total={total}
      />

      <TeachersDialogs
        currentYearId={currentYear?.id}
        dialogs={{
          isCreateOpen: isCreateDialogOpen,
          onCreateOpenChange: setIsCreateDialogOpen,
          isCreatePending: createMutation.isPending,
          onCreateSubmit: handleCreateSubmit,
          isEditOpen: isEditDialogOpen,
          onEditOpenChange: setIsEditDialogOpen,
          isEditPending: updateMutation.isPending,
          onEditSubmit: handleEditSubmit,
          isViewOpen: isViewDialogOpen,
          onViewOpenChange: setIsViewDialogOpen,
          isDeleteOpen: isDeleteDialogOpen,
          onDeleteOpenChange: setIsDeleteDialogOpen,
          isDeletePending: deleteMutation.isPending,
          onConfirmDelete: handleConfirmDelete,
          isPortOpen: isPortDialogOpen,
          onPortOpenChange: setIsPortDialogOpen,
          isExportProfilePending: exportProfileMutation.isPending,
          onExportProfileClick: handleExportProfileClick,
          selectedTeacher,
        }}
        newTeacher={newTeacher}
        onNewTeacherDismiss={() => {
          setNewTeacher(null);
          setNewTeacherCredentials({ username: null, password: null });
        }}
        credentials={newTeacherCredentials}
        onManageTimetableClick={handleManageTimetableClick}
      />
    </div>
  );
};

/**
 * Every dialog this page can open, in one place.
 *
 * **The reason they are here and not inline** is that the register's own component
 * was over the size where a reader can hold it: eight mutations, two queries, six
 * pieces of dialog state and three dialogs in one render function is a maze, and
 * the mutation bundle around the register is what pushes it over. The dialogs are
 * the easiest seam because they are pure markup with no logic of their own — moving
 * them out is a move, not a redesign.
 *
 * The state stays in the parent, which is the point: a dialog that owned its own
 * "open" flag would have to be told to close from outside anyway.
 */
interface TeachersDialogsProps {
  currentYearId: string | undefined;
  newTeacher: Staff | null;
  credentials: { username: string | null; password: string | null };
  dialogs: {
    selectedTeacher: Staff | null;
    isCreateOpen: boolean;
    onCreateOpenChange: (open: boolean) => void;
    isCreatePending: boolean;
    onCreateSubmit: (data: unknown) => Promise<void>;
    isEditOpen: boolean;
    onEditOpenChange: (open: boolean) => void;
    isEditPending: boolean;
    onEditSubmit: (data: unknown) => Promise<void>;
    isViewOpen: boolean;
    onViewOpenChange: (open: boolean) => void;
    isDeleteOpen: boolean;
    onDeleteOpenChange: (open: boolean) => void;
    isDeletePending: boolean;
    onConfirmDelete: () => void;
    isPortOpen: boolean;
    onPortOpenChange: (open: boolean) => void;
    isExportProfilePending: boolean;
    onExportProfileClick: () => void;
  };
  onNewTeacherDismiss: () => void;
  onManageTimetableClick: (teacher: { id: string }) => void;
}

const TeachersDialogs = ({
  currentYearId,
  newTeacher,
  credentials,
  dialogs,
  onNewTeacherDismiss,
  onManageTimetableClick,
}: TeachersDialogsProps) => (
  <>
    <TeacherDialogs {...dialogs} />
    <PortTeachersDialog
      academicYearId={currentYearId}
      isOpen={dialogs.isPortOpen}
      onOpenChange={(open) => dialogs.onPortOpenChange(open)}
    />
    <NewTeacherNextStepsDialog
      initialPassword={credentials.password}
      loginUsername={credentials.username}
      teacher={newTeacher}
      onManageTimetableClick={(teacher) => {
        onNewTeacherDismiss();
        onManageTimetableClick(teacher);
      }}
      onOpenChange={(open) => {
        if (!open) {
          onNewTeacherDismiss();
        }
      }}
    />
  </>
);

/**
 * The teachers register, and the five query parameters that describe it.
 *
 * The row the table hands back is `listTeachers`' shape, not the `staff` row: the
 * list sends `createdAt` and `updatedAt` as ISO strings, because they crossed a
 * wire. The dialogs below were written against `typeof staff.$inferSelect`, which
 * has them as `Date`, so the two are bridged here rather than by a cast — the
 * conversion is a *fact* (a string that came from a date is a date again), and the
 * function that says so is the one place it is allowed to happen.
 */
const toStaffRecord = (teacher: TeacherRow): Staff => ({
  ...teacher,
  createdAt: new Date(teacher.createdAt),
  updatedAt: new Date(teacher.updatedAt),
});

/**
 * The validated params, read from the route rather than from `useSearch` in a child:
 * the page must not import this file, so the value is handed down.
 */
const TeachersRoute = () => (
  <RouteComponent search={validateTeachersSearch(Route.useSearch())} />
);

/**
 * The teaching establishment, and the five query parameters that describe it.
 *
 * `?q=&sort=&dir=&page=&size=` are validated by `validateTeachersRouteSearch`:
 * `validateTeachersSearch` — the same function the page's hook writes through —
 * and then a strip of everything already at its default.
 *
 * **Clamp first, omit second, and the order is the fix.** A route's `validateSearch`
 * return value is what the router serialises into the address bar, so a validator
 * that returns the *filled* object puts the defaults on the URL: the register used
 * to open at `?sort=createdAt&dir=asc&page=1&size=25`, five params of which not one
 * narrowed anything, because the omission ran *before* validation and was
 * therefore thrown away by it. Both the page and the `loader` re-run the full
 * parser, so a bare path and a hand-typed URL cannot ask the server for two
 * different things.
 *
 * The loader is why the first paint is the answer rather than a spinner:
 * `ensureQueryData` runs the paged query **on the server**, before the HTML is sent,
 * into the same cache the page's `useQuery` reads. A refresh, a shared link and the
 * Back button all arrive with the right page of the right search already in them.
 *
 * `loaderDeps` is the search object, so the loader re-runs when the params change
 * and does *not* re-run when they do not.
 */
export const Route = createFileRoute("/_auth/admin/$year/staff/teachers")({
  component: TeachersRoute,
  validateSearch: validateTeachersRouteSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    // The whole establishment as well as the page of it: `listStaff` is the CSV
    // import's reconciliation input, which has to know every teacher to decide
    // create-or-update for a file's rows. It is a separate read on purpose, and
    // capping it would silently break that dialog.
    // Both reads at once: the whole establishment and the page of it are
    // independent questions, and awaiting them in sequence is a waterfall on
    // every navigation to this page.
    await Promise.all([
      context.queryClient.ensureQueryData(orpc.staff.listStaff.queryOptions()),
      context.queryClient.ensureQueryData(
        orpc.staff.listTeachers.queryOptions({
          input: toListTeachersInput(validateTeachersSearch(deps)),
        })
      ),
    ]);
  },
  head: () => pageHead("Teachers"),
});
