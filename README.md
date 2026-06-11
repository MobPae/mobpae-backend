MobPae Backend is the core API service powering the MobPae salary advance platform.

MobPae enables employees to access a portion of their earned salary before payday while providing employers and administrators with tools to manage approvals, disbursals, repayments, memberships, and settlements.

⸻

Tech Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- JWT Authentication
- Swagger API Documentation
- Docker

⸻

Core Modules

Authentication

- Login
- JWT Access Tokens
- Role Based Access Control
- Employee
- Employer
- Admin

Employee Management

- Employee onboarding
- Employee activation
- Employee profile management

Employer Management

- Employer onboarding
- Employer approval workflow
- Employer payroll configuration
- Risk status monitoring

Salary Requests

- Salary advance request creation
- Employer approval
- Employer rejection
- Request tracking
- Repayment projections

Membership

- Annual membership model
- Membership payment submission
- UTR reference tracking
- Screenshot upload
- Coupon support
- Admin approval workflow
- Membership renewal

KYC

- PAN upload
- Aadhaar upload
- Salary slip upload
- Verification workflow

Bank Accounts

- Employee bank account management
- Verification tracking

Disbursals

- Admin disbursal processing
- Disbursal tracking

Repayments

- Automatic repayment scheduling
- Interest calculation
- Payroll recovery support

Payroll

- Payroll recovery processing
- Employer payroll settings
- Recovery summaries

Employer Settlements

- Settlement generation
- Outstanding balance tracking
- Risk monitoring
- Settlement payment tracking

Notifications

- System notifications
- Request approval notifications
- Request rejection notifications

Settings

- Membership configuration
- Advance salary configuration
- Interest configuration
- Employer grace period configuration

⸻

Business Flow

Employer Onboarding

1. Employer submits enquiry
2. Admin reviews enquiry
3. Employer is approved
4. Employer account is activated

Employee Onboarding

1. Employer uploads employee
2. Employee activates account
3. Employee completes KYC
4. Employee adds bank account
5. Employee purchases membership

Membership Flow

1. Employee submits membership payment
2. Employee uploads screenshot and UTR
3. Optional coupon code applied
4. Admin reviews payment
5. Admin approves membership
6. Membership becomes active for configured validity period

Salary Advance Flow

1. Employee submits salary request
2. System validates:
   - Membership
   - KYC
   - Bank verification
   - Salary eligibility
3. Employer reviews request
4. Employer approves request
5. Admin disburses funds
6. Repayment schedule is created

Repayment Flow

1. Repayment scheduled automatically
2. Payroll recovery date calculated
3. Recovery processed
4. Salary request marked repaid

Settlement Flow

1. Payroll recovery processed
2. Settlement generated
3. Employer owes MobPae
4. Employer payment received
5. Admin marks settlement paid

⸻

Membership Coupons

Supported features:

- Fixed amount discounts
- Usage limits
- Expiry dates
- Active/inactive status

Example:

FIRST10

- Discount: ₹100
- Usage Limit: 10

EARLYBIRD

- Discount: ₹50
- Unlimited Usage

Coupon usage is consumed only after membership approval.

⸻

Project Structure

src/

- auth/
- employees/
- employers/
- salary-requests/
- memberships/
- kyc/
- bank-accounts/
- disbursals/
- repayments/
- payroll/
- employer-settlements/
- notifications/
- settings/
- prisma/

⸻

Environment Variables

Create a .env file.

DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=
PORT=

⸻

Installation

Install dependencies:

npm install

Generate Prisma Client:

npx prisma generate

Run migrations:

npx prisma migrate dev

Start development server:

npm run start:dev

Build application:

npm run build

⸻

API Documentation

Swagger is available at:

/api-docs

after starting the application.

⸻

Roles

Employee

- Manage profile
- Upload KYC
- Manage bank account
- Purchase membership
- Create salary requests
- Track repayments

Employer

- View employees
- Approve salary requests
- Reject salary requests
- Configure payroll settings
- View settlements

Admin

- Approve employers
- Verify KYC
- Activate memberships
- Process disbursals
- Manage settlements
- Manage coupons
- Configure system settings

⸻

Current MVP Scope

Included in Version 1.0:

- Authentication
- Employee Management
- Employer Management
- Membership Management
- Salary Advances
- KYC Verification
- Bank Verification
- Disbursals
- Repayments
- Payroll Recovery
- Employer Settlements
- Coupon Management
- Notifications
- Settings

Planned for Future Releases:

- Audit Logs
- Advanced Reporting
- Payment Gateway Integration
- Automated Membership Payments
- Automated Settlement Collection
- Analytics Dashboard

⸻

Version

Current Version: 1.0
