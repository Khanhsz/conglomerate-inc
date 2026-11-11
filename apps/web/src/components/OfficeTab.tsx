import { DEPARTMENT_LABEL, OFFICE_SIZE_LABEL, type OfficeSize } from '@game/sim-core';
import { useState } from 'react';
import { DEPARTMENT_INFO } from './departments';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { usd } from '../format';

export function OfficeTab({ snap }: { snap: Snapshot }) {
  const view = snap.office;
  return view.office === null ? <LeaseForm snap={snap} /> : <OfficeDetail snap={snap} />;
}

function LeaseForm({ snap }: { snap: Snapshot }) {
  const { send, selectedDistrict } = useUi();
  const [district, setDistrict] = useState(selectedDistrict ?? snap.districts[0]?.id ?? '');
  const companyId = snap.player.id;
  const options = snap.office.leaseOptions.filter((o) => o.districtId === district);
  return (
    <section className="office">
      <p className="muted">
        Chưa có văn phòng. Thuê văn phòng để mở các phòng ban: mỗi phòng có phí mở một lần và chi phí cố định
        hằng tháng, đổi lại các chức năng điều hành chuỗi. Không có văn phòng bạn vẫn điều hành từng cửa hàng
        như hiện nay.
      </p>
      <label>
        Quận đặt văn phòng{' '}
        <select data-testid="office-district" value={district} onChange={(e) => setDistrict(e.target.value)}>
          {snap.districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <div className="office-sizes">
        {options.map((o) => (
          <article key={o.size} className="card" data-testid={`office-option-${o.size}`}>
            <h3>Văn phòng {OFFICE_SIZE_LABEL[o.size]}</h3>
            <dl className="kv">
              <dt>Chỗ cho phòng ban</dt>
              <dd>{o.slots}</dd>
              <dt>Sửa sang (một lần)</dt>
              <dd>{usd(o.capex)}</dd>
              <dt>Thuê / tháng</dt>
              <dd>{usd(o.rentMonthly)}</dd>
              <dt>Overhead / tháng</dt>
              <dd>{usd(o.overheadMonthly)}</dd>
            </dl>
            <button
              type="button"
              data-testid={`lease-${o.size}`}
              onClick={() =>
                send({
                  type: 'command',
                  command: {
                    type: 'LeaseOffice',
                    companyId,
                    payload: { districtId: district, size: o.size },
                  },
                })
              }
            >
              Thuê
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function OfficeDetail({ snap }: { snap: Snapshot }) {
  const { send } = useUi();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const view = snap.office;
  const office = view.office;
  if (!office) return null;
  const companyId = snap.player.id;
  const full = office.slotsUsed >= office.slots;
  const size: OfficeSize = office.size;
  return (
    <section className="office">
      <header className="office-head">
        <h3>
          Văn phòng {OFFICE_SIZE_LABEL[size]} · quận {office.districtId.toUpperCase()}
        </h3>
        <span className="muted" data-testid="office-slots">
          {office.slotsUsed}/{office.slots} phòng đang dùng
        </span>
      </header>
      <dl className="kv office-costs">
        <dt>Thuê</dt>
        <dd>{usd(office.rentMonthly)}/tháng</dd>
        <dt>Overhead</dt>
        <dd>{usd(office.overheadMonthly)}/tháng</dd>
        <dt>Giá trị còn lại</dt>
        <dd>{usd(office.bookValue)}</dd>
      </dl>

      <div className="departments">
        {view.departments.map((d) => {
          const info = DEPARTMENT_INFO[d.dept];
          const isOpen = d.openedDay !== null;
          return (
            <article
              key={d.dept}
              className={`card dept ${isOpen ? 'dept-open' : ''}`}
              data-testid={`dept-${d.dept}`}
            >
              <h3>{DEPARTMENT_LABEL[d.dept]}</h3>
              <p className="small">{info.does}</p>
              {!info.ready && <p className="small muted">Chức năng đang được xây dựng ở bản tiếp theo.</p>}
              <dl className="kv">
                <dt>Phí mở</dt>
                <dd>{usd(d.openingCost)}</dd>
                <dt>Cố định / tháng</dt>
                <dd>{usd(d.fixedMonthly)}</dd>
              </dl>
              {isOpen ? (
                <button
                  type="button"
                  data-testid={`close-dept-${d.dept}`}
                  onClick={() =>
                    send({
                      type: 'command',
                      command: { type: 'CloseDepartment', companyId, payload: { dept: d.dept } },
                    })
                  }
                >
                  Đóng phòng
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`open-dept-${d.dept}`}
                  disabled={full}
                  title={full ? 'Văn phòng đã hết chỗ' : undefined}
                  onClick={() =>
                    send({
                      type: 'command',
                      command: { type: 'OpenDepartment', companyId, payload: { dept: d.dept } },
                    })
                  }
                >
                  Mở phòng
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="office-release">
        {confirmRelease ? (
          <>
            <span className="bad">
              Trả văn phòng: phí chấm dứt {usd(office.releaseFee)}, ghi giảm {usd(office.bookValue)}, mọi
              phòng ban đóng.
            </span>
            <button
              type="button"
              data-testid="release-office-confirm"
              onClick={() => {
                send({ type: 'command', command: { type: 'ReleaseOffice', companyId, payload: {} } });
                setConfirmRelease(false);
              }}
            >
              Xác nhận trả
            </button>
            <button type="button" onClick={() => setConfirmRelease(false)}>
              Thôi
            </button>
          </>
        ) : (
          <button
            type="button"
            className="link"
            data-testid="release-office"
            onClick={() => setConfirmRelease(true)}
          >
            Trả văn phòng…
          </button>
        )}
      </div>
    </section>
  );
}
