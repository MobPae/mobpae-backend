/**
 * Defines the type of document being uploaded.
 * Each type maps to a specific folder path in R2 (and local disk).
 *
 * Folder structure in R2:
 *   employees/{userId}/kyc/aadhar/
 *   employees/{userId}/kyc/pan/
 *   employees/{userId}/kyc/salary-slip/
 *   employees/{userId}/kyc/other/
 *   employees/{userId}/selfie/
 *   employees/{userId}/profile/
 *   membership/{userId}/screenshots/
 *   legal/                            ← manually uploaded static files, not via this enum
 */
export enum UploadType {
  KYC_AADHAR = 'kyc_aadhar',
  KYC_PAN = 'kyc_pan',
  KYC_SALARY_SLIP = 'kyc_salary_slip',
  KYC_OTHER = 'kyc_other',
  SELFIE = 'selfie',
  PROFILE_PHOTO = 'profile_photo',
  MEMBERSHIP_SCREENSHOT = 'membership_screenshot',
}

/** Maps an UploadType to its R2 subfolder path segment. */
export const UPLOAD_TYPE_FOLDER: Record<UploadType, string> = {
  [UploadType.KYC_AADHAR]: 'kyc/aadhar',
  [UploadType.KYC_PAN]: 'kyc/pan',
  [UploadType.KYC_SALARY_SLIP]: 'kyc/salary-slip',
  [UploadType.KYC_OTHER]: 'kyc/other',
  [UploadType.SELFIE]: 'selfie',
  [UploadType.PROFILE_PHOTO]: 'profile',
  [UploadType.MEMBERSHIP_SCREENSHOT]: 'membership/screenshots',
};
