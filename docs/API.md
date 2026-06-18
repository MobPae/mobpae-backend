# MobPae MVP API

## Health

- `GET /health`
  - Returns service and database health.

## Authentication

- `POST /auth/login`
  - Body: `{ "email": "admin@mobpae.com", "password": "Admin@1234" }`
  - Returns `accessToken`, `refreshToken`, and `user`.
- `POST /auth/refresh`
  - Body: `{ "refreshToken": "..." }`
  - Rotates refresh token and returns a new access token.
- `POST /auth/logout`
  - Bearer token required.
  - Deactivates the current session.
- `POST /auth/forgot-password`
  - Body: `{ "email": "user@example.com" }`
  - Sends a 15-minute reset link when the user exists.
- `POST /auth/reset-password`
  - Body: `{ "token": "...", "newPassword": "NewPassword@123" }`
- `POST /auth/change-password`
  - Bearer token required.
  - Requires current password and invalidates active sessions.

## Employer Enquiries

- `POST /employer-enquiries`
  - Public lead capture.
- `GET /employer-enquiries`
  - Admin view of captured leads.

## Employers

- `POST /employers`
  - Admin creates a pending employer.
  - Optional `employerEnquiryId` links and marks a lead as `ONBOARDED`.
- `PATCH /employers/:id/status`
  - Admin activates or suspends an employer.
- `GET /employers`
- `GET /employers/:id`

## Employees

- `POST /employees`
  - Employer creates employee credentials.
- `GET /employees/employer`
- `GET /employees/me`
- `PATCH /employees/:id`
- `PATCH /employees/:id/activation`

## Salary Requests

- `POST /salary-requests/preview`
- `POST /salary-requests`
- `GET /salary-requests/my`
- `GET /salary-requests/employer`
- `POST /salary-requests/:id/approve`
- `POST /salary-requests/:id/reject`

## Disbursals And Repayments

- `POST /disbursals`
- `POST /disbursals/:id/disburse`
- `GET /repayments/my`
- `GET /repayments/employee/:employeeId`

## Setup Command

```bash
npx prisma db push
npx prisma db seed
npm run start:dev
```
