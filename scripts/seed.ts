import { insertInventoryTransaction } from "@school-student-teacher-management/api/routers/inventory/inventory-database";
import { openAcademicYear } from "@school-student-teacher-management/api/routers/staff/create-academic-year";
import { createStaffCredential } from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";
import {
  DEFAULT_INVENTORY_CATEGORIES,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
import { LATEST_STRUCTURE_VERSION_KEY } from "@school-student-teacher-management/db/constants/structureVersions/index";
import {
  inventoryCategory,
  inventoryCustodyHistory,
  inventoryItem,
} from "@school-student-teacher-management/db/schema/inventory";
import {
  academicYear,
  staff,
} from "@school-student-teacher-management/db/schema/staff";
/**
 * One-off dev seed: enough real data to exercise the features that need more
 * than one person to test — most pressingly, a custody transfer
 * (`inventory.custody.transfer`), which needs two *different* teachers, one
 * holding an item and one to hand it to.
 *
 * Idempotent by design, not by accident: every insert either checks for an
 * existing row first or uses `onConflictDoNothing`, so running this twice
 * never duplicates a category, an account, or an item line. Safe to re-run
 * after a fresh `db:migrate`.
 *
 * Run with `bun run seed` from the repo root, which passes
 * `--env-file=apps/web/.env`. CI runs `bun scripts/seed.ts` with
 * `DATABASE_URL` set directly. (This used to import `dotenv`, which no
 * package declared — it only resolved because something else pulled it in.)
 *
 * **Refuses to run with `NODE_ENV=production`**: it creates logins with a
 * published demo password.
 */
import { and, eq, isNull } from "drizzle-orm";

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Refusing to seed demo data with NODE_ENV=production: the demo teachers share a published password"
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — check your .env file");
}

const db = createDb({ DATABASE_URL: databaseUrl });

const log = (line: string) => {
  console.log(`[seed] ${line}`);
};

// ─── Academic year ──────────────────────────────────────────────────────────

/**
 * Opens the current calendar year through `openAcademicYear` — the same code
 * the academic-years page runs — so the year arrives with its attendance
 * policy, leave quotas and curriculum. The old seed inserted a bare
 * `academic_year` row marked current, which broke attendance and leave
 * review, and created a second current year on a database that had one.
 * `openAcademicYear` makes the new year current only if no year is.
 */
const seedAcademicYear = async () => {
  const currentCalendarYear = new Date().getFullYear();
  const [existing] = await db
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(
      and(
        eq(academicYear.year, currentCalendarYear),
        isNull(academicYear.deletedAt)
      )
    )
    .limit(1);

  if (existing) {
    log(`Academic year ${currentCalendarYear} already exists`);
    return;
  }

  const created = await openAcademicYear(db, {
    year: currentCalendarYear,
    startDate: `${currentCalendarYear}-01-01`,
    endDate: `${currentCalendarYear}-12-31`,
    structureVersionKey: LATEST_STRUCTURE_VERSION_KEY,
  });
  log(
    `Created academic year ${currentCalendarYear}${created.isCurrent ? " (current)" : " (not current: another year already is)"}`
  );
};

// ─── Categories ─────────────────────────────────────────────────────────────

const seedCategories = async () => {
  const rows = DEFAULT_INVENTORY_CATEGORIES.map((category) => ({
    id: crypto.randomUUID(),
    name: category.name,
    normalizedName: category.normalizedName,
    color: category.color,
  }));

  const inserted = await db
    .insert(inventoryCategory)
    .values(rows)
    .onConflictDoNothing({ target: inventoryCategory.normalizedName })
    .returning({ name: inventoryCategory.name });

  log(
    inserted.length > 0
      ? `Seeded ${inserted.length} categor${inserted.length === 1 ? "y" : "ies"}: ${inserted.map((r) => r.name).join(", ")}`
      : "Categories already seeded"
  );
};

// ─── Demo teachers ──────────────────────────────────────────────────────────

interface DemoTeacher {
  nic: string;
  name: string;
  email: string;
  password: string;
}

