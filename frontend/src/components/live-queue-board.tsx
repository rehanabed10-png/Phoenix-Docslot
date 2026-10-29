import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Users, Clock, AlertCircle } from 'lucide-react';
import { getTodayLiveQueue } from '../services/appointment-api';
import { getDoctors } from '../services/doctor-api';
import { subscribeDataChange } from '../services/data-events';
import type { QueueAppointmentItem } from '../types/appointment';
import type { DoctorSummary } from '../types/doctor';

export function LiveQueueBoard() {
  const [queue, setQueue] = useState<QueueAppointmentItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDoctors = useCallback(async () => {
    try {
      const res = await getDoctors({ limit: 50 });
      const raw = res as unknown as { data?: DoctorSummary[]; items?: DoctorSummary[] };
      const docList = Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(res)
            ? (res as unknown as DoctorSummary[])
            : [];
      setDoctors(docList);
    } catch {
      setDoctors([]);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getTodayLiveQueue(selectedDoctorId || undefined);
      setQueue(Array.isArray(items) ? items : []);
      setLastUpdated(new Date());
    } catch (err) {
      setQueue([]);
      setError(err instanceof Error ? err.message : 'Failed to load live queue.');
    } finally {
      setLoading(false);
    }
  }, [selectedDoctorId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDoctors();
    });
  }, [loadDoctors]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadQueue();
    });
    const unsub = subscribeDataChange(() => {
      void loadQueue();
    });
    return unsub;
  }, [loadQueue]);

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const currentServing = queue.length > 0 ? queue[0] : null;

  return (
    <section className="live-queue-section" id="live-queue" aria-label="Today's Live Queue">
      <div className="section-header-simple">
        <div className="section-title-wrap">
          <div className="section-badge-simple">
            <Users size={14} />
            <span>Clinic Waiting Room</span>
          </div>
          <h2>Today's Live Consultation Queue</h2>
          <p className="section-subtext">
            Deterministic priority order based on appointment schedule. Completed and cancelled visits are automatically cleared.
          </p>
        </div>

        <div className="queue-controls">
          <select
            className="queue-doctor-filter"
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            aria-label="Filter queue by doctor"
          >
            <option value="">All Doctors (Clinic-Wide)</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.fullName} ({doc.specialty})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="queue-refresh-btn"
            onClick={loadQueue}
            disabled={loading}
            aria-label="Refresh live queue"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="queue-error-banner" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Now Serving Highlight Banner */}
      {currentServing && (
        <div className="now-serving-card">
          <div className="now-serving-badge">NOW SERVING</div>
          <div className="now-serving-content">
            <div className="now-serving-token">
              <span className="token-label">Token</span>
              <span className="token-number">{currentServing.queueNumber}</span>
            </div>
            <div className="now-serving-details">
              <h3>{currentServing.patientName}</h3>
              <p className="now-serving-doc">
                Consulting with <b>{currentServing.doctorName}</b> ({currentServing.doctorSpecialty})
              </p>
              <div className="now-serving-time">
                <Clock size={13} />
                <span>Scheduled: {formatTime(currentServing.startAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Queue Table / Roster */}
      <div className="queue-table-card">
        <div className="queue-table-header">
          <span className="queue-count">
            Waiting in Queue: <b>{queue.length}</b> {queue.length === 1 ? 'patient' : 'patients'}
          </span>
          <span className="queue-last-updated">
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Live'}
          </span>
        </div>

        {queue.length === 0 ? (
          <div className="queue-empty-state">
            <Users size={36} className="empty-icon" />
            <h3>No Patients Currently Waiting</h3>
            <p>
              All scheduled appointments for today have either concluded or none are currently queued.
            </p>
            <a href="#find-doctors" className="btn-primary-simple">
              Book an Appointment
            </a>
          </div>
        ) : (
          <div className="queue-table-wrapper">
            <table className="queue-table">
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col">Queue Token</th>
                  <th scope="col">Patient</th>
                  <th scope="col">Doctor</th>
                  <th scope="col">Appointment Time</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={idx === 0 ? 'queue-row-serving' : 'queue-row'}
                  >
                    <td className="queue-cell-pos">
                      <span className="pos-badge">#{item.queuePosition}</span>
                    </td>
                    <td className="queue-cell-token">
                      <span className="token-pill">{item.queueNumber}</span>
                    </td>
                    <td className="queue-cell-patient">
                      <span className="patient-name">{item.patientName}</span>
                    </td>
                    <td className="queue-cell-doctor">
                      <span className="doc-name">{item.doctorName}</span>
                      <span className="doc-spec">{item.doctorSpecialty}</span>
                    </td>
                    <td className="queue-cell-time">
                      <Clock size={13} />
                      <span>{formatTime(item.startAt)}</span>
                    </td>
                    <td className="queue-cell-status">
                      <span className="queue-status-tag">
                        {idx === 0 ? 'In Consultation' : 'Waiting in Line'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
