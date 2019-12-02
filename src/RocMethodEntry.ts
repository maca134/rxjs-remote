import { RocMiddleware } from './RocMiddleware';

export type RocMethodEntry<T> = {
	name: string;
	inject: boolean;
	middleware: RocMiddleware<T>[];
};
