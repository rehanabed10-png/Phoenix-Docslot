import { UserRole } from '../../../generated/prisma/client.js';

export interface AuthenticatedUser {
  id: string; // Supabase auth.users.id === UserProfile.id
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole; // Derived from database UserProfile.role
  isActive: boolean;
  doctorId?: string; // Present only if role === DOCTOR and DoctorProfile exists
}
