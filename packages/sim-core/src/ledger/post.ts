/** Ghi sổ kép (economic-model §6, §13 bất biến 1 và 3). Điểm ghi duy nhất vào Ledger. */
import type { CompanyId } from '../types/content';
import type { JournalEntry, JournalLine, Ledger, NewJournalEntry } from '../types/ledger';
import { ACC, isAccountCode, zeroBalances } from './accounts';
import { applyLines } from './balances';

/** Bút toán sai là lỗi lập trình của system/command, nên ném chứ không trả Rejected. */
export class LedgerError extends Error {
  override name = 'LedgerError';
}

export function createLedger(): Ledger {
  return { entries: [], nextEntryId: 1, balances: {} };
}

function fail(entry: NewJournalEntry, reason: string): never {
  throw new LedgerError(
    `post(day ${String(entry.day)}, ${JSON.stringify(entry.companyId)}, "${entry.memo}"): ${reason}`,
  );
}

/** Kiểm lúc chạy cho input không qua kiểu; không phải type guard nên không thu hẹp về any[] (#53). */
const isArrayValue = (v: unknown): boolean => Array.isArray(v);

function validate(ledger: Ledger, entry: NewJournalEntry): void {
  if (typeof entry.companyId !== 'string' || entry.companyId === '')
    fail(entry, 'companyId must be a non-empty string');
  if (!Number.isSafeInteger(entry.day) || entry.day < 0) fail(entry, 'day must be a non-negative integer');
  const last = ledger.entries[ledger.entries.length - 1];
  if (last && entry.day < last.day)
    fail(entry, `day ${entry.day} is before the last entry (day ${last.day})`);
  const lines = entry.lines;
  if (!isArrayValue(lines) || lines.length < 2) fail(entry, 'needs at least two lines');

  let debits = 0;
  let credits = 0;
  lines.forEach((line, i) => {
    if (!isAccountCode(line.account)) fail(entry, `line ${i}: unknown account ${String(line.account)}`);
    const { debit, credit } = line;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0) {
      fail(entry, `line ${i}: amounts must be non-negative safe integers (debit ${debit}, credit ${credit})`);
    }
    if (debit > 0 === credit > 0) fail(entry, `line ${i}: exactly one side must be > 0`);
    debits += debit;
    credits += credit;
  });
  if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits)) fail(entry, 'totals overflow');
  if (debits !== credits) fail(entry, `unbalanced: debits ${debits} ≠ credits ${credits}`);
}

/**
 * Ghi một bút toán: kiểm tra, gán id, cập nhật số dư hiện tại. Mutate `ledger` (immer draft hoặc object thường).
 * Lỗi → ném `LedgerError`, ledger không đổi.
 */
export function post(ledger: Ledger, entry: NewJournalEntry): JournalEntry {
  validate(ledger, entry);
  const companyId: CompanyId = entry.companyId;
  const lines: JournalLine[] = entry.lines.map(({ account, debit, credit }) => ({ account, debit, credit }));

  const balances = { ...(ledger.balances[companyId] ?? zeroBalances()) };
  applyLines(balances, lines);
  if (balances[ACC.Cash] < 0)
    fail(entry, `Cash would become ${balances[ACC.Cash]}; pay through pay() to draw overdraft`);
  if (balances[ACC.Overdraft] < 0) fail(entry, `Overdraft would become ${balances[ACC.Overdraft]}`);

  const posted: JournalEntry = {
    id: ledger.nextEntryId,
    day: entry.day,
    companyId,
    memo: entry.memo,
    ...(entry.refId === undefined ? {} : { refId: entry.refId }),
    lines,
  };
  ledger.entries.push(posted);
  ledger.nextEntryId += 1;
  ledger.balances[companyId] = balances;
  return posted;
}
