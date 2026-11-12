import type { Snapshot } from '../sim/snapshot';
import { usd } from '../format';
import { randomSeed, useUi } from '../store';

/** Phá sản = game over, kèm báo cáo nguyên nhân (economic-model §8). */
export function GameOverDialog({ snap }: { snap: Snapshot }) {
  const newGame = useUi((s) => s.newGame);
  const e = snap.gameOver;
  if (!e) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className="dialog">
        <h2 id="gameover-title">Phá sản — ngày {e.day}</h2>
        <p>
          Thấu chi {usd(e.overdraft)} vượt hạn mức {usd(e.overdraftLimit)} hai lần chốt tháng liên tiếp. Ngân
          hàng đã thanh lý toàn bộ cửa hàng.
        </p>
        <h3>3 khoản chi lớn nhất tháng cuối</h3>
        <ol>
          {e.topExpenses.map((x) => (
            <li key={x.label}>
              {x.label}: {usd(x.amount)}
            </li>
          ))}
        </ol>
        <p>Dự báo tiền ròng sau 3 tháng theo xu hướng: {usd(e.cashForecast3m)}</p>
        <button className="primary" onClick={() => newGame({ seed: randomSeed() })}>
          Chơi lại
        </button>
      </div>
    </div>
  );
}
