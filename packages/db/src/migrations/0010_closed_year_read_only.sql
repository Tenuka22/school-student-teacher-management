-- ─────────────────────────────────────────────────────────────────────────────
-- A closed academic year is read-only, enforced by the database (F-22).
--
-- "Closed" is `academic_year.deleted_at IS NOT NULL`. Until now the only thing
-- keeping a closed year's records unchanged was the route guard in the web
-- app; every year-scoped procedure accepted a write against a closed year when
-- called directly. A per-procedure check would have to be remembered in twenty
-- places, so the rule lives here instead: a row trigger on every table that
-- carries `academic_year_id` refuses an insert, update or delete that touches
-- a closed year — on either side of an update, so a row cannot be moved into
-- or out of one.
--
-- The error uses SQLSTATE `YR001` (a custom code, class "YR"), which
-- `packages/api/src/index.ts` maps to a 409 with a sentence the user can act
-- on: restore the year first.
--
-- Not covered: child rows with no `academic_year_id` of their own
-- (`teacher_period_absence`, `class_period_teacher`, `subject_mark`). They are
-- written through a parent that is.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_academic_year_writable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  touched text[];
  year_id text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    touched := ARRAY[NEW.academic_year_id];
  ELSIF TG_OP = 'UPDATE' THEN
    touched := ARRAY[OLD.academic_year_id, NEW.academic_year_id];
  ELSE
    touched := ARRAY[OLD.academic_year_id];
  END IF;

  FOREACH year_id IN ARRAY touched LOOP
    IF year_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM "academic_year"
       WHERE "id" = year_id AND "deleted_at" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'academic year % is closed and read-only', year_id
        USING ERRCODE = 'YR001',
              HINT = 'Restore the academic year before changing its records.';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
DO $triggers$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'class_teacher_assignment_history',
    'class',
    'grade_subject_config',
    'attendance_policy',
    'short_leave_usage',
    'teacher_attendance',
    'class_period_subject',
    'leave_entitlement',
    'leave_request',
    'exam_type',
    'grade_scale',
    'student_admission',
    'student_class_assignment',
    'student_subject_selection',
    'staff_position',
    'teacher_subject_assignment'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS academic_year_writable ON %I', table_name
    );
    EXECUTE format(
      'CREATE TRIGGER academic_year_writable BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION assert_academic_year_writable()',
      table_name
    );
  END LOOP;
END
$triggers$;
