export class AdminOverviewResponseDto {
  totalActiveDoctors!: number;
  totalPatients!: number;
  totalAppointments!: number;
  todayAppointments!: number;
  appointmentStats!: {
    booked: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
}
