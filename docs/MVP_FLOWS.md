# MobPae MVP Flows

## Auth Flow

1. User logs in with email and password.
2. Backend deactivates previous sessions for the user.
3. Backend creates one active session with a hashed refresh token.
4. Access token expires in 15 minutes.
5. Refresh token rotates on every refresh and expires after 30 days.
6. Logout or password change invalidates active sessions.

## Employer Enquiry Flow

1. Website submits `POST /employer-enquiries`.
2. Lead is stored with `NEW` status.
3. Enquiry acknowledgement email is sent.
4. Admin reviews leads from `GET /employer-enquiries`.

## Employer Onboarding Flow

1. Admin creates employer with `POST /employers`.
2. Employer is created as `PENDING`.
3. If `employerEnquiryId` is provided, enquiry becomes `ONBOARDED`.
4. If employer already exists for the enquiry email, the lead is linked instead of creating duplicates.

## Employer Activation Flow

1. Admin calls `PATCH /employers/:id/status`.
2. When status changes to `ACTIVE`, employer-approved email is sent.
3. Employer can log in only after activation.

## Employee Flow

1. Employer creates employee.
2. Employee receives credentials from employer.
3. Employee completes KYC, bank account, membership, and salary advance request setup.

## Salary Request Flow

1. Employee previews salary advance.
2. Employee submits request.
3. Employer approves or rejects.
4. Admin creates disbursal.
5. Admin disburses funds.
6. Repayment is scheduled against payroll date.

## Audit Coverage

Current audit logs cover authentication, employer creation/status, employee creation/update, salary request lifecycle, disbursal creation, and repayment creation.
