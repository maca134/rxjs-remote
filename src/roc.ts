import { RocMethodEntry } from './RocMethodEntry';

export function roc<T = any>(options: Partial<RocMethodEntry<T>> = {}): MethodDecorator {
	return (target, methodName: string): void => {
		if (!Reflect.hasMetadata('rocmethods', target.constructor)) {
			Reflect.defineMetadata('rocmethods', new Map<string, RocMethodEntry<T>>(), target.constructor);
		}
		const rocmethods = Reflect.getMetadata('rocmethods', target.constructor) as Map<string, RocMethodEntry<T>>;
		rocmethods.set(options.name || methodName, { name: methodName, inject: !!options.inject, middleware: options.middleware || [] });
	};
}
