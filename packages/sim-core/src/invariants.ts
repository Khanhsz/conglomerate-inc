/** hashState và kiểm tra bất biến (economic-model §13, spec §5). Chỉ đọc state. */
import { MAX_STAFF_PER_STORE } from './constants';
import { hashValue, StableStringifyError, stableStringify } from './hash';
import { ACC, ACCOUNT_CODES, zeroBalances } from './ledger/accounts';
import { applyLines, retainedEarnings } from './ledger/balances';
import { checkStatements } from './ledger/statements';
import type { LoadedContent } from './types/content';
import type { AccountBalances } from './types/ledger';
import type { GameState } from './types/state';

export type InvariantCode =
  'content' | 'finite' | 'ids' | 'ledger' | 'loans' | 'balance' | 'cash' | 'range' | 'demand' | 'statements';

export interface InvariantViolation {
  readonly code: InvariantCode;
  readonly message: string;
}

/** FNV-1a 64-bit trên stableStringify(state) (ADR-0001 #10). */
export function hashState(state: GameState): string {
  return hashValue(state);
}

const EPS = 1e-9;
const isUnit = (x: number) => x >= 0 && x <= 1;

function checkIds(state: GameState, out: InvariantViolation[]): void {
  const lists = [
    ['companyIds', state.companyIds, state.companies],
    ['storeIds', state.storeIds, state.stores],
    ['loanIds', state.loanIds, state.loans],
  ] as const;
  for (const [name, ids, record] of lists) {
    const sorted = [...ids].sort();
    if (ids.some((id, i) => id !== sorted[i]) || new Set(ids).size !== ids.length) {
      out.push({ code: 'ids', message: `${name} chưa sort hoặc có id trùng` });
    }
    const keys = Object.keys(record).sort();
    if (keys.length !== sorted.length || keys.some((k, i) => k !== sorted[i])) {
      out.push({ code: 'ids', message: `${name} không khớp với key của record` });
    }
  }
}

function checkLedger(state: GameState, out: InvariantViolation[]): Map<string, AccountBalances> {
  const recomputed = new Map<string, AccountBalances>();
  let lastDay = 0;
  let lastId = 0;
  for (const entry of state.ledger.entries) {
    let debits = 0;
    let credits = 0;
    for (const line of entry.lines) {
      const okLine =
        Number.isSafeInteger(line.debit) &&
        Number.isSafeInteger(line.credit) &&
        line.debit >= 0 &&
        line.credit >= 0 &&
        line.debit > 0 !== line.credit > 0;
      if (!okLine)
        out.push({
          code: 'ledger',
          message: `bút toán ${entry.id}: dòng ${line.account} sai (${line.debit}/${line.credit})`,
        });
      debits += line.debit;
      credits += line.credit;
    }
    if (debits !== credits)
      out.push({ code: 'ledger', message: `bút toán ${entry.id} không cân: Nợ ${debits} ≠ Có ${credits}` });
    if (entry.day < lastDay || entry.id <= lastId) {
      out.push({
        code: 'ledger',
        message: `bút toán ${entry.id} sai thứ tự (day ${entry.day}, id ${entry.id})`,
      });
    }
    lastDay = entry.day;
    lastId = entry.id;
    let balances = recomputed.get(entry.companyId);
    if (!balances) {
      balances = zeroBalances();
      recomputed.set(entry.companyId, balances);
    }
    applyLines(balances, entry.lines);
  }
  if (state.ledger.nextEntryId <= lastId)
    out.push({ code: 'ledger', message: 'nextEntryId không lớn hơn id cuối' });

  const companies = new Set([...recomputed.keys(), ...Object.keys(state.ledger.balances)]);
  for (const companyId of [...companies].sort()) {
    const stored = state.ledger.balances[companyId];
    const fresh = recomputed.get(companyId) ?? zeroBalances();
    for (const code of ACCOUNT_CODES) {
      if ((stored?.[code] ?? 0) !== fresh[code]) {
        out.push({
          code: 'ledger',
          message: `ledger.balances[${companyId}][${code}] = ${stored?.[code]}, tính lại từ sổ = ${fresh[code]}`,
        });
      }
    }
  }
  return recomputed;
}

