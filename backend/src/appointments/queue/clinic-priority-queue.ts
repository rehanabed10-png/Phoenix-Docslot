import { AppointmentStatus } from '../../../generated/prisma/client.js';

export interface QueueAppointmentItem {
  id: string;
  startAt: Date;
  createdAt: Date;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  status: AppointmentStatus;
  reason: string | null;
  queueNumber?: string;
  queuePosition?: number;
}

/**
 * Deterministic comparator for clinic appointment waiting queue.
 *
 * Priority Rules:
 * 1. Primary: Scheduled appointment start time (startAt ascending - earlier slot served first).
 * 2. Stable Tie-breaker 1: Booking confirmation timestamp (createdAt ascending - FIFO).
 * 3. Stable Tie-breaker 2: Unique appointment UUID (lexicographical string comparison).
 */
export function compareAppointmentQueue(
  a: QueueAppointmentItem,
  b: QueueAppointmentItem,
): number {
  // Primary Criterion: Earliest scheduled start time
  const timeDiff = a.startAt.getTime() - b.startAt.getTime();
  if (timeDiff !== 0) return timeDiff;

  // Stable Tie-breaker 1: Booking registration time (FIFO)
  const createdDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdDiff !== 0) return createdDiff;

  // Stable Tie-breaker 2: Unique identifier (deterministic guarantee)
  return a.id.localeCompare(b.id);
}

/**
 * ClinicPriorityQueue: A Min-Binary-Heap Priority Queue implementation for clinic waiting queues.
 *
 * Theoretical & Practical Rationale:
 * 1. O(1) Access: Doctors and clinic staff can instantly peek at the next waiting patient.
 * 2. O(log N) Updates: As patients book, cancel, or arrive, the queue reorganizes in logarithmic time.
 * 3. PostgreSQL Single Source of Truth: The queue is hydrated from persisted database records
 *    (status = BOOKED) and strictly excludes CANCELLED, COMPLETED, or NO_SHOW records.
 */
export class ClinicPriorityQueue<T = QueueAppointmentItem> {
  private readonly heap: T[] = [];
  private readonly comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number = compareAppointmentQueue as unknown as (a: T, b: T) => number) {
    this.comparator = comparator;
  }

  /**
   * Inserts an appointment item into the priority queue. O(log N).
   */
  enqueue(item: T): void {
    this.heap.push(item);
    this.heapifyUp(this.heap.length - 1);
  }

  /**
   * Returns and removes the highest priority (next up) appointment. O(log N).
   */
  dequeue(): T | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!;

    const top = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.heapifyDown(0);
    return top;
  }

  /**
   * Inspects the next patient in line without removing them. O(1).
   */
  peek(): T | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Returns current count of active waiting patients.
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Checks whether the waiting queue is currently empty.
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Clears all items in the queue.
   */
  clear(): void {
    this.heap.length = 0;
  }

  /**
   * Returns all items sorted strictly in priority queue order without mutating the queue.
   */
  toArrayInPriorityOrder(): T[] {
    const clone = new ClinicPriorityQueue<T>(this.comparator);
    for (const item of this.heap) {
      clone.enqueue(item);
    }
    const result: T[] = [];
    while (!clone.isEmpty()) {
      result.push(clone.dequeue()!);
    }
    return result;
  }

  private heapifyUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.comparator(this.heap[current], this.heap[parent]) < 0) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  private heapifyDown(index: number): void {
    let current = index;
    const length = this.heap.length;

    while (true) {
      const leftChild = 2 * current + 1;
      const rightChild = 2 * current + 2;
      let smallest = current;

      if (
        leftChild < length &&
        this.comparator(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < length &&
        this.comparator(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest !== current) {
        this.swap(current, smallest);
        current = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
