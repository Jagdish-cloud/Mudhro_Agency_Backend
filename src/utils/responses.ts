export type ApiSuccess<T> = {
  success: true;
  data: T;
  message?: string;
};

export function ok<T>(data: T, message?: string): ApiSuccess<T> {
  return { success: true, data, message };
}

export function created<T>(data: T, message?: string): ApiSuccess<T> {
  return { success: true, data, message };
}
