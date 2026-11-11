import {
  MAX_MARKETING_BUDGET_MONTHLY,
  MAX_STAFF_PER_STORE,
  money,
  QUALITY_TIERS,
  type QualityTier,
} from '@game/sim-core';
import type { Snapshot } from '../sim/snapshot';
import { useUi } from '../store';
import { int, pct, usd } from '../format';
import { IntInput, MoneyInput } from './inputs';

export function StoreTable({ snap }: { snap: Snapshot }) {
  const send = useUi((s) => s.send);
  const companyId = snap.player.id;
  const command = send;
  return (
    <section>
      <div className="company-controls">
        <label>
          Marketing/tháng{' '}
          <MoneyInput
            label="Ngân sách marketing tháng"
            value={snap.player.marketingBudgetMonthly}
            onCommit={(monthly) =>
              command({
                type: 'command',
                command: { type: 'SetMarketingBudget', companyId, payload: { monthly } },
              })
            }
          />
        </label>
        <span className="muted">tối đa {usd(money(MAX_MARKETING_BUDGET_MONTHLY))}</span>
        <label>
          Chất lượng{' '}
          <select
            aria-label="Chất lượng"
            value={snap.player.qualityTier}
            onChange={(e) => {
              const tier = QUALITY_TIERS.find((t): t is QualityTier => t === e.target.value);
              if (tier)
                command({
                  type: 'command',
                  command: { type: 'SetQualityTier', companyId, payload: { tier } },
                });
            }}
          >
            {QUALITY_TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {snap.stores.length === 0 ? (
        <p className="muted">Bạn chưa có cửa hàng nào. Chọn một quận trên bản đồ để mở.</p>
      ) : (
        <div className="table-wrap">
          <table className="stores">
            <thead>
              <tr>
                <th>Quận</th>
                <th>Giá</th>
                <th>Staff</th>
                <th>Lương/tháng</th>
                <th>Khách/ngày</th>
                <th>Utilization</th>
                <th>Phục vụ (W)</th>
                <th>Lãi đóng góp tháng trước</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snap.stores.map((r) => (
                <tr key={r.id} data-testid={`store-${r.id}`}>
                  <td>{r.districtId.toUpperCase()}</td>
                  <td>
                    <MoneyInput
                      label={`Giá ${r.id}`}
                      value={r.price}
                      onCommit={(price) =>
                        command({
                          type: 'command',
                          command: { type: 'SetPrice', companyId, payload: { storeId: r.id, price } },
                        })
                      }
                    />
                  </td>
                  <td>
                    <IntInput
                      label={`Staff ${r.id}`}
                      value={r.staff}
                      min={snap.rules.minStaffPerStore}
                      max={MAX_STAFF_PER_STORE}
                      onCommit={(staff) =>
                        command({
                          type: 'command',
                          command: { type: 'SetStaff', companyId, payload: { storeId: r.id, staff } },
                        })
                      }
                    />
                  </td>
                  <td>
                    <MoneyInput
                      label={`Lương ${r.id}`}
                      value={r.wageMonthly}
                      onCommit={(wageMonthly) =>
                        command({
                          type: 'command',
                          command: { type: 'SetWage', companyId, payload: { storeId: r.id, wageMonthly } },
                        })
                      }
                    />
                  </td>
                  <td className="num">{int(r.servedToday)}</td>
                  <td className="num">{pct(r.utilizationToday, 0)}</td>
                  <td className="num">{r.serviceLevel.toFixed(2)}</td>
                  <td className={`num ${r.lastMonthContribution < 0 ? 'bad' : ''}`}>
                    {usd(r.lastMonthContribution)}
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        command({
                          type: 'command',
                          command: { type: 'CloseStore', companyId, payload: { storeId: r.id } },
                        })
                      }
                    >
                      Đóng
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
