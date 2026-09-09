import { z } from 'zod';
import {
  TRAINING_TARGET_GROUP_VALUES, GUARDS_TARGET_GROUP,
  FACILITATOR_TYPE_VALUES, INTERNAL_FACILITATOR, EXTERNAL_FACILITATOR,
} from '../constants/training';

// ── Recruitment ────────────────────────────────────────────────────────────────

export const CreateApplicantSchema = z.object({
  firstName:   z.string().min(1).max(100),
  lastName:    z.string().min(1).max(100),
  phone:       z.string().regex(/^\+?[0-9]{10,15}$/),
  email:       z.string().email().optional(),
  nationalId:  z.string().optional(),
  dateOfBirth: z.string().datetime().optional(),
  address:     z.string().optional(),
  source:      z.enum(['WALK_IN', 'REFERRAL', 'ADVERT', 'OTHER']).default('WALK_IN'),
});
export type CreateApplicantInput = z.infer<typeof CreateApplicantSchema>;

export const APPLICANT_STAGES = [
  'APPLICATION_RECEIVED',
  'SCREENING',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_DONE',
  'OFFER_MADE',
  'ACCEPTED',
  'REJECTED',
  'ONBOARDING',
] as const;

export const UpdateApplicantStageSchema = z.object({
  stage:           z.enum(APPLICANT_STAGES),
  interviewDate:   z.string().datetime().optional(),
  interviewNotes:  z.string().optional(),
  offerSalary:     z.number().int().positive().optional(),
  rejectionReason: z.string().optional(),
});
export type UpdateApplicantStageInput = z.infer<typeof UpdateApplicantStageSchema>;

// ── Training ───────────────────────────────────────────────────────────────────

export const CreateTrainingSessionSchema = z.object({
  title:         z.string().min(3),
  description:   z.string().optional(),
  location:      z.string().optional(),
  scheduledAt:   z.string().datetime(),
  durationHours: z.coerce.number().positive().default(1),
  passMark:      z.coerce.number().int().min(0).max(100).default(70),

  /** GUARDS or STAFF. Decides which of the two attendee lists may be used. */
  targetGroup:   z.enum(TRAINING_TARGET_GROUP_VALUES).default(GUARDS_TARGET_GROUP),

  facilitatorType:   z.enum(FACILITATOR_TYPE_VALUES).default(INTERNAL_FACILITATOR),
  /** Required for an external facilitator; copied from the user for an internal one. */
  facilitatorName:   z.string().max(120).optional(),
  facilitatorUserId: z.string().min(1).optional().nullable(),

  guardIds: z.array(z.string().min(1)).default([]),
  /** Office staff, for a STAFF session. */
  staffIds: z.array(z.string().min(1)).default([]),
})
  .refine(
    (d) => (d.targetGroup === GUARDS_TARGET_GROUP ? d.guardIds.length > 0 : d.staffIds.length > 0),
    { message: 'Select at least one attendee for this session.', path: ['guardIds'] },
  )
  .refine(
    // Attendees of the wrong kind are rejected rather than quietly dropped: a
    // session that silently trained nobody it was told to is worse than an error.
    (d) => (d.targetGroup === GUARDS_TARGET_GROUP ? d.staffIds.length === 0 : d.guardIds.length === 0),
    { message: 'Attendees do not match who this session is for.', path: ['staffIds'] },
  )
  .refine(
    (d) => d.facilitatorType !== INTERNAL_FACILITATOR || !!d.facilitatorUserId,
    { message: 'Choose the staff member facilitating this session.', path: ['facilitatorUserId'] },
  )
  .refine(
    (d) => d.facilitatorType !== EXTERNAL_FACILITATOR || !!d.facilitatorName?.trim(),
    { message: 'Enter the name of the external facilitator.', path: ['facilitatorName'] },
  );
export type CreateTrainingSessionInput = z.infer<typeof CreateTrainingSessionSchema>;

