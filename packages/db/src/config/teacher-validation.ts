/**
 * Teacher validation configuration and helpers.
 * This module provides validation rules and utility functions for teacher data.
 */

import * as v from "valibot";

import { QUALIFICATION_LEVELS } from "../constants/teachers";
import type { QualificationLevel } from "../constants/teachers";
import {
  nicSchema as nicFormatSchema,
  slPhoneSchema as phoneFormatSchema,
  strongPasswordSchema as strongPasswordFormatSchema,
} from "../schema/primitives";
import { staffUpdateSchema } from "../schema/staff";

/** Camel-case hump, used to space out an appointment type for display. */
const SPACED_WORD_BOUNDARY = /(?<upper>[A-Z])/gu;

// ─── Password Validation ──────────────────────────────────────────────────────

/**
 * Validate password strength for admin-initiated password rotation.
 * Uses better-auth's password config as base, adds complexity requirements.
 */
export const validatePasswordStrength = (password: string): string | null => {
  const result = v.safeParse(strongPasswordFormatSchema, password);
  if (!result.success) {
    return result.issues[0]?.message ?? "Invalid password";
  }
  return null;
};

/**
 * Check if a password meets minimum requirements.
 * This is a quick check before submitting to better-auth's setUserPassword.
 */
export const isPasswordStrongEnough = (password: string): boolean =>
  validatePasswordStrength(password) === null;

// ─── NIC Validation ───────────────────────────────────────────────────────────

/**
 * Validate NIC number format (Sri Lankan National Identity Card).
 * Old format: 9 digits + V (e.g., 123456789V)
 * New format: 12 digits (e.g., 123456789012)
 */
export const validateNIC = (nic: string | undefined): string | null => {
  // Optional field
  if (!nic) {
    return null;
  }
  const result = v.safeParse(nicFormatSchema, nic);
  if (!result.success) {
    return result.issues[0]?.message ?? "Invalid NIC format";
  }
  return null;
};

// ─── Phone Validation ─────────────────────────────────────────────────────────

/**
 * Validate Sri Lankan phone number format.
 * Formats: +947X XXXXXXX or 07X XXXXXXX
 */
export const validatePhone = (phone: string | undefined): string | null => {
  // Optional field
  if (!phone) {
    return null;
  }
  const result = v.safeParse(phoneFormatSchema, phone);
  if (!result.success) {
    return result.issues[0]?.message ?? "Invalid phone number";
  }
  return null;
};

// ─── Experience Calculation ────────────────────────────────────────────────────

/**
 * Calculate years of teaching experience from appointment date.
 * This is DERIVED, not manually entered.
 *
 * @param appointmentDate - ISO date string (YYYY-MM-DD) or null
 * @param toYear - Optional year to calculate experience up to (defaults to current year)
 * @returns Years of experience, or null if no appointment date
 */
export const calculateYearsOfExperience = (
  appointmentDate: string | null | undefined,
  toYear: number = new Date().getFullYear()
): number | null => {
  if (!appointmentDate) {
    return null;
  }

  const startDate = new Date(appointmentDate);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  // End of the school year
  const endDate = new Date(toYear, 11, 31);

  let years = endDate.getFullYear() - startDate.getFullYear();
  const monthDiff = endDate.getMonth() - startDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && endDate.getDate() < startDate.getDate())
  ) {
    years -= 1;
  }

  return Math.max(0, years);
};

// ─── Qualification Helpers ─────────────────────────────────────────────────────

/**
 * Get the display label for a qualification level.
 */
export const getQualificationLabel = (
  qualification: QualificationLevel
): string => QUALIFICATION_LEVELS[qualification].label;

// ─── Staff Update Validation ──────────────────────────────────────────────────

/**
 * Validate staff update data.
 * Returns array of validation errors (empty if valid).
 */
export const validateStaffUpdate = (data: unknown): string[] => {
  const result = v.safeParse(staffUpdateSchema, data);
  if (result.success) {
    return [];
  }

  return result.issues.map((issue) => {
    const path = (issue.path ?? []).map((item) => String(item.key)).join(".");
    return `${path}: ${issue.message}`;
  });
};

// ─── Employment Type Info ─────────────────────────────────────────────────────

/**
 * Get the label for an appointment type.
 */
export const getAppointmentTypeLabel = (type: string): string =>
  type.charAt(0).toUpperCase() +
  type.slice(1).replaceAll(SPACED_WORD_BOUNDARY, " $<upper>");

/**
 * Get default employment status.
 */
export const getDefaultEmploymentStatus = (): string => "active";

// ─── Gender/Marital Status Helpers ───────────────────────────────────────────

/**
 * Validate gender value.
 */
export const validateGender = (gender: string | undefined): string | null => {
  if (!gender) {
    return null;
  }
  if (gender === "male" || gender === "female") {
    return gender;
  }
  return null;
};

/**
 * Validate marital status.
 */
export const validateMaritalStatus = (
  status: string | undefined
): string | null => {
  if (!status) {
    return null;
  }
  const validStatuses = ["single", "married", "divorced", "widowed"];
  if (validStatuses.includes(status)) {
    return status;
  }
  return null;
};

/**
 * Validate blood group.
 */
export const validateBloodGroup = (
  bloodGroup: string | undefined
): string | null => {
  if (!bloodGroup) {
    return null;
  }
  const validGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  if (validGroups.includes(bloodGroup)) {
    return bloodGroup;
  }
  return null;
};

/**
 * Validate Sri Lankan district.
 */
export const validateDistrict = (
  district: string | undefined
): string | null => {
  if (!district) {
    return null;
  }
  const validDistricts = [
    "amlapura",
    "anuradhapura",
    "badulla",
    "batticaloa",
    "colombo",
    "galle",
    "garuwa",
    "hambantota",
    "jaffna",
    "kalutara",
    "kandy",
    "kegalle",
    "kilinochchi",
    "mannar",
    "matale",
    "mathugama",
    "monaragala",
    "mullaitivu",
    "negombo",
    "puttalam",
    "ratnapura",
    "tirikovil",
    "trincomalee",
    "vavuniya",
    "kurunegala",
  ];
  if (validDistricts.includes(district)) {
    return district;
  }
  return null;
};
