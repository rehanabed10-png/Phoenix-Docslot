export interface WeeklyScheduleSeedItem {
  id: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  slotDuration: number; // minutes (e.g., 15, 30)
}

export interface DemoDoctorSeedData {
  defaultUserId: string;
  envVarUserIdKey: string;
  doctorId: string;
  fullName: string;
  email: string;
  phone: string;
  specialty: string;
  qualification: string;
  yearsOfExperience: number;
  avatarUrl: string;
  consultationFee: number;
  bio: string;
  weeklySchedules: WeeklyScheduleSeedItem[];
}

export interface DemoPatientSeedData {
  defaultUserId: string;
  envVarUserIdKey: string;
  fullName: string;
  email: string;
  phone: string;
}

export const DEMO_DOCTORS: DemoDoctorSeedData[] = [
  {
    defaultUserId: '10000000-0000-4000-8000-000000000001',
    envVarUserIdKey: 'DEMO_DOCTOR_1_USER_ID',
    doctorId: '11111111-1111-4111-8111-111111111111',
    fullName: 'Dr. Sarah Jenkins',
    email: 'dr.sarah.jenkins@phoenixdocslot.demo',
    phone: '+91-9811100001',
    specialty: 'Cardiology',
    qualification: 'MD, FACC (Cardiovascular Medicine)',
    yearsOfExperience: 14,
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300',
    consultationFee: 150.0,
    bio: 'Board-certified cardiologist specializing in preventive cardiology, cardiovascular diagnostics, hypertension management, and non-invasive cardiac care with over 14 years of clinical experience.',
    weeklySchedules: [
      {
        id: '10000001-0000-4000-8000-000000000001',
        dayOfWeek: 1, // Monday
        startTime: '09:00',
        endTime: '13:00',
        slotDuration: 30,
      },
      {
        id: '10000001-0000-4000-8000-000000000002',
        dayOfWeek: 2, // Tuesday
        startTime: '09:00',
        endTime: '13:00',
        slotDuration: 30,
      },
      {
        id: '10000001-0000-4000-8000-000000000003',
        dayOfWeek: 3, // Wednesday
        startTime: '14:00',
        endTime: '18:00',
        slotDuration: 30,
      },
      {
        id: '10000001-0000-4000-8000-000000000004',
        dayOfWeek: 4, // Thursday
        startTime: '09:00',
        endTime: '13:00',
        slotDuration: 30,
      },
      {
        id: '10000001-0000-4000-8000-000000000005',
        dayOfWeek: 5, // Friday
        startTime: '09:00',
        endTime: '13:00',
        slotDuration: 30,
      },
    ],
  },
  {
    defaultUserId: '20000000-0000-4000-8000-000000000002',
    envVarUserIdKey: 'DEMO_DOCTOR_2_USER_ID',
    doctorId: '22222222-2222-4222-8222-222222222222',
    fullName: 'Dr. Marcus Vance',
    email: 'dr.marcus.vance@phoenixdocslot.demo',
    phone: '+91-9811100002',
    specialty: 'Dermatology',
    qualification: 'MD, FAAD (Dermatology & Cutaneous Surgery)',
    yearsOfExperience: 11,
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300',
    consultationFee: 120.0,
    bio: 'Specialist in adult and pediatric medical dermatology, advanced acne therapy, chronic dermatitis, and dermoscopy-guided skin cancer screenings.',
    weeklySchedules: [
      {
        id: '20000002-0000-4000-8000-000000000001',
        dayOfWeek: 1, // Monday
        startTime: '10:00',
        endTime: '16:00',
        slotDuration: 15,
      },
      {
        id: '20000002-0000-4000-8000-000000000002',
        dayOfWeek: 3, // Wednesday
        startTime: '10:00',
        endTime: '16:00',
        slotDuration: 15,
      },
      {
        id: '20000002-0000-4000-8000-000000000003',
        dayOfWeek: 5, // Friday
        startTime: '10:00',
        endTime: '15:00',
        slotDuration: 15,
      },
    ],
  },
  {
    defaultUserId: '30000000-0000-4000-8000-000000000003',
    envVarUserIdKey: 'DEMO_DOCTOR_3_USER_ID',
    doctorId: '33333333-3333-4333-8333-333333333333',
    fullName: 'Dr. Priya Sharma',
    email: 'dr.priya.sharma@phoenixdocslot.demo',
    phone: '+91-9811100003',
    specialty: 'Pediatrics',
    qualification: 'MBBS, MD (Pediatrics), FAAP',
    yearsOfExperience: 9,
    avatarUrl: 'https://images.unsplash.com/photo-1594824813512-9c3f4e1f7602?auto=format&fit=crop&q=80&w=300',
    consultationFee: 100.0,
    bio: 'Compassionate pediatrician dedicated to comprehensive newborn and infant care, childhood growth and developmental assessments, pediatric nutrition, and adolescent wellness.',
    weeklySchedules: [
      {
        id: '30000003-0000-4000-8000-000000000001',
        dayOfWeek: 1, // Monday
        startTime: '08:30',
        endTime: '12:30',
        slotDuration: 30,
      },
      {
        id: '30000003-0000-4000-8000-000000000002',
        dayOfWeek: 2, // Tuesday
        startTime: '08:30',
        endTime: '12:30',
        slotDuration: 30,
      },
      {
        id: '30000003-0000-4000-8000-000000000003',
        dayOfWeek: 3, // Wednesday
        startTime: '08:30',
        endTime: '12:30',
        slotDuration: 30,
      },
      {
        id: '30000003-0000-4000-8000-000000000004',
        dayOfWeek: 4, // Thursday
        startTime: '13:30',
        endTime: '17:30',
        slotDuration: 30,
      },
      {
        id: '30000003-0000-4000-8000-000000000005',
        dayOfWeek: 6, // Saturday
        startTime: '09:00',
        endTime: '13:00',
        slotDuration: 30,
      },
    ],
  },
];

