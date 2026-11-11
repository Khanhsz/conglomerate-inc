/**
 * Dữ liệu không qua kiểu, giả lập input sai đến từ JSON (UI, file lưu). Chỉ dùng trong test để kiểm
 * validate; đây là chỗ duy nhất ở test được bỏ qua kiểm kiểu (#53).
 */
export function untyped<T>(json: string): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- cố ý: test đưa dữ liệu sai kiểu vào validate.
  return JSON.parse(json);
}
