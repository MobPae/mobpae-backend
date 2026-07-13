-- Loan application numbers are generated as:
-- MP-{PRODUCT_TYPE}-{YYYY}-{8 digit sequence}
--
-- The sequence is intentionally database-owned so concurrent requests cannot
-- generate the same suffix. This migration also advances the sequence beyond
-- any already-created application numbers, which protects local/dev databases
-- after seed imports or manual resets.

CREATE SEQUENCE IF NOT EXISTS "loan_application_seq"
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

DO $$
DECLARE
  max_application_seq BIGINT;
  current_sequence_value BIGINT;
BEGIN
  SELECT COALESCE(
    MAX((substring("applicationNumber" from '[0-9]{8}$'))::BIGINT),
    0
  )
  INTO max_application_seq
  FROM "loan_applications"
  WHERE "applicationNumber" ~ '^MP-[A-Za-z0-9_]+-[0-9]{4}-[0-9]{8}$';

  IF max_application_seq > 0 THEN
    SELECT last_value
    INTO current_sequence_value
    FROM "loan_application_seq";

    IF current_sequence_value < max_application_seq THEN
      PERFORM setval('loan_application_seq', max_application_seq, true);
    END IF;
  END IF;
END $$;