export const DEMO_PATIENT: DemoPatientSeedData = {
  defaultUserId: '40000000-0000-4000-8000-000000000004',
  envVarUserIdKey: 'DEMO_PATIENT_USER_ID',
  fullName: 'Alex Morgan',
  email: 'alex.morgan@phoenixdocslot.demo',
  phone: '+91-9876543210',
};

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Validates weekly schedule items against database constraints:
 * - dayOfWeek between 0 and 6
 * - startTime matches HH:mm
 * - endTime matches HH:mm
 * - startTime < endTime
 * - slotDuration > 0 and typically 15 or 30
 * - No overlapping intervals for the same day
 */
export function validateWeeklySchedule(
  schedules: WeeklyScheduleSeedItem[],
): string[] {
  const errors: string[] = [];
  const byDay = new Map<number, WeeklyScheduleSeedItem[]>();

  for (const item of schedules) {
    if (!UUID_V4_REGEX.test(item.id)) {
      errors.push(`Schedule item ID "${item.id}" is not a valid UUID.`);
    }

    if (item.dayOfWeek < 0 || item.dayOfWeek > 6) {
      errors.push(
        `dayOfWeek "${item.dayOfWeek}" must be between 0 (Sun) and 6 (Sat).`,
      );
    }

    if (!TIME_REGEX.test(item.startTime)) {
      errors.push(
        `startTime "${item.startTime}" does not match HH:mm 24h format.`,
      );
    }

    if (!TIME_REGEX.test(item.endTime)) {
      errors.push(`endTime "${item.endTime}" does not match HH:mm 24h format.`);
    }

    if (TIME_REGEX.test(item.startTime) && TIME_REGEX.test(item.endTime)) {
      if (timeToMinutes(item.startTime) >= timeToMinutes(item.endTime)) {
        errors.push(
          `startTime "${item.startTime}" must be strictly before endTime "${item.endTime}".`,
        );
      }
    }

    if (item.slotDuration <= 0) {
      errors.push(
        `slotDuration "${item.slotDuration}" must be a positive integer.`,
      );
    }

    const dayItems = byDay.get(item.dayOfWeek) ?? [];
    dayItems.push(item);
    byDay.set(item.dayOfWeek, dayItems);
  }

  // Check overlap per day
  for (const [day, dayItems] of byDay.entries()) {
    dayItems.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    for (let i = 0; i < dayItems.length - 1; i++) {
      const current = dayItems[i];
      const next = dayItems[i + 1];
      if (timeToMinutes(current.endTime) > timeToMinutes(next.startTime)) {
        errors.push(
          `Overlapping schedule intervals on day ${day}: [${current.startTime} - ${current.endTime}] and [${next.startTime} - ${next.endTime}].`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validates the full demo dataset for database compatibility and integrity.
 */
export function validateSeedData(
  doctors: DemoDoctorSeedData[] = DEMO_DOCTORS,
  patient: DemoPatientSeedData = DEMO_PATIENT,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenEmails = new Set<string>();
  const seenUserIds = new Set<string>();
  const seenDoctorIds = new Set<string>();
  const seenScheduleIds = new Set<string>();

  // Validate patient
  if (!UUID_V4_REGEX.test(patient.defaultUserId)) {
    errors.push(
      `Patient defaultUserId "${patient.defaultUserId}" is not a valid UUID.`,
    );
  }
  seenUserIds.add(patient.defaultUserId.toLowerCase());
  seenEmails.add(patient.email.toLowerCase());

  // Validate doctors
  for (const doc of doctors) {
    if (!UUID_V4_REGEX.test(doc.defaultUserId)) {
      errors.push(
        `Doctor "${doc.fullName}" defaultUserId "${doc.defaultUserId}" is not a valid UUID.`,
      );
    }
    if (!UUID_V4_REGEX.test(doc.doctorId)) {
      errors.push(
        `Doctor "${doc.fullName}" doctorId "${doc.doctorId}" is not a valid UUID.`,
      );
    }

    const lowerUserId = doc.defaultUserId.toLowerCase();
    if (seenUserIds.has(lowerUserId)) {
      errors.push(
        `Duplicate defaultUserId "${doc.defaultUserId}" found on doctor "${doc.fullName}".`,
      );
    }
    seenUserIds.add(lowerUserId);

    const lowerDoctorId = doc.doctorId.toLowerCase();
    if (seenDoctorIds.has(lowerDoctorId)) {
      errors.push(
        `Duplicate doctorId "${doc.doctorId}" found on doctor "${doc.fullName}".`,
      );
    }
    seenDoctorIds.add(lowerDoctorId);

    const lowerEmail = doc.email.toLowerCase();
    if (seenEmails.has(lowerEmail)) {
      errors.push(
        `Duplicate email "${doc.email}" found on doctor "${doc.fullName}".`,
      );
    }
    seenEmails.add(lowerEmail);

    if (!doc.specialty || doc.specialty.trim().length === 0) {
      errors.push(`Doctor "${doc.fullName}" specialty is required.`);
    }

    if (doc.consultationFee <= 0) {
      errors.push(
        `Doctor "${doc.fullName}" consultationFee must be a positive number.`,
      );
    }

    // Check weekly schedules
    const scheduleErrors = validateWeeklySchedule(doc.weeklySchedules);
    for (const err of scheduleErrors) {
      errors.push(`Doctor "${doc.fullName}" schedule error: ${err}`);
    }

    for (const sched of doc.weeklySchedules) {
      const lowerSchedId = sched.id.toLowerCase();
      if (seenScheduleIds.has(lowerSchedId)) {
        errors.push(
          `Duplicate schedule ID "${sched.id}" found across seed data.`,
        );
      }
      seenScheduleIds.add(lowerSchedId);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