export const RecordTrainingResultsSchema = z.object({
  results: z
    .array(
      z
        .object({
          /** One of the two, matching what kind of session this is. */
          guardId:  z.string().min(1).optional(),
          userId:   z.string().min(1).optional(),
          attended: z.boolean(),
          score:    z.number().int().min(0).max(100).optional(),
          notes:    z.string().optional(),
        })
        .refine((r) => !!r.guardId !== !!r.userId, {
          message: 'Each result names exactly one attendee.',
        }),
    )
    .min(1),
});
export type RecordTrainingResultsInput = z.infer<typeof RecordTrainingResultsSchema>;

// ── Leave ──────────────────────────────────────────────────────────────────────

export const CreateLeaveRequestSchema = z
  .object({
    guardId:   z.string().min(1),
    type:      z.enum(['ANNUAL', 'SICK', 'EMERGENCY', 'MATERNITY', 'PATERNITY']),
    startDate: z.string().datetime(),
    endDate:   z.string().datetime(),
    reason:    z.string().min(10),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'End date must be after start date',
  });
export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;

export const ApproveLeaveSchema = z
  .object({
    action:          z.enum(['APPROVE', 'REJECT']),
    rejectionReason: z.string().min(10).optional(),
  })
  .refine((data) => data.action === 'APPROVE' || !!data.rejectionReason, {
    message: 'Rejection reason required when rejecting',
  });
export type ApproveLeaveInput = z.infer<typeof ApproveLeaveSchema>;

// ── Letter Templates ───────────────────────────────────────────────────────────

export const LETTER_TYPES = [
  'VERBAL_WARNING',
  'FIRST_WARNING',
  'FINAL_WARNING',
  'TERMINATION_NOTICE',
  'APPOINTMENT_LETTER',
  'CONTRACT_EXTENSION',
  'CONFIRMATION_OF_EMPLOYMENT',
  'SALARY_REVIEW',
  // The exit and leave paperwork STAP issues on headed paper.
  'DESERTION_NOTICE',
  'RESIGNATION_ACCEPTANCE',
  'SICK_LEAVE_APPROVAL',
  'REINSTATEMENT_LETTER',
  'EXPULSION_LETTER',
  'CLEARANCE_FORM',
] as const;

export const SaveLetterTemplateSchema = z.object({
  name:       z.string().min(3),
  letterType: z.enum(LETTER_TYPES),
  content:    z.string().min(50).describe('HTML template content'),
});
export type SaveLetterTemplateInput = z.infer<typeof SaveLetterTemplateSchema>;

// ── Generated Letter schemas ────────────────────────────────────────────────────

export const GENERATED_LETTER_TYPES = {
  WARNING:       'Warning Letter',
  SUSPENSION:    'Suspension Letter',
  COMMENDATION:  'Commendation Letter',
  TERMINATION:   'Termination Letter',
  REINSTATEMENT: 'Reinstatement Letter',
  GENERAL:       'General Letter',
} as const;

export type GeneratedLetterType = keyof typeof GENERATED_LETTER_TYPES;

// Disciplinary letters are generated from a specific DisciplinaryRecord and can
// only be created when one exists. HR letters are not tied to any disciplinary
// record and are generated from the guard profile's dedicated Letters tab.
export const DISCIPLINARY_LETTER_TYPES = ['WARNING', 'SUSPENSION', 'TERMINATION'] as const;
export const HR_LETTER_TYPES = ['COMMENDATION', 'REINSTATEMENT', 'GENERAL', 'COMMITMENT_AGREEMENT'] as const;

// These two types are assembled from dedicated structured form fields (dates,
// periods, reasons) into HTML containing tables/inline styles. A rich-text
// editor's schema can't round-trip that losslessly, so their body is never
// free-text edited — fix them by regenerating with corrected fields instead.
export const STRUCTURED_LETTER_TYPES = ['COMMITMENT_AGREEMENT', 'SUSPENSION'] as const;

