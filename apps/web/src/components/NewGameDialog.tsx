import { useState } from 'react';
import { parseScenarioId, SCENARIO_IDS, SCENARIO_LABEL, type ScenarioId } from '../sim/scenarios';
import { randomSeed, useUi } from '../store';

/**
 * Ván mới (M1.8): chọn bản đồ và seed. Seed quyết định đối thủ và mọi diễn biến ngẫu nhiên; nhập lại cùng seed
 * thì chơi lại đúng ván đó.
 */
export function NewGameDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const newGame = useUi((s) => s.newGame);
  const [scenario, setScenario] = useState<ScenarioId>(parseScenarioId(current) ?? SCENARIO_IDS[0]);
  const [seed, setSeed] = useState(() => String(randomSeed()));
  const value = Number(seed);
  const valid = seed.trim() !== '' && Number.isSafeInteger(value) && value >= 0;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
      <div className="dialog new-game" data-testid="new-game-dialog">
        <h2 id="new-game-title">Ván mới</h2>
        <label>
          Bản đồ{' '}
          <select
            data-testid="new-game-scenario"
            value={scenario}
            onChange={(e) => setScenario(parseScenarioId(e.target.value) ?? scenario)}
          >
            {SCENARIO_IDS.map((id) => (
              <option key={id} value={id}>
                {SCENARIO_LABEL[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed{' '}
          <input
            data-testid="new-game-seed"
            inputMode="numeric"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        <button type="button" className="link" onClick={() => setSeed(String(randomSeed()))}>
          Lấy seed ngẫu nhiên khác
        </button>
        <p className="small muted">
          Seed quyết định đối thủ và mọi yếu tố ngẫu nhiên. Cùng bản đồ và cùng seed thì ván diễn ra y hệt.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="primary"
            data-testid="new-game-start"
            disabled={!valid}
            onClick={() => {
              newGame({ scenario, seed: value });
              onClose();
            }}
          >
            Bắt đầu
          </button>
          <button type="button" onClick={onClose}>
            Thôi
          </button>
        </div>
      </div>
    </div>
  );
}
