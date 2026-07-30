/** A value that may be null. */
export type Nullable<T> = T | null;

/** A value that may be undefined. */
export type Optional<T> = T | undefined;

/** Recursively marks object properties as optional. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepPartial<Item>[]
    : T extends object
      ? { [Key in keyof T]?: DeepPartial<T[Key]> }
      : T;

/** Represents an operation that either succeeds with data or fails with an error. */
export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

/** Normalized API response envelope for future transports. */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers?: Readonly<Record<string, string>>;
}

/** A resource that exposes explicit cleanup. */
export interface Disposable {
  dispose(): void;
}

