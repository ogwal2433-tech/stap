import { z } from 'zod';

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
  trainerId:     z.string().min(1),
  location:      z.string().optional(),
  scheduledAt:   z.string().datetime(),
  durationHours: z.coerce.number().positive().default(1),
  passMark:      z.coerce.number().int().min(0).max(100).default(70),
  guardIds:      z.array(z.string().min(1)).min(1),
});
export type CreateTrainingSessionInput = z.infer<typeof CreateTrainingSessionSchema>;

export const RecordTrainingResultsSchema = z.object({
  results: z
    .array(
      z.object({
        guardId:  z.string().min(1),
        attended: z.boolean(),
        score:    z.number().int().min(0).max(100).optional(),
        notes:    z.string().optional(),
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
] as const;

export const SaveLetterTemplateSchema = z.object({
  name:       z.string().min(3),
  letterType: z.enum(LETTER_TYPES),
  content:    z.string().min(50).describe('HTML template content'),
});
export type SaveLetterTemplateInput = z.infer<typeof SaveLetterTemplateSchema>;

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
  trainer:       { id: string; name: string };
  location:      string | null;
  scheduledAt:   string;
  durationHours: number;
  passMark:      number;
  status:        string;
  attendeeCount: number;
  passCount:     number;
  failCount:     number;
  attendees: {
    guard:    { id: string; fullName: string };
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
