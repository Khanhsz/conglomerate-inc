import { type HrPolicy, type PolicyLevel, type StaffStatus } from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { pct, usd } from '../format';
import { DeptLocked } from './DeptLocked';
import { Slider } from './Slider';

const LEVEL_NAME: { readonly [L in PolicyLevel]: string } = {
  0: 'Không',
  1: 'Cơ bản',
  2: 'Tốt',
  3: 'Cao cấp',
};
const STATUS: { readonly [S in StaffStatus]: readonly [string, string] } = {
  ok: ['Ổn', 'ok'],
  lowMorale: ['Tinh thần thấp', 'warn'],
  overloaded: ['Quá tải', 'warn'],
  underused: ['Dư người', 'info'],
  loss: ['Lỗ đóng góp', 'bad'],
};

/** Phòng Nhân sự (economic-model §16): tình trạng nhân sự từng cửa hàng và chính sách công ty. */
export function HrDept({ snap }: { snap: Snapshot }) {
  const { send } = useUi();
  const companyId = snap.player.id;
  const { open, view } = snap.hr;
  const setPolicy = (payload: Partial<HrPolicy>) =>
    send({ type: 'command', command: { type: 'SetHrPolicy', companyId, payload } });

  return (
    <section className="hr" data-testid="hr-dept">
      {!open && <DeptLocked snap={snap} dept="hr" testId="hr-locked" />}

      <dl className="kv hr-summary">
        <div className="kv-row">
          <dt>Kỹ năng TB</dt>
          <dd>{view.totals.avgSkill === null ? '—' : pct(view.totals.avgSkill, 0)}</dd>
        </div>
        <div className="kv-row">
          <dt>Tháng trước: đào tạo / phúc lợi / thưởng</dt>
          <dd>
            {usd(view.lastMonth.training)} / {usd(view.lastMonth.benefits)} / {usd(view.lastMonth.bonus)}
          </dd>
        </div>
      </dl>

      {open && (
        <div className="hr-policies">
          <article className="card">
            <h3>Lương chuẩn</h3>
            <p className="small muted">
              Áp cho mọi cửa hàng không đặt lương riêng, cập nhật theo lạm phát đầu mỗi tháng. Lương thị
              trường {usd(view.marketWage)}.
            </p>
            {view.policy.wageRatio === null ? (
              <button
                type="button"
                data-testid="wage-standard-on"
                onClick={() => setPolicy({ wageRatio: 1 })}
              >
                Đặt lương chuẩn = thị trường
              </button>
            ) : (
              <>
                <Slider
                  id="slider-wage-ratio"
                  label="Lương chuẩn"
                  value={Math.round(view.policy.wageRatio * 100)}
                  min={50}
                  max={300}
                  step={5}
                  format={(v) => `${v}% thị trường`}
                  onCommit={(v) => setPolicy({ wageRatio: v / 100 })}
                />
                <p className="small">
                  Hiện tại: {view.standardWage === null ? '—' : usd(view.standardWage)}/tháng
                </p>
                <button type="button" className="link" onClick={() => setPolicy({ wageRatio: null })}>
                  Bỏ lương chuẩn (cửa hàng giữ lương hiện tại)
                </button>
              </>
            )}
          </article>

          <article className="card wide">
            <h3>Đào tạo</h3>
            <div className="levels" role="radiogroup" aria-label="Mức đào tạo">
              {view.training.map((t) => (
                <button
                  key={t.level}
                  type="button"
                  role="radio"
                  aria-checked={view.policy.trainingLevel === t.level}
                  data-testid={`training-${t.level}`}
                  className={`level ${view.policy.trainingLevel === t.level ? 'active' : ''}`}
                  onClick={() => setPolicy({ trainingLevel: t.level })}
                >
                  <strong>{LEVEL_NAME[t.level]}</strong>
                  <span>{usd(t.monthlyCost)}/tháng</span>
                  <span className="small">kỹ năng +{pct(t.skillGainPerDay * 30, 0)}/tháng</span>
                  <span className="small">người mới {pct(t.newHireSkill, 0)}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="card wide">
            <h3>Phúc lợi</h3>
            <div className="levels" role="radiogroup" aria-label="Mức phúc lợi">
              {view.benefits.map((b) => (
                <button
                  key={b.level}
                  type="button"
                  role="radio"
                  aria-checked={view.policy.benefitsLevel === b.level}
                  data-testid={`benefits-${b.level}`}
                  className={`level ${view.policy.benefitsLevel === b.level ? 'active' : ''}`}
                  onClick={() => setPolicy({ benefitsLevel: b.level })}
                >
                  <strong>{LEVEL_NAME[b.level]}</strong>
                  <span>{usd(b.monthlyCost)}/tháng</span>
                  <span className="small">tinh thần +{pct(b.moraleBonus, 0)}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="card">
            <h3>Thưởng theo lợi nhuận</h3>
            <p className="small muted">
              Trả cuối tháng, một phần lãi đóng góp dương của mỗi cửa hàng. Thưởng tháng trước được tính như
              tăng lương khi xét tinh thần.
            </p>
            <Slider
              id="slider-bonus"
              label="Tỷ lệ thưởng"
              value={Math.round(view.policy.bonusRate * 100)}
              min={0}
              max={view.bonusByPercent.length - 1}
              step={1}
              format={(v) => `${v}% · ước tính ${usd(view.bonusByPercent[v] ?? view.lastMonth.bonus)}/tháng`}
              onCommit={(v) => setPolicy({ bonusRate: v / 100 })}
            />
          </article>
        </div>
      )}

      <h3>Tình trạng nhân sự theo cửa hàng</h3>
      {view.roster.length === 0 ? (
        <p className="muted">Chưa có cửa hàng nào.</p>
      ) : (
        <div className="table-wrap">
          <table data-testid="hr-roster">
            <thead>
              <tr>
                <th>Quận</th>
                <th>Nhân viên</th>
                <th>Lương</th>
                <th>Tinh thần → mục tiêu</th>
                <th>Kỹ năng</th>
                <th>Utilization</th>
                <th>Doanh thu tháng trước</th>
                <th>Lãi đóng góp</th>
                <th>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {view.roster.map((r) => {
                const [label, tone] = STATUS[r.status];
                return (
                  <tr key={r.storeId}>
                    <td>{r.districtId.toUpperCase()}</td>
                    <td className="num">{r.staff}</td>
                    <td className="num">
                      {usd(r.wageMonthly)}
                      {open && r.wageOverridden && view.standardWage !== null && (
                        <button
                          type="button"
                          className="link small"
                          title="Đang đặt lương riêng"
                          onClick={() =>
                            send({
                              type: 'command',
                              command: {
                                type: 'ClearOverride',
                                companyId,
                                payload: { storeId: r.storeId, field: 'wage' },
                              },
                            })
                          }
                        >
                          {' '}
                          về chuẩn
                        </button>
                      )}
                    </td>
                    <td className="num">
                      {pct(r.morale, 0)} → {pct(r.moraleTarget, 0)}
                    </td>
                    <td className="num">{pct(r.skill, 0)}</td>
                    <td className="num">{pct(r.utilizationLastMonth, 0)}</td>
                    <td className="num">{usd(r.revenueLastMonth)}</td>
                    <td className={`num ${r.contributionLastMonth < 0 ? 'bad' : ''}`}>
                      {usd(r.contributionLastMonth)}
                    </td>
                    <td>
                      <span className={`chip chip-${tone}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
