CREATE TABLE "class_teacher_assignment_history" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"previous_teacher_id" text,
	"new_teacher_id" text,
	"change_type" text NOT NULL,
	"reason" text,
	"note" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"grade_level" integer NOT NULL,
	"name" text NOT NULL,
	"medium" text DEFAULT 'sinhala' NOT NULL,
	"homeroom_teacher_id" text,
	"sub_homeroom_teacher_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_unique" UNIQUE("academic_year_id","grade_level","name")
);
--> statement-breakpoint
CREATE TABLE "grade_subject_config" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"grade_level" integer NOT NULL,
	"basket_category" text NOT NULL,
	"subject_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_unique" UNIQUE("academic_year_id","grade_level","basket_category","subject_key")
);
--> statement-breakpoint
CREATE TABLE "attendance_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"arrival_cutoff_time" text DEFAULT '07:30' NOT NULL,
	"short_leaves_per_month" integer DEFAULT 2 NOT NULL,
	"primary_start_period_number" integer DEFAULT 1 NOT NULL,
	"primary_end_period_number" integer DEFAULT 4 NOT NULL,
	"secondary_start_period_number" integer DEFAULT 5 NOT NULL,
	"secondary_end_period_number" integer DEFAULT 8 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_policy_year_unique" UNIQUE("academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "short_leave_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"year_month" text NOT NULL,
	"short_leaves_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "short_leave_usage_staff_year_month_unique" UNIQUE("staff_id","academic_year_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "teacher_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"leave_request_id" text,
	"marked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_attendance_staff_year_date_unique" UNIQUE("staff_id","academic_year_id","date")
);
--> statement-breakpoint
CREATE TABLE "teacher_period_absence" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_attendance_id" text NOT NULL,
	"period_number" integer NOT NULL,
	"reason" text NOT NULL,
	"substitute_staff_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_period_absence_unique" UNIQUE("teacher_attendance_id","period_number")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_period_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"class_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"period_number" integer NOT NULL,
	"subject_key" text NOT NULL,
	"staff_id" text NOT NULL,
	"is_combined_session" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "class_period_assignment_class_slot_unique" UNIQUE("academic_year_id","class_id","day_of_week","period_number")
);
--> statement-breakpoint
CREATE TABLE "leave_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"leave_type" text NOT NULL,
	"payment_status" text DEFAULT 'notApplicable' NOT NULL,
	"max_days" integer NOT NULL,
	"min_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_entitlement_year_type_payment_unique" UNIQUE("academic_year_id","leave_type","payment_status")
);
--> statement-breakpoint
CREATE TABLE "leave_request" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"day_part" text DEFAULT 'full' NOT NULL,
	"payment_status" text DEFAULT 'notApplicable' NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"deputy_status" text DEFAULT 'pending' NOT NULL,
	"deputy_staff_id" text,
	"deputy_acted_at" timestamp,
	"deputy_comment" text,
	"final_status" text DEFAULT 'pending' NOT NULL,
	"principal_staff_id" text,
	"principal_acted_at" timestamp,
	"principal_comment" text,
	"finalized_at" timestamp,
	"reviewed_by_staff_id" text,
	"reviewed_at" timestamp,
	"review_comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_type" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"grade_level" integer,
	"max_mark" integer DEFAULT 100 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exam_type_year_grade_name_unique" UNIQUE("academic_year_id","grade_level","name")
);
--> statement-breakpoint
CREATE TABLE "grade_scale" (
	"id" text PRIMARY KEY NOT NULL,
	"academic_year_id" text NOT NULL,
	"subject_key" text,
	"grade" text NOT NULL,
	"min_mark" integer NOT NULL,
	"max_mark" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grade_scale_unique" UNIQUE("academic_year_id","subject_key","grade")
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" text PRIMARY KEY NOT NULL,
	"admission_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" text,
	"gender" text,
	"phone" text,
	"parent_phone" text,
	"admission_year" integer,
	"admission_type" text,
	"birth_certificate_number" text,
	"admission_grade" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_admission_number_unique" UNIQUE("admission_number")
);
--> statement-breakpoint
CREATE TABLE "student_admission" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"admission_type" text NOT NULL,
	"birth_certificate_number" text,
	"previous_school" text,
	"documents" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sa_student_year_unique" UNIQUE("student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "student_class_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"class_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sca_student_year_unique" UNIQUE("student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "student_subject_selection" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"basket_category" text NOT NULL,
	"subject_key" text NOT NULL,
	"previous_selection_id" text,
	"superseded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_mark" (
	"id" text PRIMARY KEY NOT NULL,
	"student_class_assignment_id" text NOT NULL,
	"exam_type_id" text NOT NULL,
	"subject_key" text NOT NULL,
	"mark" integer NOT NULL,
	"grade" text,
	"entered_by_staff_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sm_unique" UNIQUE("student_class_assignment_id","exam_type_id","subject_key")
);
--> statement-breakpoint
CREATE TABLE "academic_year" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"start_date" text,
	"end_date" text,
	"structure_version_key" text,
	"structure_subversion_key" integer,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "academic_year_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"nic" text,
	"phone" text,
	"birth_date" text,
	"gender" text,
	"religion" text,
	"mother_tongue" text,
	"blood_group" text,
	"marital_status" text,
	"spouse_name" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"district" text,
	"grama_niladhari_division" text,
	"postal_code" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"staff_category" text DEFAULT 'teacher' NOT NULL,
	"appointment_type" text,
	"appointment_date" text,
	"teacher_service_no" text,
	"employment_status" text,
	"user_id" text,
	"portrait_file_id" text,
	"national_identity_card_file_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_nic_unique" UNIQUE("nic"),
	CONSTRAINT "staff_teacher_service_no_unique" UNIQUE("teacher_service_no"),
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "staff_position" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"position" text NOT NULL,
	"sectional_scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_position_unique" UNIQUE("staff_id","academic_year_id","position","sectional_scope")
);
--> statement-breakpoint
CREATE TABLE "teacher_subject_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"subject_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_subject_assignment_unique" UNIQUE("staff_id","academic_year_id","subject_key")
);
--> statement-breakpoint
CREATE TABLE "employment_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"document_type" text NOT NULL,
	"file_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_rotation_history" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"changed_by" text,
	"change_method" text NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_qualification" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"qualification" text NOT NULL,
	"year_obtained" integer,
	"institution" text,
	"subject_specialization" text,
	"specialization_category" text,
	"document_file_id" text,
	"document_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_qualification_unique" UNIQUE("staff_id","qualification","year_obtained","institution")
);
--> statement-breakpoint
CREATE TABLE "inventory_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_staff_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_audit_log_entity_not_blank" CHECK (length(trim("inventory_audit_log"."entity_id")) > 0),
	CONSTRAINT "inventory_audit_log_actor_name_not_blank" CHECK (length(trim("inventory_audit_log"."actor_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_borrow" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"borrower_staff_id" text,
	"borrower_student_id" text,
	"purpose" text NOT NULL,
	"expected_return_date" text NOT NULL,
	"approved_by" text,
	"note" text,
	"status" text DEFAULT 'borrowed' NOT NULL,
	"borrowed_by_staff_id" text,
	"borrowed_at" timestamp DEFAULT now() NOT NULL,
	"returned_at" timestamp,
	"returned_by_staff_id" text,
	"return_condition" text,
	"return_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_borrow_qty_positive" CHECK ("inventory_borrow"."qty" > 0),
	CONSTRAINT "inventory_borrow_borrower_exclusive" CHECK (("inventory_borrow"."borrower_staff_id" is not null) <> ("inventory_borrow"."borrower_student_id" is not null)),
	CONSTRAINT "inventory_borrow_status_check" CHECK ("inventory_borrow"."status" in ('borrowed', 'returned')),
	CONSTRAINT "inventory_borrow_return_condition_check" CHECK (("inventory_borrow"."return_condition" is null or "inventory_borrow"."return_condition" in ('Good', 'Fair', 'Damaged', 'Under Repair'))),
	CONSTRAINT "inventory_borrow_expected_return_date_iso" CHECK ("inventory_borrow"."expected_return_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "inventory_borrow_return_state" CHECK ((
        "inventory_borrow"."status" = 'borrowed'
        and "inventory_borrow"."returned_at" is null
        and "inventory_borrow"."returned_by_staff_id" is null
        and "inventory_borrow"."return_condition" is null
        and "inventory_borrow"."return_note" is null
      ) or (
        "inventory_borrow"."status" = 'returned'
        and "inventory_borrow"."returned_at" is not null
        and "inventory_borrow"."return_condition" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "inventory_borrow_unit" (
	"borrow_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"released_at" timestamp,
	CONSTRAINT "inventory_borrow_unit_pk" PRIMARY KEY("borrow_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"color" text DEFAULT '#6366F1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_category_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "inventory_category_name_not_blank" CHECK (length(trim("inventory_category"."name")) > 0),
	CONSTRAINT "inventory_category_color_hex" CHECK ("inventory_category"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "inventory_custody_history" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"previous_custodian_staff_id" text,
	"new_custodian_staff_id" text,
	"previous_manager_staff_id" text,
	"new_manager_staff_id" text,
	"change_type" text NOT NULL,
	"reason" text,
	"note" text,
	"changed_by_staff_id" text,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_custody_history_change_type_check" CHECK ("inventory_custody_history"."change_type" in ('custody_taken', 'custody_transferred', 'custody_released', 'manager_assigned', 'manager_changed', 'manager_cleared')),
	CONSTRAINT "inventory_custody_history_manager_columns" CHECK (("inventory_custody_history"."change_type" in ('custody_taken','custody_transferred','custody_released')) = ("inventory_custody_history"."previous_manager_staff_id" is null and "inventory_custody_history"."new_manager_staff_id" is null)),
	CONSTRAINT "inventory_custody_history_reason_required" CHECK ("inventory_custody_history"."change_type" in ('custody_taken','manager_assigned') or "inventory_custody_history"."reason" is not null),
	CONSTRAINT "inventory_custody_history_reason_check" CHECK (("inventory_custody_history"."reason" is null or "inventory_custody_history"."reason" in ('teacher_transfer', 'staff_departure', 'damage_repair', 'class_reallocation', 'long_absence', 'returned_to_store', 'misassignment', 'other')))
);
--> statement-breakpoint
CREATE TABLE "inventory_disposal" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"reason" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"notes" text,
	"estimated_value" numeric(14, 2),
	"requested_by_staff_id" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_by_staff_id" text,
	"approved_at" timestamp,
	"finalized_by_staff_id" text,
	"finalized_at" timestamp,
	"cancelled_by_staff_id" text,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_disposal_qty_positive" CHECK ("inventory_disposal"."qty" > 0),
	CONSTRAINT "inventory_disposal_method_check" CHECK ("inventory_disposal"."method" in ('Disposal', 'Recycling', 'Auction', 'Write-Off', 'Donation', 'Return to Supplier')),
	CONSTRAINT "inventory_disposal_status_check" CHECK ("inventory_disposal"."status" in ('pending_approval', 'approved', 'disposed', 'recycled', 'auctioned', 'written_off', 'donated', 'returned_to_supplier', 'cancelled')),
	CONSTRAINT "inventory_disposal_estimated_value_nonneg" CHECK ("inventory_disposal"."estimated_value" is null or "inventory_disposal"."estimated_value" >= 0),
	CONSTRAINT "inventory_disposal_approval_state" CHECK (("inventory_disposal"."approved_by_staff_id" is null) = ("inventory_disposal"."approved_at" is null)),
	CONSTRAINT "inventory_disposal_finalization_state" CHECK (("inventory_disposal"."finalized_by_staff_id" is null) = ("inventory_disposal"."finalized_at" is null)),
	CONSTRAINT "inventory_disposal_cancellation_state" CHECK (("inventory_disposal"."cancelled_by_staff_id" is null) = ("inventory_disposal"."cancelled_at" is null)),
	CONSTRAINT "inventory_disposal_status_state" CHECK ((
        "inventory_disposal"."status" = 'pending_approval'
        and "inventory_disposal"."approved_by_staff_id" is null
        and "inventory_disposal"."approved_at" is null
        and "inventory_disposal"."finalized_by_staff_id" is null
        and "inventory_disposal"."finalized_at" is null
        and "inventory_disposal"."cancelled_by_staff_id" is null
        and "inventory_disposal"."cancelled_at" is null
      ) or (
        "inventory_disposal"."status" = 'approved'
        and "inventory_disposal"."approved_by_staff_id" is not null
        and "inventory_disposal"."approved_at" is not null
        and "inventory_disposal"."finalized_by_staff_id" is null
        and "inventory_disposal"."finalized_at" is null
        and "inventory_disposal"."cancelled_by_staff_id" is null
        and "inventory_disposal"."cancelled_at" is null
      ) or (
        "inventory_disposal"."status" in ('disposed', 'recycled', 'auctioned', 'written_off', 'donated', 'returned_to_supplier')
        and "inventory_disposal"."approved_by_staff_id" is not null
        and "inventory_disposal"."approved_at" is not null
        and "inventory_disposal"."finalized_by_staff_id" is not null
        and "inventory_disposal"."finalized_at" is not null
        and "inventory_disposal"."cancelled_by_staff_id" is null
        and "inventory_disposal"."cancelled_at" is null
      ) or (
        "inventory_disposal"."status" = 'cancelled'
        and "inventory_disposal"."finalized_by_staff_id" is null
        and "inventory_disposal"."finalized_at" is null
        and "inventory_disposal"."cancelled_by_staff_id" is not null
        and "inventory_disposal"."cancelled_at" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "inventory_disposal_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"disposal_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text,
	"changed_by_staff_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_disposal_status_history_from_status_check" CHECK (("inventory_disposal_status_history"."from_status" is null or "inventory_disposal_status_history"."from_status" in ('pending_approval', 'approved', 'disposed', 'recycled', 'auctioned', 'written_off', 'donated', 'returned_to_supplier', 'cancelled'))),
	CONSTRAINT "inventory_disposal_status_history_to_status_check" CHECK ("inventory_disposal_status_history"."to_status" in ('pending_approval', 'approved', 'disposed', 'recycled', 'auctioned', 'written_off', 'donated', 'returned_to_supplier', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "inventory_disposal_unit" (
	"disposal_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"released_at" timestamp,
	CONSTRAINT "inventory_disposal_unit_pk" PRIMARY KEY("disposal_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"receiver_name" text NOT NULL,
	"receiver_department" text,
	"receiver_phone" text,
	"purpose" text NOT NULL,
	"approved_by" text,
	"expected_return_date" text,
	"note" text,
	"issued_by_staff_id" text,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_issue_qty_positive" CHECK ("inventory_issue"."qty" > 0),
	CONSTRAINT "inventory_issue_receiver_not_blank" CHECK (length(trim("inventory_issue"."receiver_name")) > 0),
	CONSTRAINT "inventory_issue_expected_return_date_iso" CHECK (("inventory_issue"."expected_return_date" is null or "inventory_issue"."expected_return_date" ~ '^\d{4}-\d{2}-\d{2}$'))
);
--> statement-breakpoint
CREATE TABLE "inventory_issue_unit" (
	"issue_id" text NOT NULL,
	"unit_id" text NOT NULL,
	CONSTRAINT "inventory_issue_unit_pk" PRIMARY KEY("issue_id","unit_id"),
	CONSTRAINT "inventory_issue_unit_unit_unique" UNIQUE("unit_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_item" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'unit' NOT NULL,
	"min_qty" integer DEFAULT 0 NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"borrowed_qty" integer DEFAULT 0 NOT NULL,
	"borrowable" boolean DEFAULT false NOT NULL,
	"condition" text DEFAULT 'Good' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"purchase_value" numeric(14, 2),
	"current_value" numeric(14, 2),
	"created_by_staff_id" text,
	"manager_staff_id" text,
	"custodian_staff_id" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_item_sku_unique" UNIQUE("sku"),
	CONSTRAINT "inventory_item_name_not_blank" CHECK (length(trim("inventory_item"."name")) > 0),
	CONSTRAINT "inventory_item_sku_format" CHECK ("inventory_item"."sku" ~ '^INV-[0-9]{5}$'),
	CONSTRAINT "inventory_item_sku_upper" CHECK ("inventory_item"."sku" = upper("inventory_item"."sku")),
	CONSTRAINT "inventory_item_condition_check" CHECK ("inventory_item"."condition" in ('Good', 'Fair', 'Damaged', 'Under Repair')),
	CONSTRAINT "inventory_item_counters_nonneg" CHECK ("inventory_item"."qty" >= 0 AND "inventory_item"."borrowed_qty" >= 0),
	CONSTRAINT "inventory_item_counters_within_qty" CHECK ("inventory_item"."borrowed_qty" <= "inventory_item"."qty"),
	CONSTRAINT "inventory_item_min_qty" CHECK ("inventory_item"."min_qty" >= 0),
	CONSTRAINT "inventory_item_values_nonneg" CHECK (("inventory_item"."purchase_value" is null or "inventory_item"."purchase_value" >= 0) and ("inventory_item"."current_value" is null or "inventory_item"."current_value" >= 0))
);
--> statement-breakpoint
CREATE TABLE "inventory_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_staff_id" text,
	"action" text NOT NULL,
	"item_id" text NOT NULL,
	"qty_before" integer NOT NULL,
	"qty_after" integer NOT NULL,
	"borrowed_qty_before" integer NOT NULL,
	"borrowed_qty_after" integer NOT NULL,
	"note" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_transaction_action_check" CHECK ("inventory_transaction"."action" in ('created', 'edited', 'deleted', 'stock_in', 'stock_out', 'issued', 'borrowed', 'returned', 'custody_taken', 'custody_transferred', 'custody_released', 'manager_assigned', 'manager_changed', 'manager_cleared', 'disposal_requested', 'disposal_approved', 'disposal_finalized')),
	CONSTRAINT "inventory_transaction_counters_nonneg" CHECK ("inventory_transaction"."qty_before" >= 0
        and "inventory_transaction"."qty_after" >= 0
        and "inventory_transaction"."borrowed_qty_before" >= 0
        and "inventory_transaction"."borrowed_qty_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_unit" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"unique_no" text NOT NULL,
	"normalized_unique_no" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"condition" text DEFAULT 'Good' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"note" text,
	"purchase_value" numeric(14, 2),
	"current_value" numeric(14, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_unit_normalized_unique_no_unique" UNIQUE("normalized_unique_no"),
	CONSTRAINT "inventory_unit_unique_no_not_blank" CHECK (length(trim("inventory_unit"."unique_no")) > 0),
	CONSTRAINT "inventory_unit_status_check" CHECK ("inventory_unit"."status" in ('available', 'borrowed', 'issued', 'disposed', 'removed')),
	CONSTRAINT "inventory_unit_condition_check" CHECK ("inventory_unit"."condition" in ('Good', 'Fair', 'Damaged', 'Under Repair')),
	CONSTRAINT "inventory_unit_values_nonneg" CHECK (("inventory_unit"."purchase_value" is null or "inventory_unit"."purchase_value" >= 0) and ("inventory_unit"."current_value" is null or "inventory_unit"."current_value" >= 0))
);
--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_previous_teacher_id_staff_id_fk" FOREIGN KEY ("previous_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignment_history" ADD CONSTRAINT "class_teacher_assignment_history_new_teacher_id_staff_id_fk" FOREIGN KEY ("new_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_homeroom_teacher_id_staff_id_fk" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_sub_homeroom_teacher_id_staff_id_fk" FOREIGN KEY ("sub_homeroom_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_subject_config" ADD CONSTRAINT "grade_subject_config_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_policy" ADD CONSTRAINT "attendance_policy_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_leave_usage" ADD CONSTRAINT "short_leave_usage_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_leave_usage" ADD CONSTRAINT "short_leave_usage_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_attendance" ADD CONSTRAINT "teacher_attendance_leave_request_id_leave_request_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_period_absence" ADD CONSTRAINT "teacher_period_absence_teacher_attendance_id_teacher_attendance_id_fk" FOREIGN KEY ("teacher_attendance_id") REFERENCES "public"."teacher_attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_period_absence" ADD CONSTRAINT "teacher_period_absence_substitute_staff_id_staff_id_fk" FOREIGN KEY ("substitute_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_assignment" ADD CONSTRAINT "class_period_assignment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_assignment" ADD CONSTRAINT "class_period_assignment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_period_assignment" ADD CONSTRAINT "class_period_assignment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlement" ADD CONSTRAINT "leave_entitlement_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_deputy_staff_id_staff_id_fk" FOREIGN KEY ("deputy_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_principal_staff_id_staff_id_fk" FOREIGN KEY ("principal_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_reviewed_by_staff_id_staff_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_type" ADD CONSTRAINT "exam_type_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scale" ADD CONSTRAINT "grade_scale_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_admission" ADD CONSTRAINT "student_admission_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_admission" ADD CONSTRAINT "student_admission_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_class_assignment" ADD CONSTRAINT "student_class_assignment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_class_assignment" ADD CONSTRAINT "student_class_assignment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_class_assignment" ADD CONSTRAINT "student_class_assignment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subject_selection" ADD CONSTRAINT "student_subject_selection_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subject_selection" ADD CONSTRAINT "student_subject_selection_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_subject_selection" ADD CONSTRAINT "student_subject_selection_previous_selection_id_student_subject_selection_id_fk" FOREIGN KEY ("previous_selection_id") REFERENCES "public"."student_subject_selection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_mark" ADD CONSTRAINT "subject_mark_student_class_assignment_id_student_class_assignment_id_fk" FOREIGN KEY ("student_class_assignment_id") REFERENCES "public"."student_class_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_mark" ADD CONSTRAINT "subject_mark_exam_type_id_exam_type_id_fk" FOREIGN KEY ("exam_type_id") REFERENCES "public"."exam_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_mark" ADD CONSTRAINT "subject_mark_entered_by_staff_id_staff_id_fk" FOREIGN KEY ("entered_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_portrait_file_id_files_id_fk" FOREIGN KEY ("portrait_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_national_identity_card_file_id_files_id_fk" FOREIGN KEY ("national_identity_card_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_position" ADD CONSTRAINT "staff_position_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_position" ADD CONSTRAINT "staff_position_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subject_assignment" ADD CONSTRAINT "teacher_subject_assignment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subject_assignment" ADD CONSTRAINT "teacher_subject_assignment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_verification" ADD CONSTRAINT "employment_verification_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_verification" ADD CONSTRAINT "employment_verification_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_verification" ADD CONSTRAINT "employment_verification_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_rotation_history" ADD CONSTRAINT "password_rotation_history_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_rotation_history" ADD CONSTRAINT "password_rotation_history_changed_by_staff_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualification" ADD CONSTRAINT "teacher_qualification_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualification" ADD CONSTRAINT "teacher_qualification_document_file_id_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualification" ADD CONSTRAINT "teacher_qualification_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_audit_log" ADD CONSTRAINT "inventory_audit_log_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_borrower_staff_id_staff_id_fk" FOREIGN KEY ("borrower_staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_borrower_student_id_student_id_fk" FOREIGN KEY ("borrower_student_id") REFERENCES "public"."student"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_borrowed_by_staff_id_staff_id_fk" FOREIGN KEY ("borrowed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow" ADD CONSTRAINT "inventory_borrow_returned_by_staff_id_staff_id_fk" FOREIGN KEY ("returned_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow_unit" ADD CONSTRAINT "inventory_borrow_unit_borrow_id_inventory_borrow_id_fk" FOREIGN KEY ("borrow_id") REFERENCES "public"."inventory_borrow"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_borrow_unit" ADD CONSTRAINT "inventory_borrow_unit_unit_id_inventory_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_unit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_previous_custodian_staff_id_staff_id_fk" FOREIGN KEY ("previous_custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_new_custodian_staff_id_staff_id_fk" FOREIGN KEY ("new_custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_previous_manager_staff_id_staff_id_fk" FOREIGN KEY ("previous_manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_new_manager_staff_id_staff_id_fk" FOREIGN KEY ("new_manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_custody_history" ADD CONSTRAINT "inventory_custody_history_changed_by_staff_id_staff_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_requested_by_staff_id_staff_id_fk" FOREIGN KEY ("requested_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_approved_by_staff_id_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_finalized_by_staff_id_staff_id_fk" FOREIGN KEY ("finalized_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal" ADD CONSTRAINT "inventory_disposal_cancelled_by_staff_id_staff_id_fk" FOREIGN KEY ("cancelled_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal_status_history" ADD CONSTRAINT "inventory_disposal_status_history_disposal_id_inventory_disposal_id_fk" FOREIGN KEY ("disposal_id") REFERENCES "public"."inventory_disposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal_status_history" ADD CONSTRAINT "inventory_disposal_status_history_changed_by_staff_id_staff_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal_unit" ADD CONSTRAINT "inventory_disposal_unit_disposal_id_inventory_disposal_id_fk" FOREIGN KEY ("disposal_id") REFERENCES "public"."inventory_disposal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_disposal_unit" ADD CONSTRAINT "inventory_disposal_unit_unit_id_inventory_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_unit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue" ADD CONSTRAINT "inventory_issue_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue" ADD CONSTRAINT "inventory_issue_issued_by_staff_id_staff_id_fk" FOREIGN KEY ("issued_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_unit" ADD CONSTRAINT "inventory_issue_unit_issue_id_inventory_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."inventory_issue"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_issue_unit" ADD CONSTRAINT "inventory_issue_unit_unit_id_inventory_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_unit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_category_id_inventory_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_created_by_staff_id_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_manager_staff_id_staff_id_fk" FOREIGN KEY ("manager_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_custodian_staff_id_staff_id_fk" FOREIGN KEY ("custodian_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit" ADD CONSTRAINT "inventory_unit_item_id_inventory_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_teacher_history_class_idx" ON "class_teacher_assignment_history" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_teacher_history_year_idx" ON "class_teacher_assignment_history" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "class_year_idx" ON "class" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "class_grade_idx" ON "class" USING btree ("grade_level");--> statement-breakpoint
CREATE INDEX "gsc_year_idx" ON "grade_subject_config" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "gsc_grade_idx" ON "grade_subject_config" USING btree ("grade_level");--> statement-breakpoint
CREATE INDEX "gsc_basket_idx" ON "grade_subject_config" USING btree ("basket_category");--> statement-breakpoint
CREATE INDEX "short_leave_usage_year_idx" ON "short_leave_usage" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "teacher_attendance_staff_idx" ON "teacher_attendance" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "teacher_attendance_date_idx" ON "teacher_attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "teacher_attendance_year_idx" ON "teacher_attendance" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "teacher_period_absence_attendance_idx" ON "teacher_period_absence" USING btree ("teacher_attendance_id");--> statement-breakpoint
CREATE INDEX "teacher_period_absence_substitute_idx" ON "teacher_period_absence" USING btree ("substitute_staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_providerId_accountId_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "files_userId_idx" ON "files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_year_idx" ON "class_period_assignment" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_class_idx" ON "class_period_assignment" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_staff_idx" ON "class_period_assignment" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "class_period_assignment_subject_idx" ON "class_period_assignment" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "leave_entitlement_year_idx" ON "leave_entitlement" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "leave_request_staff_idx" ON "leave_request" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "leave_request_status_idx" ON "leave_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_request_deputy_status_idx" ON "leave_request" USING btree ("deputy_status");--> statement-breakpoint
CREATE INDEX "leave_request_final_status_idx" ON "leave_request" USING btree ("final_status");--> statement-breakpoint
CREATE INDEX "leave_request_start_date_idx" ON "leave_request" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "leave_request_year_idx" ON "leave_request" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "exam_type_year_idx" ON "exam_type" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "exam_type_category_idx" ON "exam_type" USING btree ("category");--> statement-breakpoint
CREATE INDEX "exam_type_grade_idx" ON "exam_type" USING btree ("grade_level");--> statement-breakpoint
CREATE INDEX "grade_scale_year_idx" ON "grade_scale" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "grade_scale_subject_idx" ON "grade_scale" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "student_admission_number_idx" ON "student" USING btree ("admission_number");--> statement-breakpoint
CREATE INDEX "student_name_idx" ON "student" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "student_admission_type_idx" ON "student" USING btree ("admission_type");--> statement-breakpoint
CREATE INDEX "sa_student_idx" ON "student_admission" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sa_year_idx" ON "student_admission" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "sa_type_idx" ON "student_admission" USING btree ("admission_type");--> statement-breakpoint
CREATE INDEX "sca_student_idx" ON "student_class_assignment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sca_year_idx" ON "student_class_assignment" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "sca_class_idx" ON "student_class_assignment" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "sss_student_idx" ON "student_subject_selection" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sss_year_idx" ON "student_subject_selection" USING btree ("academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sss_active_unique" ON "student_subject_selection" USING btree ("student_id","academic_year_id","basket_category") WHERE "student_subject_selection"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "sm_assignment_idx" ON "subject_mark" USING btree ("student_class_assignment_id");--> statement-breakpoint
CREATE INDEX "sm_exam_idx" ON "subject_mark" USING btree ("exam_type_id");--> statement-breakpoint
CREATE INDEX "sm_subject_idx" ON "subject_mark" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "sm_entered_by_idx" ON "subject_mark" USING btree ("entered_by_staff_id");--> statement-breakpoint
CREATE INDEX "staff_email_idx" ON "staff" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_nic_idx" ON "staff" USING btree ("nic");--> statement-breakpoint
CREATE INDEX "staff_appointment_type_idx" ON "staff" USING btree ("appointment_type");--> statement-breakpoint
CREATE INDEX "staff_employment_status_idx" ON "staff" USING btree ("employment_status");--> statement-breakpoint
CREATE INDEX "staff_teacher_service_no_idx" ON "staff" USING btree ("teacher_service_no");--> statement-breakpoint
CREATE INDEX "staff_position_staff_idx" ON "staff_position" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_position_year_idx" ON "staff_position" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "teacher_subject_assignment_staff_year_idx" ON "teacher_subject_assignment" USING btree ("staff_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "employment_verification_staff_idx" ON "employment_verification" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "employment_verification_status_idx" ON "employment_verification" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employment_verification_type_idx" ON "employment_verification" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "password_rotation_staff_idx" ON "password_rotation_history" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "password_rotation_changed_by_idx" ON "password_rotation_history" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "teacher_qualification_staff_idx" ON "teacher_qualification" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "teacher_qualification_doc_status_idx" ON "teacher_qualification" USING btree ("document_status");--> statement-breakpoint
CREATE INDEX "inventory_audit_log_entity_type_idx" ON "inventory_audit_log" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "inventory_audit_log_entity_idx" ON "inventory_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "inventory_audit_log_actor_staff_idx" ON "inventory_audit_log" USING btree ("actor_staff_id");--> statement-breakpoint
CREATE INDEX "inventory_audit_log_created_at_idx" ON "inventory_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_borrow_borrower_staff_id_idx" ON "inventory_borrow" USING btree ("borrower_staff_id");--> statement-breakpoint
CREATE INDEX "inventory_borrow_borrower_student_id_idx" ON "inventory_borrow" USING btree ("borrower_student_id");--> statement-breakpoint
CREATE INDEX "inventory_borrow_item_id_idx" ON "inventory_borrow" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_borrow_status_expected_return_idx" ON "inventory_borrow" USING btree ("status","expected_return_date");--> statement-breakpoint
CREATE INDEX "inventory_borrow_unit_unit_id_idx" ON "inventory_borrow_unit" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_borrow_unit_active_unique" ON "inventory_borrow_unit" USING btree ("unit_id") WHERE "inventory_borrow_unit"."released_at" is null;--> statement-breakpoint
CREATE INDEX "inventory_custody_history_item_id_idx" ON "inventory_custody_history" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_custody_history_changed_at_idx" ON "inventory_custody_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "inventory_disposal_item_id_idx" ON "inventory_disposal" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_disposal_status_created_at_idx" ON "inventory_disposal" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inventory_disposal_requested_at_idx" ON "inventory_disposal" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "inventory_disposal_status_history_disposal_id_idx" ON "inventory_disposal_status_history" USING btree ("disposal_id");--> statement-breakpoint
CREATE INDEX "inventory_disposal_status_history_created_at_idx" ON "inventory_disposal_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_disposal_unit_unit_id_idx" ON "inventory_disposal_unit" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_disposal_unit_active_unique" ON "inventory_disposal_unit" USING btree ("unit_id") WHERE "inventory_disposal_unit"."released_at" is null;--> statement-breakpoint
CREATE INDEX "inventory_issue_item_id_idx" ON "inventory_issue" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_issue_issued_at_idx" ON "inventory_issue" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "inventory_item_category_idx" ON "inventory_item" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "inventory_item_manager_staff_idx" ON "inventory_item" USING btree ("manager_staff_id");--> statement-breakpoint
CREATE INDEX "inventory_item_custodian_staff_idx" ON "inventory_item" USING btree ("custodian_staff_id");--> statement-breakpoint
CREATE INDEX "inventory_item_deleted_at_idx" ON "inventory_item" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "inventory_item_name_lower_idx" ON "inventory_item" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "inventory_transaction_item_id_idx" ON "inventory_transaction" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_transaction_action_created_at_idx" ON "inventory_transaction" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "inventory_transaction_created_at_idx" ON "inventory_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_unit_item_id_idx" ON "inventory_unit" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "inventory_unit_status_created_at_idx" ON "inventory_unit" USING btree ("status","created_at");