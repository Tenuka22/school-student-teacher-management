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
CREATE TABLE "subject_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"subject_key" text NOT NULL,
	"grade_level" integer NOT NULL,
	"class_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subject_assignment_unique" UNIQUE("staff_id","academic_year_id","subject_key","class_id")
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
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
	"appointment_type" text,
	"appointment_date" text,
	"teacher_service_no" text,
	"employment_status" text,
	"portrait_file_id" text,
	"national_identity_card_file_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email"),
	CONSTRAINT "staff_nic_unique" UNIQUE("nic")
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
ALTER TABLE "class" ADD CONSTRAINT "class_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_homeroom_teacher_id_staff_id_fk" FOREIGN KEY ("homeroom_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_sub_homeroom_teacher_id_staff_id_fk" FOREIGN KEY ("sub_homeroom_teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_subject_config" ADD CONSTRAINT "grade_subject_config_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_assignment" ADD CONSTRAINT "subject_assignment_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_assignment" ADD CONSTRAINT "subject_assignment_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_assignment" ADD CONSTRAINT "subject_assignment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "staff" ADD CONSTRAINT "staff_portrait_file_id_files_id_fk" FOREIGN KEY ("portrait_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_national_identity_card_file_id_files_id_fk" FOREIGN KEY ("national_identity_card_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_position" ADD CONSTRAINT "staff_position_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_position" ADD CONSTRAINT "staff_position_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_verification" ADD CONSTRAINT "employment_verification_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_verification" ADD CONSTRAINT "employment_verification_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_verification" ADD CONSTRAINT "employment_verification_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_rotation_history" ADD CONSTRAINT "password_rotation_history_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_rotation_history" ADD CONSTRAINT "password_rotation_history_changed_by_staff_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualification" ADD CONSTRAINT "teacher_qualification_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualification" ADD CONSTRAINT "teacher_qualification_document_file_id_files_id_fk" FOREIGN KEY ("document_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualification" ADD CONSTRAINT "teacher_qualification_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_year_idx" ON "class" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "class_grade_idx" ON "class" USING btree ("grade_level");--> statement-breakpoint
CREATE INDEX "gsc_year_idx" ON "grade_subject_config" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "gsc_grade_idx" ON "grade_subject_config" USING btree ("grade_level");--> statement-breakpoint
CREATE INDEX "gsc_basket_idx" ON "grade_subject_config" USING btree ("basket_category");--> statement-breakpoint
CREATE INDEX "subject_assignment_staff_idx" ON "subject_assignment" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "subject_assignment_year_idx" ON "subject_assignment" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "subject_assignment_subject_idx" ON "subject_assignment" USING btree ("subject_key");--> statement-breakpoint
CREATE UNIQUE INDEX "account_providerId_accountId_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "files_userId_idx" ON "files" USING btree ("user_id");--> statement-breakpoint
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
CREATE INDEX "staff_position_staff_idx" ON "staff_position" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_position_year_idx" ON "staff_position" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "employment_verification_staff_idx" ON "employment_verification" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "employment_verification_status_idx" ON "employment_verification" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employment_verification_type_idx" ON "employment_verification" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "password_rotation_staff_idx" ON "password_rotation_history" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "password_rotation_changed_by_idx" ON "password_rotation_history" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "teacher_qualification_staff_idx" ON "teacher_qualification" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "teacher_qualification_doc_status_idx" ON "teacher_qualification" USING btree ("document_status");