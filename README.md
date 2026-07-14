MobPae Backend is the core API service powering the MobPae salary advance platform.

MobPae enables employees to access a portion of their earned salary before payday while providing employers and administrators with tools to manage approvals, platform fees, disbursals, repayments, and settlements.

---

## Tech Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication
- Swagger API Documentation
- Docker

---

## Core Modules

### Authentication

- Login
- Refresh tokens
- Session management
- Role based access control
- Employee
- Employer
- Admin

### Employee Management

- Employee onboarding
- Employee activation
- Employee profile management

### Employer Management

- Employer onboarding
- Employer activation workflow
- Employer payroll configuration
- Risk status monitoring

### Loan Applications

- Salary advance request creation
- Eligibility and preview
- Employer approval
- Employer rejection
- Admin approval
- Request tracking
- Repayment projections

### Platform Fees

- Request-scoped platform fee creation
- Razorpay order creation
- Payment verification
- Fee status tracking

### KYC

- PAN upload
- Aadhaar upload
- Salary slip upload
- Verification workflow

### Bank Accounts

- Employee bank account management
- Verification tracking

### Disbursals

- Admin disbursal processing
- Disbursal tracking

### Repayments

- Automatic repayment scheduling
- Interest calculation
- Payroll recovery support

### Payroll

- Payroll recovery processing
- Employer payroll settings
- Recovery summaries

### Employer Settlements

- Settlement generation
- Outstanding balance tracking
- Risk monitoring
- Settlement payment tracking

### Notifications

- System notifications
- Request approval notifications
- Request rejection notifications

### Settings

- Advance salary configuration
- Interest configuration
- Employer grace period configuration
- Platform fee configuration through loan product pricing rules

---

## Business Flow

### Employer Onboarding

1. Employer submits enquiry
2. Admin reviews enquiry
3. Admin creates employer account
4. Employer account is activated

### Employee Onboarding

1. Employer creates employee
2. Employee activates account
3. Employee completes KYC
4. Employee adds bank account

### Salary Advance Flow

1. Employee submits salary advance request
2. System validates:
   - KYC
   - Bank verification
   - Salary eligibility
   - Existing active requests
3. Employer reviews request
4. Employer approves or rejects request
5. If approved, employee pays the request-scoped platform fee
6. Admin approves and disburses funds
7. Repayment schedule is created

### Repayment Flow

1. Repayment is scheduled automatically
2. Payroll recovery date is calculated
3. Recovery is processed
4. Salary request is marked repaid

### Settlement Flow

1. Payroll recovery is processed
2. Settlement is generated
3. Employer owes MobPae
4. Employer payment is received
5. Admin marks settlement paid

---

## Project Structure

src/

- auth/
- employees/
- employers/
- loan-applications/
- platform-fees/
- kyc/
- bank-accounts/
- disbursals/
- repayments/
- payroll/
- employer-settlements/
- notifications/
- settings/
- prisma/

---

## Environment Variables

Create a `.env` file.

```env
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=
PORT=
```

---

## Installation

Install dependencies:

```bash
npm install
```

Generate Prisma Client:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev
```

Start development server:

```bash
npm run start:dev
```

Build application:

```bash
npm run build
```

---

## API Documentation

Swagger is available at:

```text
/api-docs
```

after starting the application.

---

## Roles

### Employee

- Manage profile
- Upload KYC
- Manage bank account
- Create salary advance requests
- Pay platform fee after employer approval
- Track repayments

### Employer

- View employees
- Approve salary advance requests
- Reject salary advance requests
- Configure payroll settings
- View settlements

### Admin

- Approve employers
- Verify KYC
- Verify bank accounts
- Process disbursals
- Manage settlements
- Configure system settings
- Monitor platform fee payments

---

## Current MVP Scope

Included in Version 1.0:

- Authentication
- Employee Management
- Employer Management
- Salary Advances
- Request-scoped Platform Fees
- KYC Verification
- Bank Verification
- Disbursals
- Repayments
- Payroll Recovery
- Employer Settlements
- Notifications
- Settings

Planned for Future Releases:

- Advanced Reporting
- Automated Settlement Collection
- Analytics Dashboard
- Additional loan products

---

## Version

Current Version: 1.0
