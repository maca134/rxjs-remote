export type RocMiddleware<T> = (obj?: T) => void | Promise<void>;
