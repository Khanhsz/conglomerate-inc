import { DEPARTMENT_LABEL, type Department } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { usd } from '../format';
import { DEPARTMENT_INFO } from './departments';

/**
 * Trang phòng chưa mở (M1.7): chức năng phòng mở ra, phí mở và chi phí tháng, nút mở ngay.
 * Chưa có văn phòng hoặc hết chỗ thì nút dẫn về tab Văn phòng.
 */
export function DeptLocked({ snap, dept, testId }: { snap: Snapshot; dept: Department; testId: string }) {
  const { send, openHq } = useUi();
  const info = DEPARTMENT_INFO[dept];
  const status = snap.office.departments.find((d) => d.dept === dept);
  const office = snap.office.office;
  const full = office !== null && office.slotsUsed >= office.slots;
  return (
    <article className="card locked" data-testid={testId}>
      <h3>Phòng {DEPARTMENT_LABEL[dept]} chưa mở</h3>
      <p className="small">{info.does}</p>
      {status && (
        <p className="small muted">
          Phí mở {usd(status.openingCost)} · cố định {usd(status.fixedMonthly)}/tháng
        </p>
      )}
      {office === null ? (
        <button type="button" className="link" onClick={() => openHq('office')}>
          Cần thuê văn phòng trước → Văn phòng
        </button>
      ) : full ? (
        <button type="button" className="link" onClick={() => openHq('office')}>
          Văn phòng đã hết chỗ → đóng bớt phòng hoặc chuyển văn phòng lớn hơn
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          data-testid={`unlock-${dept}`}
          onClick={() =>
            send({
              type: 'command',
              command: { type: 'OpenDepartment', companyId: snap.player.id, payload: { dept } },
            })
          }
        >
          Mở phòng {DEPARTMENT_LABEL[dept]}
        </button>
      )}
    </article>
  );
}
