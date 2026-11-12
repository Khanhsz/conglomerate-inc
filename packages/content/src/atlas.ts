/**
 * Bộ sinh scenario `atlas` (M1.8, ADR-0003): 7 thành phố, mỗi nơi 30–35 địa điểm chia 3 khu.
 * Đầu ra là YAML commit ở `scenarios/atlas.yaml`; test so khớp file với hàm này, nên muốn đổi thành phố thì sửa
 * bảng dưới đây rồi chạy `pnpm content:atlas`. Thành phố cố định giữa các ván: dao động từng địa điểm lấy từ một
 * seed cố định của bộ sinh, không phải seed của ván.
 */
import { createRngFactory, type Rng, type Zone } from '@game/sim-core';

/** Seed của bộ sinh (không liên quan seed ván chơi). */
const ATLAS_SEED = 20261112;

const ZONE_OF: Readonly<Record<string, Zone>> = { B: 'budget', C: 'central', P: 'premium' };
const ZONE_CODE: Readonly<Record<Zone, string>> = { budget: 'b', central: 'c', premium: 'p' };

const SEGMENTS = ['students', 'office', 'premium', 'other'] as const;
type Segment = (typeof SEGMENTS)[number];
type Weights = Readonly<Record<Segment, number>>;

interface ZoneSpec {
  /** Dân số một địa điểm (người). */
  readonly pop: readonly [number, number];
  /** Tỷ trọng gốc của 4 nhóm khách (chuẩn hóa sau khi nhân hệ số thành phố). */
  readonly mix: Weights;
  /** Thuê / tháng và chi phí mở cửa hàng, cent, trước hệ số thành phố. */
  readonly rent: readonly [number, number];
  readonly fitOut: readonly [number, number];
}

/** Ba khu (economic-model §2): bình dân đông và rẻ, trung tâm đông dân văn phòng, cao cấp thưa và đắt. */
const ZONES: Readonly<Record<Zone, ZoneSpec>> = {
  budget: {
    pop: [20_000, 26_000],
    mix: { students: 0.35, office: 0.2, premium: 0.05, other: 0.4 },
    rent: [430_000, 560_000],
    fitOut: [10_000_000, 11_500_000],
  },
  central: {
    pop: [24_000, 32_000],
    mix: { students: 0.12, office: 0.58, premium: 0.12, other: 0.18 },
    rent: [680_000, 940_000],
    fitOut: [12_500_000, 14_500_000],
  },
  premium: {
    pop: [14_000, 20_000],
    mix: { students: 0.08, office: 0.27, premium: 0.35, other: 0.3 },
    rent: [800_000, 1_020_000],
    fitOut: [13_500_000, 15_500_000],
  },
};

interface CitySpec {
  readonly id: string;
  /** Tiền tố id địa điểm. */
  readonly code: string;
  readonly name: string;
  readonly note: string;
  /** Lưới: B = bình dân, C = trung tâm, P = cao cấp, dấu chấm = ô trống. */
  readonly map: readonly string[];
  readonly popScale: number;
  readonly rentScale: number;
  /** Hệ số nhân tỷ trọng nhóm khách (mặc định 1). */
  readonly tilt: Partial<Weights>;
}

export const ATLAS_CITIES: readonly CitySpec[] = [
  {
    id: 'riverton',
    code: 'rv',
    name: 'Riverton',
    note: 'thủ phủ, cân bằng',
    map: ['BBCCPP.', 'BCCCPPP', 'BCCC.PP', 'BBCCBP.', '.BBBBB.', '..BB...'],
    popScale: 1,
    rentScale: 1,
    tilt: {},
  },
  {
    id: 'port-azure',
    code: 'pa',
    name: 'Port Azure',
    note: 'cảng, khu bình dân lớn',
    map: ['..BBBBB', '.BBBCCP', '.BBCCPP', 'BBBCCPP', 'BBBCCP.', '.BBBC..'],
    popScale: 1.05,
    rentScale: 0.95,
    tilt: { other: 1.3 },
  },
  {
    id: 'highmont',
    code: 'hm',
    name: 'Highmont',
    note: 'du lịch, khu cao cấp lớn',
    map: ['.PPP.PP', 'PPPPCC.', '.PPCCCB', '..CCCBB', '.BCCBB.', '..BBB..'],
    popScale: 0.85,
    rentScale: 1.15,
    tilt: { premium: 1.5 },
  },
  {
    id: 'campus-vale',
    code: 'cv',
    name: 'Campus Vale',
    note: 'đại học, rất đông sinh viên',
    map: ['BBBB...', 'BBBCC..', 'BBCCCP.', '.BCCCPP', '.BBCPPP', '..BBPP.'],
    popScale: 0.9,
    rentScale: 0.9,
    tilt: { students: 1.8 },
  },
  {
    id: 'ironbridge',
    code: 'ib',
    name: 'Ironbridge',
    note: 'công nghiệp, thuê rẻ',
    map: ['BBB.BBB', 'BBCCCBB', 'BCCCCB.', 'BBCCPP.', '.BBPPP.', '..BPP..'],
    popScale: 1,
    rentScale: 0.8,
    tilt: { other: 1.3, premium: 0.7 },
  },
  {
    id: 'silverlake',
    code: 'sl',
    name: 'Silverlake',
    note: 'tài chính, văn phòng đông, thuê đắt',
    map: ['PPCCCCB', 'PPCCCCB', 'PC..CCB', 'PC..CBB', 'PPCCBBB', '.PBBB..'],
    popScale: 1.15,
    rentScale: 1.3,
    tilt: { office: 1.4 },
  },
  {
    id: 'sunfield',
    code: 'sf',
    name: 'Sunfield',
    note: 'đô thị mới, dân thưa',
    map: ['.BB.CC.', 'BBBCCCP', 'BBCCCPP', '.BBCPPP', '..BBPP.', '...BP..'],
    popScale: 0.75,
    rentScale: 0.85,
    tilt: {},
  },
];

