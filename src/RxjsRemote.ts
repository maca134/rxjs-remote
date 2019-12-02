import { Observable, Subscription } from 'rxjs';
import { RequestType, RxjsRemoteRequest, RxjsAttachConfig, generateUuidV4 } from '@maca134/rxjs-remote-client';
import { RocMiddleware } from './RocMiddleware';
import { RocMethodEntry } from './RocMethodEntry';

export class RxjsRemote<T = any> {
	public logger = (message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info') =>
		console[level === 'error' ? 'error' : 'log'](`${new Date().toISOString()} [${level}] ${message}`);

	private readonly _registry = new Map<string, { method: (...args: any[]) => Observable<any>, inject: boolean, middleware: RocMiddleware<T>[] }>();
	private readonly _subscribers = new Map<string, Map<string, Subscription>>();

	registerClass(instance: InstanceType<any>) {
		return this.registerClasses([instance]);
	}

	registerClasses(instances: InstanceType<any>[]) {
		if (!Array.isArray(instances)) {
			instances = [instances];
		}
		for (const instance of instances) {
			if (!Reflect.hasMetadata('rocmethods', instance.constructor)) {
				throw new Error('no roc decorators found');
			}
			const methods = Reflect.getMetadata('rocmethods', instance.constructor) as Map<string, RocMethodEntry<T>>;
			this.logger(`found ${methods.size} method(s) for class '${instance.constructor.name}'`);
			for (const [rpcName, methodEntry] of methods.entries()) {
				const paramTypes = Reflect.getMetadata('design:paramtypes', instance, methodEntry.name)
					.map(target => target.name.toLowerCase());
				this.logger(`adding method ${instance.constructor.name}.${rpcName}(${paramTypes.join(', ')})`);
				this._registry.set(
					`${instance.constructor.name}.${rpcName}`,
					{
						middleware: methodEntry.middleware,
						inject: methodEntry.inject,
						method: (...args: any[]) => {
							if (args.length !== paramTypes.length) {
								throw new Error('invalid argument count');
							}
							for (let i = 0; i < args.length; i++) {
								if (
									typeof args[i] !== paramTypes[i] && args[i].constructor.name.toLowerCase() !== paramTypes[i]
								) {
									throw new Error(`argument ${i} has an invalid type expected ${paramTypes[i]} got ${typeof args[i]}`);
								}
							}
							return instance[methodEntry.name].bind(instance)(...args);
						},
					}
				);
			}
		}
	}

	attach(config: RxjsAttachConfig, obj?: T) {
		const attachId = generateUuidV4();
		config.onClose(() => this.onClose(attachId));
		config.onMessage(message => this.onMessage(config, attachId, message, obj));
	}

	private onClose(attachId: string) {
		if (!this._subscribers.has(attachId)) {
			return;
		}
		for (const [_, subscriber] of this._subscribers.get(attachId)) {
			subscriber.unsubscribe();
		}
		this._subscribers.delete(attachId);
	}

	private async onMessage(config: RxjsAttachConfig, attachId: string, message: RxjsRemoteRequest, obj?: T) {
		if (!this._subscribers.has(attachId)) {
			this._subscribers.set(attachId, new Map);
		}
		const subscribers = this._subscribers.get(attachId);

		switch (message.type) {
			case RequestType.start:
				if (!this._registry.has(message.name)) {
					config.send({ type: 'error', id: message.id, error: 'no matching id' });
					return;
				}
				const methodEntry = this._registry.get(message.name);

				for (const middleware of methodEntry.middleware) {
					await Promise.resolve(middleware(obj));
				}
				const args = methodEntry.inject ? [obj, ...message.args] : message.args;

				let observable: Observable<any>;
				try {
					observable = methodEntry.method(...args);
				} catch (error) {
					config.send({ type: 'error', id: message.id, error: error.message || error });
					return;
				}
				subscribers.set(message.id, observable.subscribe({
					next: value => config.send({ type: 'next', id: message.id, value }),
					error: error => {
						subscribers.delete(message.id);
						config.send({ type: 'error', id: message.id, error });
					},
					complete: () => {
						subscribers.delete(message.id);
						config.send({ type: 'complete', id: message.id });
					},
				}));
				break;
			case RequestType.complete:
				if (!subscribers.has(message.id)) {
					config.send({ type: 'error', id: message.id, error: 'the observable id does not exist' });
					return;
				}
				subscribers.get(message.id).unsubscribe();
				subscribers.delete(message.id);
				break;
		}
	}
}



