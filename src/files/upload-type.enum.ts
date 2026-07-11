/**
 * Defines the type of document being uploaded.
 * Each type maps to a specific folder path in R2.
 *
 * All uploads use a deterministic key ("document.{ext}") so re-uploading
 * the same document type overwrites the existing R2 object — no orphan files.
 *
 * Folder structure in R2:
 *   employees/{userId}/kyc/aadhar/document.{ext}
 *   employees/{userId}/kyc/pan/document.{ext}
 *   employees/{userId}/kyc/salary-slip/document.{ext}
 *   employees/{userId}/kyc/other/document.{ext}
 *   employees/{userId}/selfie/document.{ext}
 *   employees/{userId}/profile/document.{ext}
 *
 * Note: membership payments are handled by Razorpay — no screenshot upload needed.
 */
export enum UploadType {
  KYC_AADHAR = 'kyc_aadhar',
  KYC_PAN = 'kyc_pan',
  KYC_SALARY_SLIP = 'kyc_salary_slip',
  KYC_OTHER = 'kyc_other',
  SELFIE = 'selfie',
  PROFILE_PHOTO = 'profile_photo',
}

/** Maps an UploadType to its R2 subfolder path segment. */
export const UPLOAD_TYPE_FOLDER: Record<UploadType, string> = {
  [UploadType.KYC_AADHAR]: 'kyc/aadhar',
  [UploadType.KYC_PAN]: 'kyc/pan',
  [UploadType.KYC_SALARY_SLIP]: 'kyc/salary-slip',
  [UploadType.KYC_OTHER]: 'kyc/other',
  [UploadType.SELFIE]: 'selfie',
  [UploadType.PROFILE_PHOTO]: 'profile',
};