/** Danh sách vi phạm bất biến; rỗng = hợp lệ. Dùng trong test và balance:smoke. */
export function checkInvariants(state: GameState, content: LoadedContent): InvariantViolation[] {
  const out: InvariantViolation[] = [];

  if (state.contentRef.contentVersion !== content.contentVersion) {
    out.push({
      code: 'content',
      message: `contentVersion ${state.contentRef.contentVersion} ≠ ${content.contentVersion}`,
    });
  }

  // Bất biến 7: không NaN/Infinity/undefined ở bất kỳ đâu (stableStringify từ chối và chỉ ra đường dẫn).
  try {
    stableStringify(state);
  } catch (e) {
    if (!(e instanceof StableStringifyError)) throw e;
    out.push({ code: 'finite', message: e.message });
  }

  checkIds(state, out);

  // Bất biến 1 + số dư lưu sẵn khớp sổ.
  const balances = checkLedger(state, out);

  // Bất biến 2–3 cho từng công ty.
  for (const companyId of state.companyIds) {
    const b = balances.get(companyId) ?? zeroBalances();
    const assets = b[ACC.Cash] + b[ACC.PPE] - b[ACC.AccumulatedDepreciation];
    const liabilities = b[ACC.Overdraft] + b[ACC.TaxPayable] + b[ACC.Loans];
    const equity = b[ACC.ShareCapital] + retainedEarnings(b);
    if (assets !== liabilities + equity) {
      out.push({
        code: 'balance',
        message: `${companyId}: tài sản ${assets} ≠ nợ ${liabilities} + vốn chủ ${equity}`,
      });
    }
    if (b[ACC.Cash] < 0) out.push({ code: 'cash', message: `${companyId}: Cash = ${b[ACC.Cash]} < 0` });
    if (b[ACC.Overdraft] < 0)
      out.push({ code: 'cash', message: `${companyId}: Overdraft = ${b[ACC.Overdraft]} < 0` });

    let outstanding = 0;
    for (const loanId of state.loanIds) {
      const loan = state.loans[loanId];
      if (loan?.companyId === companyId) outstanding += loan.outstanding;
    }
    if (outstanding !== b[ACC.Loans]) {
      out.push({
        code: 'loans',
        message: `${companyId}: Σ dư nợ vay ${outstanding} ≠ số dư Loans ${b[ACC.Loans]}`,
      });
    }

    const company = state.companies[companyId];
    if (company) {
      const bad = company.awareness.find((a) => !isUnit(a));
      if (bad !== undefined) {
        out.push({ code: 'range', message: `${companyId}: awareness có ô = ${bad} ngoài [0, 1]` });
      }
      // §18.3: tổng phần đóng góp của các kênh không vượt nhận biết của ô.
      company.awareness.forEach((a, i) => {
        let attributed = 0;
        for (const c of company.channelAwareness) attributed += c.cells[i] ?? 0;
        if (attributed < 0 || attributed > a + 1e-9) {
          out.push({
            code: 'range',
            message: `${companyId}: phần đóng góp của kênh ở ô ${i} = ${attributed} ngoài [0, A = ${a}]`,
          });
        }
      });
    }
  }

  const minStaff = content.industry.minStaffPerStore;
  for (const id of state.storeIds) {
    const s = state.stores[id];
    if (!s) continue;
    for (const [field, value] of [
      ['morale', s.morale],
      ['skill', s.skill],
      ['serviceLevel', s.serviceLevel],
    ] as const) {
      if (!isUnit(value)) out.push({ code: 'range', message: `${id}: ${field} = ${value} ngoài [0, 1]` });
    }
    if (!Number.isSafeInteger(s.staff) || s.staff < minStaff || s.staff > MAX_STAFF_PER_STORE) {
      out.push({
        code: 'range',
        message: `${id}: staff = ${s.staff} ngoài [${minStaff}, ${MAX_STAFF_PER_STORE}]`,
      });
    }
    if (!(s.price > 0 && s.wageMonthly > 0)) {
      out.push({ code: 'range', message: `${id}: giá ${s.price} / lương ${s.wageMonthly} phải > 0` });
    }
    // Bất biến 6.
    const t = s.today;
    if (t.demand < 0 || t.served < 0 || t.served > t.capacity + EPS || t.served > t.demand + EPS) {
      out.push({
        code: 'demand',
        message: `${id}: served ${t.served}, capacity ${t.capacity}, demand ${t.demand}`,
      });
    }
  }

  // Bất biến 9 và các đẳng thức báo cáo, cho mọi báo cáo đã lưu.
  for (const companyId of state.companyIds) {
    for (const s of state.statements[companyId] ?? []) {
      for (const problem of checkStatements(s)) out.push({ code: 'statements', message: problem });
    }
  }
  return out;
}
