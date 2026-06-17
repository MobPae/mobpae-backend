-- Keep employer enquiries as lead-tracking records and link onboarded leads to employers.
ALTER TABLE "employer_enquiries" ADD COLUMN "employerId" TEXT;

CREATE UNIQUE INDEX "employer_enquiries_employerId_key" ON "employer_enquiries"("employerId");

ALTER TABLE "employer_enquiries"
ADD CONSTRAINT "employer_enquiries_employerId_fkey"
FOREIGN KEY ("employerId") REFERENCES "employers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "EmployerEnquiryStatus" RENAME TO "EmployerEnquiryStatus_old";

CREATE TYPE "EmployerEnquiryStatus" AS ENUM ('NEW', 'ONBOARDED');

ALTER TABLE "employer_enquiries" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "employer_enquiries"
ALTER COLUMN "status" TYPE "EmployerEnquiryStatus"
USING (
  CASE
    WHEN "status"::text = 'APPROVED' THEN 'ONBOARDED'::"EmployerEnquiryStatus"
    ELSE 'NEW'::"EmployerEnquiryStatus"
  END
);

ALTER TABLE "employer_enquiries" ALTER COLUMN "status" SET DEFAULT 'NEW';

DROP TYPE "EmployerEnquiryStatus_old";
