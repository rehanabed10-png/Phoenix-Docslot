import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../../../generated/prisma/client.js';
import {
  ClinicPriorityQueue,
  QueueAppointmentItem,
} from './clinic-priority-queue.js';

describe('ClinicPriorityQueue', () => {
  const createItem = (
    id: string,
    startHours: number,
    startMinutes: number,
    createdSecondsAgo: number = 0,
  ): QueueAppointmentItem => ({
    id,
    startAt: new Date(2026, 9, 29, startHours, startMinutes),
    createdAt: new Date(Date.now() - createdSecondsAgo * 1000),
    patientId: `pat-${id}`,
    patientName: `Patient ${id}`,
    doctorId: 'doc-1',
    doctorName: 'Dr. Sarah Jenkins',
    doctorSpecialty: 'Cardiology',
    status: AppointmentStatus.BOOKED,
    reason: 'Consultation',
  });

  it('orders appointments with earlier scheduled time first', () => {
    const pq = new ClinicPriorityQueue();

    const item1030 = createItem('apt-1030', 10, 30);
    const item0900 = createItem('apt-0900', 9, 0);
    const item1100 = createItem('apt-1100', 11, 0);
    const item0930 = createItem('apt-0930', 9, 30);

    pq.enqueue(item1030);
    pq.enqueue(item0900);
    pq.enqueue(item1100);
    pq.enqueue(item0930);

    expect(pq.size()).toBe(4);
    expect(pq.peek()?.id).toBe('apt-0900');

    expect(pq.dequeue()?.id).toBe('apt-0900');
    expect(pq.dequeue()?.id).toBe('apt-0930');
    expect(pq.dequeue()?.id).toBe('apt-1030');
    expect(pq.dequeue()?.id).toBe('apt-1100');
    expect(pq.isEmpty()).toBe(true);
  });

  it('uses booking creation time (FIFO) as stable tie-breaker for identical appointment start times', () => {
    const pq = new ClinicPriorityQueue();

    // Two patients booked for the same 10:00 triage slot
    const earlyBooked = createItem('early', 10, 0, 100); // booked 100s ago
    const lateBooked = createItem('late', 10, 0, 10);    // booked 10s ago

    pq.enqueue(lateBooked);
    pq.enqueue(earlyBooked);

    expect(pq.dequeue()?.id).toBe('early');
    expect(pq.dequeue()?.id).toBe('late');
  });

  it('returns items in priority queue order without mutating the queue via toArrayInPriorityOrder', () => {
    const pq = new ClinicPriorityQueue();

    pq.enqueue(createItem('apt-2', 10, 0));
    pq.enqueue(createItem('apt-1', 9, 0));
    pq.enqueue(createItem('apt-3', 11, 0));

    const ordered = pq.toArrayInPriorityOrder();
    expect(ordered.map((i) => i.id)).toEqual(['apt-1', 'apt-2', 'apt-3']);
    // Original queue is untouched
    expect(pq.size()).toBe(3);
    expect(pq.peek()?.id).toBe('apt-1');
  });
});
