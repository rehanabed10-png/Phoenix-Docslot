import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service.js';
import { AppointmentsService } from './appointments/appointments.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  /**
   * Public: Returns today's active waiting queue in priority order.
   * Anyone in the clinic can view without logging in.
   */
  @Get('queue/today')
  getTodayQueue(@Query('doctorId') doctorId?: string) {
    return this.appointmentsService.getTodayLiveQueue(doctorId);
  }
}

