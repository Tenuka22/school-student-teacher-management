import { normalizeInventoryKey } from "@school-student-teacher-management/db/constants/inventory";
import { user } from "@school-student-teacher-management/db/schema/auth";
import { staff } from "@school-student-teacher-management/db/schema/staff";
import { and, asc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import * as v from "valibot";

import { adminProcedure } from "../../index";

/** The combobox page size. 50 is roughly two screens of a school roll. */
const DEFAULT_ASSIGNABLE_STAFF_LIMIT = 50;

/**
 * Who may hold school property: **any member of staff who is still employed.**
 *
 * **This is a security property, not a display filter.** This list is the source
 * for every manager, custodian and borrower field in the inventory UI, so
 * anything it offers can be handed a school laptop. It holds the identical
 * predicate to `assertStaffIsAssignable` in `./inventory-database`, so the list
 * and that guard offer and accept the same set.
 *
 * - **Every category of staff qualifies, and that is the decision, not a
 *   widening left half-done.** The `staffCategory = "teacher"` restriction used
 *   to sit here on the argument that office staff are not handed the keys to a
 *   lab cupboard. It is gone. A Principal is a person in the building, not only
 *   a login; the bursar is who a school projector actually leaves the office
 *   with; and `STAFF_CATEGORIES` has exactly two values — `teacher` and
 *   `officeStaff` — so filtering on the column no longer excluded a *category of
 *   people who cannot hold property*, it excluded a colleague. A list that
 *   cannot name the person who handed the thing over is not a security control,
 *   it is a hole with a justification attached.
 * - **The employment status is the half of the predicate that does the work,
 *   and it is the half that stays.** It is what stops the register naming
 *   somebody who is not a real, employed person: a *terminated* or *on-leave*
 *   colleague is excluded, because the equipment leaves the building with them.
 *   A *null* `employmentStatus` is admitted, because it means nobody has
 *   confirmed it, and refusing those would make the store unusable until an
 *   administrator filled in a field the storekeeper has no business editing.
 * - **The seeded `admin` / `principal` / `deputy-principal` accounts are still
 *   absent, and not because of anything written here.** They are users with no
 *   staff row at all (`packages/auth/src/admin.ts`), so *no* filter on `staff`
 *   reaches them and none is written for them. They administer the ledger; they
 *   are not the people who carry the laptops. A school that assigns a projector
 *   to a leadership account has lost the accountability the ledger exists to
 *   record, and that is a reason to have no staff row rather than a predicate.
 *
 * **HOW THIS RELATES TO `staff/teacher-eligibility.ts:27-35`, WHICH IT NO
 * LONGER MATCHES.** That file's `activeOrUnsetEmployment` is the same expression
 * as the one below, re-derived for the same reason — both are module-private —
 * but it is composed with `teachingStaff` to answer a different question: who
 * may be a homeroom or subject teacher, which is a roster. A year roster must
 * not contain the bursar; the people a school hands its property to may be
 * anybody in the building. The two used to hold the identical predicate and
 * used to have to move together, which is why the old comment here said so at
 * length; **they now diverge on purpose, and a change to this one must not
 * reach back into that file.** `staff/list-staff.ts:65-66` keeps the teaching
 * predicate (`defaultTeachingStaff`), so the copies that remain are the two
 * roster copies and this is no longer one of them. If the school ever needs a
 * narrower rule here — a visiting contractor or an honorary fellow who may
 * borrow but not be paid a custodian's duty — it belongs in this file alone.
 */
const activeOrUnsetEmployment = or(
  eq(staff.employmentStatus, "active"),
  isNull(staff.employmentStatus)
);

/**
 * `LIKE` / `ILIKE` wildcards typed by a user have to be escaped.
 *
 * A search box that passes its input straight into a pattern lets `"%"` match
 * every member of staff and `"_"` match any character, so a storekeeper typing
 * an underscore into "Ada_Love" would be shown the whole school. The escape
 * character is escaped first, otherwise the backslashes this function itself
 * adds would be escaped a second time. `normalizeInventoryKey` supplies the
 * trimmed, whitespace-collapsed, lower-cased term, so a stray space out of a
 * paste does not become `% %` and match nothing.
 *
 * This is a verbatim copy of an identical private helper in roughly ten other
 * files, and it is kept as a copy rather than shared: the helper is four
 * characters of regex plus a `replaceAll`, and the alternative is a shared util
 * whose import has to be right in every one of those files. It is recorded here
 * so a reader who finds the eleventh copy knows it was deliberate and not a
 * merge accident.
 */
const escapeLikePattern = (term: string): string =>
  term.replaceAll(/[\\%_]/gu, (character) => `\\${character}`);

/**
 * Every person a manager, custodian or borrower field may name.
 *
 * `staffCategory` is projected **deliberately, and the widened list is the
 * reason it is no longer constant.** The picker now mixes teaching staff and
 * office staff in one list, and "R. Perera" plus a badge number does not say
 * whether the person teaches Reception or is the bursar. The UI needs the
 * column to tell a colleague from a clerk in a field where both are now
 * legitimate answers, and the server already had it on the row. It is
 * informational — it filters nothing, and `assertStaffIsAssignable` ignores it.
 *
 * `serviceNo` is `staff.teacherServiceNo` — the badge number — and it is in the
 * response because the UI shows it beside the name, and because a school
 * reliably has several staff with similar names: "Mrs. Perera" is not a
 * disambiguator when there are three of them, and `EMP-0417` is. It is nullable
 * (staff who predate badge numbers, and staff records created without one) and
 * the UI must degrade to showing the name alone rather than an empty chip. The
 * column keeps the word "teacher" in its name because the database does; that
 * is a schema fact, not a claim about who may hold a laptop.
 *
 * `currentRole` is the role of the **login account** linked through
 * `staff.userId`, or `null` when the person has no account at all — which is
 * most of the staff roll, since accounts are issued by an administrator rather
 * than self-registered. It is informational: the combobox greys out nobody,
 * because a member of staff without a login can still physically hold a
 * projector. (The column is nullable in the database too, so a user row whose
 * role is unset reads back as `null` here as well.)
 *
 * `limit` is applied after `orderBy name` rather than before, so the first page
 * of an unfiltered request is the alphabetically-first 50 members of staff and
 * paging or raising the limit is additive rather than reshuffling.
 *
 * **`adminProcedure`, not `requireInventoryPermission("read")`** — a deliberate
 * deviation from the obvious gate, and the reason is written down in two other
 * places in this repo.
 *
 * The gate changed because `requireInventoryPermission("read")` is
 * teacher-reachable: the `teacher` role holds `inventory: ["read"]`
 * (`packages/auth/src/permissions.ts`), and `requirePermission` in
 * `packages/api/src/index.ts` consults that statement for anybody outside
 * `ADMIN_ROLES`. A teacher can therefore pass that gate, and this is not a
 * vocabulary — it is the **staff directory**: every colleague's name, staff
 * category, employment status, badge number (`serviceNo`) and, joined through
 * `staff.userId`, the **role of their login account**. The search box and the
 * 200 ceiling turn it into a directory of the whole establishment. The predicate
 * above no longer calls that directory a teaching roster, but the exposure is
 * the same one the gate was moved for: the audience, not the filter, is the
 * reason this is `adminProcedure`.
 *
 * The property this file's own comment above relies on is the reason it must not
 * be reachable by a teacher: it is the source for every manager, custodian and
 * borrower field in the inventory UI, so a teacher who could read it could be
 * handed the list of people school property is given to — and each of them is a
 * colleague, not an abstraction. Narrowing it to the caller would be worse than
 * useless (a teacher has nobody to assign to, and the combobox is only ever
 * populated by a storekeeper), so it is `adminProcedure`, and it now satisfies
 * the `teacher` statement's contract that `read` reaches no school-wide list.
 */
export const listAssignableStaff = adminProcedure
  .input(
    v.object({
      search: v.optional(v.pipe(v.string(), v.maxLength(80))),
      limit: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))
      ),
    })
  )
  .handler(async ({ input, context }) => {
    /**
     * A whitespace-only search is treated as no search. A combobox that returned
     * an empty list because the user pressed space would look broken, and the
     * unfiltered list is exactly what they meant.
     */
    const term = normalizeInventoryKey(input.search ?? "");
    const pattern = `%${escapeLikePattern(term)}%`;

    const rows = await context.db
      .select({
        id: staff.id,
        name: staff.name,
        staffCategory: staff.staffCategory,
        employmentStatus: staff.employmentStatus,
        serviceNo: staff.teacherServiceNo,
        currentRole: user.role,
      })
      .from(staff)
      // A `left` join and not an `inner` one: most of the staff roll has no
      // login account, and an inner join would silently drop exactly the people
      // a storekeeper is most likely to be looking for. `staff.userId` is
      // unique, so the join cannot multiply a staff row.
      .leftJoin(user, eq(staff.userId, user.id))
      .where(
        and(
          activeOrUnsetEmployment,
          or(isNull(user.id), ne(user.role, "admin")),
          term
            ? or(
                ilike(staff.name, pattern),
                ilike(staff.teacherServiceNo, pattern)
              )
            : undefined
        )
      )
      .orderBy(asc(staff.name))
      .limit(input.limit ?? DEFAULT_ASSIGNABLE_STAFF_LIMIT);

    return rows;
  });