const roundTo = (x: number, step: number) => Math.round(x / step) * step;
const between = (rng: Rng, [lo, hi]: readonly [number, number]) => lo + rng.float() * (hi - lo);

/** Tỷ trọng 4 nhóm khách: gốc × hệ số thành phố × dao động ±10%, chuẩn hóa, làm tròn 0.01, tổng đúng 1. */
function mixOf(rng: Rng, base: Weights, tilt: Partial<Weights>): Record<Segment, number> {
  const raw = SEGMENTS.map((s) => base[s] * (tilt[s] ?? 1) * (0.9 + 0.2 * rng.float()));
  const total = raw.reduce((a, b) => a + b, 0);
  const hundredths = raw.map((w) => Math.round((w / total) * 100));
  // Nhóm cuối (other) nhận phần còn lại để tổng đúng 100.
  const head = hundredths.slice(0, -1);
  const last = 100 - head.reduce((a, b) => a + b, 0);
  const parts = [...head, last];
  const out = { students: 0, office: 0, premium: 0, other: 0 };
  SEGMENTS.forEach((s, i) => {
    out[s] = (parts[i] ?? 0) / 100;
  });
  return out;
}

interface District {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly zone: Zone;
  readonly pop: number;
  readonly mix: Record<Segment, number>;
  readonly rentMonthly: number;
  readonly fitOutCost: number;
}

/** Địa điểm của một thành phố theo thứ tự đọc bản đồ (trên xuống, trái sang phải). */
export function atlasDistricts(city: CitySpec): District[] {
  const rng = createRngFactory(ATLAS_SEED)(`atlas:${city.id}`, 0);
  const counters: Record<Zone, number> = { budget: 0, central: 0, premium: 0 };
  const out: District[] = [];
  city.map.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const zone = ZONE_OF[cell];
      if (!zone) return;
      counters[zone] += 1;
      const spec = ZONES[zone];
      out.push({
        id: `${city.code}-${ZONE_CODE[zone]}${counters[zone]}`,
        x,
        y,
        zone,
        pop: roundTo(between(rng, spec.pop) * city.popScale, 500),
        mix: mixOf(rng, spec.mix, city.tilt),
        rentMonthly: roundTo(between(rng, spec.rent) * city.rentScale, 5_000),
        fitOutCost: roundTo(between(rng, spec.fitOut) * city.rentScale, 100_000),
      });
    });
  });
  return out;
}

const HEADER = `# Scenario atlas (M1.8): 7 thành phố, mỗi nơi 30–35 địa điểm chia 3 khu (budget / central / premium).
# FILE SINH TỰ ĐỘNG từ packages/content/src/atlas.ts. Không sửa tay: sửa bảng trong atlas.ts rồi chạy \`pnpm content:atlas\`.
id: atlas
industry: coffee
seed: 42

macro:
  inflationAnnual: 0.03
  policyRateAnnual: 0.04
  incomeIndex: 1.0
  priceIndex: 1.0
  corporateTaxRate: 0.20
  marketWageMonthly: 220000      # $2,200

finance:
  overdraftFloor: 2000000        # $20,000
  overdraftSpread: 0.08
  loanSpreads:
    - { maxLeverage: 1, spread: 0.02 }
    - { maxLeverage: 2, spread: 0.035 }
    - { maxLeverage: 3, spread: 0.05 }
  earlyRepaymentFee: 0.01
  creditLine:
    revenueMultiple: 2
    maxLeverage: 2
    spreadDiscount: 0.02
    commitmentFeeAnnual: 0.005
`;

const FOOTER = `
companies:
  - { id: player, name: "Founder Co.", kind: player, startingCash: 25000000, initialStores: [] }

# Đối thủ sinh từ seed của ván (economic-model §20). Đề xuất ban đầu (#62).
competition:
  initial: { localPerCity: [2, 3], chains: [2, 3] }   # mỗi thành phố 2–3 chuỗi địa phương; 2–3 chuỗi liên thành phố
  maxPerCity: 5
  exitAfterMonthsWithoutStores: 3
  entryDelayMonths: [1, 4]
  attractive: { margin: 0.25, months: 6 }            # biên lãi đóng góp của thành phố trong 6 tháng
`;

export function buildAtlasYaml(): string {
  const lines: string[] = [HEADER, 'cities:'];
  for (const city of ATLAS_CITIES) {
    const districts = atlasDistricts(city);
    const pop = districts.reduce((a, d) => a + d.pop, 0);
    lines.push(
      `  # ${city.name}: ${city.note}. ${districts.length} địa điểm, ${pop.toLocaleString('en-US')} dân.`,
      `  - id: ${city.id}`,
      `    name: "${city.name}"`,
      `    gridW: ${Math.max(...city.map.map((r) => r.length))}`,
      `    gridH: ${city.map.length}`,
      '    districtSizeKm: 2',
      '    sameDistrictKm: 0.5',
      '    districts:',
    );
    for (const d of districts) {
      const mix = SEGMENTS.map((s) => `${s}: ${d.mix[s].toFixed(2)}`).join(', ');
      lines.push(
        `      - { id: ${d.id}, x: ${d.x}, y: ${d.y}, zone: ${d.zone}, pop: ${d.pop}, mix: { ${mix} }, rentMonthly: ${d.rentMonthly}, fitOutCost: ${d.fitOutCost} }`,
      );
    }
  }
  lines.push(FOOTER);
  return lines.join('\n');
}