// LetterTemplate rows (see LETTER_TYPES above) predate the current 7-type
// GeneratedLetter taxonomy and use their own, more granular type strings —
// this maps a real letter type to the eligible template(s) HR can load from
// when composing that type. SUSPENSION and COMMITMENT_AGREEMENT have no entry:
// both are assembled from structured fields (see STRUCTURED_LETTER_TYPES)
// rather than loaded from an editable template.
export const TEMPLATE_TYPES_BY_LETTER_TYPE: Record<string, readonly string[]> = {
  WARNING:     ['VERBAL_WARNING', 'FIRST_WARNING', 'FINAL_WARNING'],
  // Desertion and expulsion both end the employment, so they compose as a
  // termination rather than as a general letter.
  TERMINATION: ['TERMINATION_NOTICE', 'DESERTION_NOTICE', 'EXPULSION_LETTER'],
  REINSTATEMENT: ['REINSTATEMENT_LETTER'],
  GENERAL:     [
    'APPOINTMENT_LETTER', 'CONTRACT_EXTENSION', 'CONFIRMATION_OF_EMPLOYMENT', 'SALARY_REVIEW',
    'RESIGNATION_ACCEPTANCE', 'SICK_LEAVE_APPROVAL', 'CLEARANCE_FORM',
  ],
};

export const DISCIPLINARY_LETTER_LABELS = {
  WARNING:     '⚠️ Warning Letter',
  SUSPENSION:  '🔴 Suspension Letter',
  TERMINATION: '❌ Termination Letter',
} as const;

export const HR_LETTER_LABELS = {
  COMMENDATION:          '🌟 Commendation Letter',
  REINSTATEMENT:         '✅ Reinstatement Letter',
  GENERAL:               '📄 General Letter',
  COMMITMENT_AGREEMENT:  '📋 Commitment Agreement',
} as const;

export const LETTER_APPROVAL_STATUS = {
  PENDING:  'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
} as const;

export const GenerateLetterSchema = z.object({
  subjectType: z.enum(['GUARD', 'STAFF', 'APPLICANT']),
  subjectId:   z.string().min(1),
  subjectName: z.string().min(1),
  title:       z.string().min(1).max(200),
  body:        z.string().min(10),
  letterType:  z.enum(['WARNING', 'SUSPENSION', 'COMMENDATION', 'TERMINATION', 'REINSTATEMENT', 'GENERAL', 'COMMITMENT_AGREEMENT']).default('GENERAL'),
  // Links a disciplinary-type letter to the specific incident it was generated
  // from. Left unset (null) for HR letters, which are never linked.
  disciplinaryRecordId: z.string().optional().nullable(),
});
export type GenerateLetterInput = z.infer<typeof GenerateLetterSchema>;

export const ApproveLetterSchema = z.object({
  approvalStatus: z.enum(['APPROVED', 'REJECTED']),
  approvalNotes:  z.string().max(1000).optional(),
}).refine(
  data => data.approvalStatus !== 'REJECTED' || (!!data.approvalNotes && data.approvalNotes.trim().length > 0),
  { message: 'A reason is required when rejecting a letter.', path: ['approvalNotes'] },
);
export type ApproveLetterInput = z.infer<typeof ApproveLetterSchema>;

export const UpdateLetterBodySchema = z.object({
  body: z.string().min(10),
});
export type UpdateLetterBodyInput = z.infer<typeof UpdateLetterBodySchema>;

export interface GeneratedLetterResponse {
  id:             string;
  subjectType:    string;
  subjectId:      string;
  subjectName:    string;
  title:          string;
  body:           string;
  letterType:     string;
  disciplinaryRecordId: string | null;
  generatedBy:    { id: string; name: string; role: string };
  generatedAt:    string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy:     { id: string; name: string } | null;
  approvedAt:     string | null;
  approvalNotes:  string | null;
  isActive:       boolean;
  createdAt:      string;
}

