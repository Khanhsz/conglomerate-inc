/**
 * Thế giới nhiều thành phố (ADR-0003, economic-model §2): mọi địa điểm xếp thành một danh sách phẳng,
 * thành phố theo thứ tự scenario rồi địa điểm theo thứ tự trong thành phố. Vị trí trong danh sách là chỉ số
 * dùng chung cho ô nhận biết (`e × S + s`) và cho vòng lặp cầu. Một thành phố thì trùng với danh sách quận của M1.
 * Bảng tra được tính một lần cho mỗi scenario (content bất biến) và không nằm trong state.
 */
import type { CityDef, DistrictDef, LoadedContent, ScenarioContent } from './types/content';

export interface World {
  readonly cities: readonly CityDef[];
  /** Mọi địa điểm, theo thứ tự chuẩn. */
  readonly districts: readonly DistrictDef[];
  /** Chỉ số thành phố của từng địa điểm (cùng thứ tự với `districts`). */
  readonly cityOf: readonly number[];
  /** Chỉ số địa điểm theo id. */
  readonly indexOf: ReadonlyMap<string, number>;
  /** Chỉ số thành phố theo id. */
  readonly cityIndexOf: ReadonlyMap<string, number>;
  /** Tổng dân số từng thành phố. */
  readonly cityPop: readonly number[];
  /** Chỉ số địa điểm đầu tiên và số địa điểm của từng thành phố. */
  readonly cityStart: readonly number[];
  readonly citySize: readonly number[];
}

const cache = new WeakMap<ScenarioContent, World>();

export function worldOf(content: LoadedContent): World {
  const hit = cache.get(content.scenario);
  if (hit) return hit;
  const districts: DistrictDef[] = [];
  const cityOf: number[] = [];
  const indexOf = new Map<string, number>();
  const cityIndexOf = new Map<string, number>();
  const cityPop: number[] = [];
  const cityStart: number[] = [];
  const citySize: number[] = [];
  content.scenario.cities.forEach((city, k) => {
    cityIndexOf.set(city.id, k);
    cityStart.push(districts.length);
    citySize.push(city.districts.length);
    let pop = 0;
    for (const d of city.districts) {
      indexOf.set(d.id, districts.length);
      districts.push(d);
      cityOf.push(k);
      pop += d.pop;
    }
    cityPop.push(pop);
  });
  const world: World = {
    cities: content.scenario.cities,
    districts,
    cityOf,
    indexOf,
    cityIndexOf,
    cityPop,
    cityStart,
    citySize,
  };
  cache.set(content.scenario, world);
  return world;
}

/** Mọi địa điểm của scenario theo thứ tự chuẩn. */
export function worldDistricts(content: LoadedContent): readonly DistrictDef[] {
  return worldOf(content).districts;
}

export function districtById(content: LoadedContent, districtId: string): DistrictDef | undefined {
  const world = worldOf(content);
  const i = world.indexOf.get(districtId);
  return i === undefined ? undefined : world.districts[i];
}

/** Thành phố chứa địa điểm; undefined nếu id không tồn tại. */
export function cityOfDistrict(content: LoadedContent, districtId: string): CityDef | undefined {
  const world = worldOf(content);
  const i = world.indexOf.get(districtId);
  const k = i === undefined ? undefined : world.cityOf[i];
  return k === undefined ? undefined : world.cities[k];
}
