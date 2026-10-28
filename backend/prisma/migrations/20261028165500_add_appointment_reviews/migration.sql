-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN "yearsOfExperience" INTEGER DEFAULT 5;
ALTER TABLE "DoctorProfile" ADD COLUMN "avatarUrl" VARCHAR(500);

-- CreateTable
CREATE TABLE "AppointmentReview" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(1000),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppointmentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentReview_appointmentId_key" ON "AppointmentReview"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentReview_doctorId_createdAt_idx" ON "AppointmentReview"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentReview_patientId_idx" ON "AppointmentReview"("patientId");

-- AddForeignKey
ALTER TABLE "AppointmentReview" ADD CONSTRAINT "AppointmentReview_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReview" ADD CONSTRAINT "AppointmentReview_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReview" ADD CONSTRAINT "AppointmentReview_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraint: rating between 1 and 5
ALTER TABLE "AppointmentReview" ADD CONSTRAINT "AppointmentReview_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);
