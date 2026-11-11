/** Lệnh của người chơi / AI (spec §3, ADR-0001 #6). */
import type { Money } from '../money';
import type { CompanyId, Department, DistrictId, OfficeSize, QualityTier } from './content';

type StoreRef = string;

export type Command =
  | {
      readonly type: 'OpenStore';
      readonly companyId: CompanyId;
      readonly payload: { readonly districtId: DistrictId };
    }
  | {
      readonly type: 'CloseStore';
      readonly companyId: CompanyId;
      readonly payload: { readonly storeId: StoreRef };
    }
  | {
      readonly type: 'SetPrice';
      readonly companyId: CompanyId;
      readonly payload: { readonly storeId: StoreRef | 'all'; readonly price: Money };
    }
  | {
      readonly type: 'SetStaff';
      readonly companyId: CompanyId;
      readonly payload: { readonly storeId: StoreRef; readonly staff: number };
    }
  | {
      readonly type: 'SetWage';
      readonly companyId: CompanyId;
      readonly payload: { readonly storeId: StoreRef | 'all'; readonly wageMonthly: Money };
    }
  | {
      readonly type: 'SetMarketingBudget';
      readonly companyId: CompanyId;
      readonly payload: { readonly monthly: Money };
    }
  | {
      readonly type: 'SetQualityTier';
      readonly companyId: CompanyId;
      readonly payload: { readonly tier: QualityTier };
    }
  | {
      readonly type: 'TakeLoan';
      readonly companyId: CompanyId;
      readonly payload: { readonly principal: Money; readonly termMonths: number };
    }
  | {
      readonly type: 'RepayLoan';
      readonly companyId: CompanyId;
      readonly payload: { readonly loanId: string };
    }
  | {
      readonly type: 'LeaseOffice';
      readonly companyId: CompanyId;
      readonly payload: { readonly districtId: DistrictId; readonly size: OfficeSize };
    }
  | {
      readonly type: 'ReleaseOffice';
      readonly companyId: CompanyId;
      readonly payload: Readonly<Record<string, never>>;
    }
  | {
      readonly type: 'OpenDepartment';
      readonly companyId: CompanyId;
      readonly payload: { readonly dept: Department };
    }
  | {
      readonly type: 'CloseDepartment';
      readonly companyId: CompanyId;
      readonly payload: { readonly dept: Department };
    };

export type CommandType = Command['type'];

export const COMMAND_TYPES = [
  'OpenStore',
  'CloseStore',
  'SetPrice',
  'SetStaff',
  'SetWage',
  'SetMarketingBudget',
  'SetQualityTier',
  'TakeLoan',
  'RepayLoan',
  'LeaseOffice',
  'ReleaseOffice',
  'OpenDepartment',
  'CloseDepartment',
] as const satisfies readonly CommandType[];

export type Validation = { readonly ok: true } | { readonly ok: false; readonly reason: string };
