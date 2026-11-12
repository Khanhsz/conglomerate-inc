/** Trạng thái hoạt động của công ty (economic-model §8, §20.2). */

/** Đã bị loại khỏi thị trường: phá sản hoặc rút lui. Công ty như vậy không còn vận hành, quyết định hay chốt tháng. */
export function isOut(company: { readonly status: string }): boolean {
  return company.status === 'bankrupt' || company.status === 'exited';
}