/**
 * Two real, separately-logged-in-able teachers — the minimum needed to test
 * a custody transfer end to end. The password is one every seeded
 * demo account shares, same convention as the leadership seats in
 * `packages/auth/src/admin.ts`.
 *
 * **The NICs are synthetic, in a block that cannot be a real identity**, and they
 * were 10 digits before `staff.nic` carried a format CHECK — two of these were
 * `9010112345`-shaped numbers that matched no National Identity Card in the
 * country. What is left is 12 digits with an impossible month (`90 00 00 …`): the
 * leading `90` reads as a birth year, the `00` that follows is not a month, so
 * the value satisfies the database's format rule while being impossible for a
 * citizen to hold. That matters here more than it does for a seeded office seat,
 * because **each of these is a login username** — `usernameForNic` is applied to
 * them — so a demo teacher signs in as `900000000002` / `900000000003`, and the
 * 10-digit values the accounts were created with no longer exist.
 */
const DEMO_TEACHERS: DemoTeacher[] = [
  {
    nic: "900000000002",
    name: "Priya Fernando",
    email: "priya.fernando@aloysiuscollege.lk",
    password: "teacher-2026-demo",
  },
  {
    nic: "900000000003",
    name: "Kasun Perera",
    email: "kasun.perera@aloysiuscollege.lk",
    password: "teacher-2026-demo",
  },
];

/** Returns the demo teacher's `staff.id`, creating the login + staff row if either is missing. */
const seedTeacher = async (demo: DemoTeacher): Promise<string> => {
  const [existingStaff] = await db
    .select({ id: staff.id, userId: staff.userId })
    .from(staff)
    .where(eq(staff.nic, demo.nic))
    .limit(1);

  if (existingStaff) {
    log(`Teacher ${demo.name} already seeded (staff ${existingStaff.id})`);
    return existingStaff.id;
  }

  // Login and staff row together: a failure between them used to leave a
  // login holding the NIC, which made every later run fail on it.
  const { username, createdStaff } = await db.transaction(async (tx) => {
    const credential = await createStaffCredential(tx, {
      nic: demo.nic,
      password: demo.password,
      name: demo.name,
      email: demo.email,
      role: "teacher",
      emailVerified: true,
    });
    const [row] = await tx
      .insert(staff)
      .values({
        id: crypto.randomUUID(),
        name: demo.name,
        email: demo.email,
        nic: demo.nic,
        userId: credential.userId,
        staffCategory: "teacher",
        employmentStatus: "active",
      })
      .returning({ id: staff.id });
    return { username: credential.username, createdStaff: row };
  });

  if (!createdStaff) {
    throw new Error(`Failed to create staff row for ${demo.name}`);
  }

  log(
    `Created teacher ${demo.name} — sign in as "${username}" / "${demo.password}"`
  );
  return createdStaff.id;
};

// ─── Demo equipment ─────────────────────────────────────────────────────────

/**
 * One bulk-counted line (20 office chairs, one QR code, no per-unit tags)
 * and one individually-held line (a camera in Priya's hands) — deliberately
 * the two cases `AssetTagFields`' new description explains, and the second is
 * what makes `custody.transfer`/`custody.take` testable without registering an
 * item by hand first.
 */
/**
 * Seeded stock is ledgered like stock entered through the app: every item gets
 * its opening `created` row, so `scripts/reconcile-inventory.ts` holds from the
 * first run. It used to insert the items alone, leaving a register whose
 * counters no ledger explained (forensic repair NEW-F-06). Attributed to the
 * demo teacher who holds the items: the seeded seats exist only once the app
 * has booted, and the seed must work on a database that never has.
 */
const SEED_ACTOR_NAME = "Demo seed";

