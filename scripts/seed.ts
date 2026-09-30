import { fileURLToPath } from "node:url";

import { createStaffCredential } from "@school-student-teacher-management/auth";
import { createDb } from "@school-student-teacher-management/db";
import {
  DEFAULT_INVENTORY_CATEGORIES,
  normalizeInventoryKey,
} from "@school-student-teacher-management/db/constants/inventory";
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
 * Run with `bun run seed` from the repo root. Loads `apps/web/.env` directly
 * — the same file `apps/web`'s own dev server and drizzle scripts read —
 * because `varlock/auto-load`'s cwd-relative discovery only finds a package's
 * own `.env`, and this script's package is the repo root, which has none.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: fileURLToPath(new URL("../apps/web/.env", import.meta.url)) });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — check your .env file");
}

const db = createDb({ DATABASE_URL: databaseUrl });

const log = (line: string) => {
  console.log(`[seed] ${line}`);
};

// ─── Academic year ──────────────────────────────────────────────────────────

const seedAcademicYear = async () => {
  const currentCalendarYear = new Date().getFullYear();
  const [existing] = await db
    .select({ id: academicYear.id })
    .from(academicYear)
    .where(eq(academicYear.year, currentCalendarYear))
    .limit(1);

  if (existing) {
    log(`Academic year ${currentCalendarYear} already exists`);
    return;
  }

  await db.insert(academicYear).values({
    id: crypto.randomUUID(),
    year: currentCalendarYear,
    startDate: `${currentCalendarYear}-01-01`,
    endDate: `${currentCalendarYear}-12-31`,
    isCurrent: true,
  });
  log(`Created academic year ${currentCalendarYear}`);
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

  const { userId, username } = await createStaffCredential(db, {
    nic: demo.nic,
    password: demo.password,
    name: demo.name,
    email: demo.email,
    role: "teacher",
    emailVerified: true,
  });

  const [createdStaff] = await db
    .insert(staff)
    .values({
      id: crypto.randomUUID(),
      name: demo.name,
      email: demo.email,
      nic: demo.nic,
      userId,
      staffCategory: "teacher",
      employmentStatus: "active",
    })
    .returning({ id: staff.id });

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
    await db.insert(inventoryItem).values({
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
    await db.insert(inventoryCustodyHistory).values({
      id: crypto.randomUUID(),
      itemId,
      previousCustodianStaffId: null,
      newCustodianStaffId: custodianStaffId,
      previousManagerStaffId: null,
      newManagerStaffId: null,
      changeType: "custody_taken",
      changedByStaffId: custodianStaffId,
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
    await db.insert(inventoryItem).values({
      id: crypto.randomUUID(),
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

  const [teacherOneId, teacherTwoId] = await Promise.all([
    seedTeacher(demoTeacherOne),
    seedTeacher(demoTeacherTwo),
  ]);

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
