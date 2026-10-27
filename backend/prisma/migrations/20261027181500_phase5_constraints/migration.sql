-- DropIndex
DROP INDEX IF EXISTS "AvailabilityException_doctorId_date_idx";

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityException_doctorId_date_key" ON "AvailabilityException"("doctorId", "date");

-- Add patient-level appointment exclusion constraint to prevent overlapping BOOKED appointments for the same patient across doctors
ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_patient_no_overlapping_bookings"
EXCLUDE USING gist (
  "patientId" WITH =,
  tstzrange("startAt", "endAt", '[)') WITH &&
)
WHERE ("status" = 'BOOKED');