const seedEquipment = async (
  cameraCategoryId: string,
  chairCategoryId: string,
  custodianStaffId: string
) => {
  const [existingCamera] = await db
    .select({ id: inventoryItem.id })
    .from(inventoryItem)
    .where(eq(inventoryItem.sku, "INV-90001"))
    .limit(1);

  if (existingCamera) {
    log("Digital Camera (INV-90001) already seeded");
  } else {
    const itemId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(inventoryItem).values({
        id: itemId,
        sku: "INV-90001",
        categoryId: cameraCategoryId,
        name: "Digital Camera",
        description: "DSLR camera, kept in the AV cupboard",
        unit: "unit",
        qty: 1,
        borrowable: true,
        condition: "Good",
        managerStaffId: custodianStaffId,
        custodianStaffId,
      });
      await tx.insert(inventoryCustodyHistory).values({
        id: crypto.randomUUID(),
        itemId,
        previousCustodianStaffId: null,
        newCustodianStaffId: custodianStaffId,
        previousManagerStaffId: null,
        newManagerStaffId: null,
        changeType: "custody_taken",
        changedByStaffId: custodianStaffId,
      });
      await insertInventoryTransaction(tx, {
        actor: { staffId: custodianStaffId, name: SEED_ACTOR_NAME },
        action: "created",
        item: { id: itemId, name: "Digital Camera", sku: "INV-90001" },
        before: { qty: 0 },
        after: { qty: 1 },
        note: "Item created (demo seed)",
      });
    });
    log("Created Digital Camera (INV-90001), held by the first demo teacher");
  }

  const [existingChairs] = await db
    .select({ id: inventoryItem.id })
    .from(inventoryItem)
    .where(eq(inventoryItem.sku, "INV-90002"))
    .limit(1);

  if (existingChairs) {
    log("Office Chair (INV-90002) already seeded");
  } else {
    const chairsId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(inventoryItem).values({
        id: chairsId,
        sku: "INV-90002",
        categoryId: chairCategoryId,
        name: "Office Chair",
        description: "Standard staff-room chair",
        unit: "unit",
        qty: 20,
        borrowable: false,
        condition: "Good",
        managerStaffId: custodianStaffId,
        custodianStaffId,
      });
      await insertInventoryTransaction(tx, {
        actor: { staffId: custodianStaffId, name: SEED_ACTOR_NAME },
        action: "created",
        item: { id: chairsId, name: "Office Chair", sku: "INV-90002" },
        before: { qty: 0 },
        after: { qty: 20 },
        note: "Item created (demo seed)",
      });
    });
    log("Created Office Chair (INV-90002), a bulk-counted line of 20");
  }
};

const run = async () => {
  const [demoTeacherOne, demoTeacherTwo] = DEMO_TEACHERS;
  if (!(demoTeacherOne && demoTeacherTwo)) {
    throw new Error("DEMO_TEACHERS must have exactly two entries");
  }

  await seedAcademicYear();
  await seedCategories();

  const [furniture] = await db
    .select({ id: inventoryCategory.id })
    .from(inventoryCategory)
    .where(
      eq(inventoryCategory.normalizedName, normalizeInventoryKey("Furniture"))
    )
    .limit(1);
  const [audioVisual] = await db
    .select({ id: inventoryCategory.id })
    .from(inventoryCategory)
    .where(
      eq(
        inventoryCategory.normalizedName,
        normalizeInventoryKey("Audio Visual")
      )
    )
    .limit(1);

  // Sequential, so the log and any failure are in a deterministic order.
  const teacherOneId = await seedTeacher(demoTeacherOne);
  const teacherTwoId = await seedTeacher(demoTeacherTwo);

  if (audioVisual && furniture) {
    await seedEquipment(audioVisual.id, furniture.id, teacherOneId);
  } else {
    log("Skipped equipment: 'Audio Visual' or 'Furniture' category is missing");
  }

  log("Done.");
  log(
    `Sign in as either demo teacher (${DEMO_TEACHERS.map((t) => t.nic).join(", ")}) / "teacher-2026-demo" to test a custody transfer — the second teacher's own account (staff id ${teacherTwoId}) has nothing held yet, so it is the one to receive the item.`
  );
};

await run();
process.exit(0);