// ── Document verification + vetting schemas ────────────────────────────────────

export const DocumentVerificationSchema = z.object({
  relativesIdVerified:  z.boolean(),
  nationalIdVerified:   z.boolean(),
  academicDocsVerified: z.boolean(),
});
export type DocumentVerificationInput = z.infer<typeof DocumentVerificationSchema>;

export const VettingRequirementsSchema = z.object({
  applicationLetterUploaded: z.boolean().optional(),
  contractSigned:            z.boolean().optional(),
  vettingFormUploaded:       z.boolean().optional(),
  contractSignedAt:          z.string().datetime().optional(),
});
export type VettingRequirementsInput = z.infer<typeof VettingRequirementsSchema>;

// ── Response Interfaces ────────────────────────────────────────────────────────

export interface ApplicantResponse {
  id:                 string;
  firstName:          string;
  lastName:           string;
  fullName:           string;
  phone:              string;
  email:              string | null;
  source:             string;
  stage:              string;
  interviewDate:      string | null;
  offerSalary:        number | null;
  assignedTo:         { id: string; name: string } | null;
  convertedToGuardId: string | null;
  daysInPipeline:     number;
  createdAt:          string;
  // Document verification
  relativesIdVerified:       boolean;
  relativesIdVerifiedAt:     string | null;
  nationalIdVerified:        boolean;
  nationalIdVerifiedAt:      string | null;
  academicDocsVerified:      boolean;
  academicDocsVerifiedAt:    string | null;
  allDocumentsVerified:      boolean;
  // Vetting requirements
  applicationLetterUploaded: boolean;
  applicationLetterPath:     string | null;
  contractSigned:            boolean;
  contractSignedAt:          string | null;
  vettingFormUploaded:       boolean;
  vettingFormPath:           string | null;
  allVettingComplete:        boolean;
  // Training
  trainingSessionId:         string | null;
  trainingStartedAt:         string | null;
  trainingCompletedAt:       string | null;
  // Joining
  shoeDeductionCreated:      boolean;
}

export interface PipelineSummary {
  byStage:        { stage: string; count: number }[];
  totalActive:    number;
  conversionRate: number;
}

export interface TrainingSessionResponse {
  id:            string;
  title:         string;
  description:   string | null;
  location:      string | null;
  scheduledAt:   string;
  durationHours: number;
  passMark:      number;
  status:        string;

  targetGroup:     string;
  facilitatorType: string;
  /** Who ran it. Held as text as well as an id, so it survives a deactivated account. */
  facilitatorName: string | null;
  facilitatorUser: { id: string; name: string } | null;

  attendeeCount: number;
  passCount:     number;
  failCount:     number;
  /**
   * One entry per attendee, whichever kind. `guard` and `staff` are mutually
   * exclusive — a database constraint enforces that — so a renderer can switch
   * on whichever is present rather than trusting targetGroup.
   */
  attendees: {
    id:       string;
    guard:    { id: string; fullName: string } | null;
    staff:    { id: string; name: string; role: string; jobTitle: string | null } | null;
    attended: boolean;
    score:    number | null;
    passed:   boolean | null;
    notes:    string | null;
  }[];
}

export interface LeaveRequestResponse {
  id:              string;
  guard:           { id: string; fullName: string };
  type:            string;
  startDate:       string;
  endDate:         string;
  daysRequested:   number;
  reason:          string;
  status:          string;
  approvedBy:      { id: string; name: string } | null;
  approvedAt:      string | null;
  rejectionReason: string | null;
  createdAt:       string;
}

export interface LeaveBalance {
  annual:    { entitled: number; taken: number; remaining: number };
  sick:      { taken: number };
  emergency: { taken: number };
}

export interface LetterTemplateResponse {
  id:        string;
  name:      string;
  letterType: string;
  content:   string;
  version:   number;
  isActive:  boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
