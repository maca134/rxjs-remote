import 'reflect-metadata';
import { createSocket } from 'dgram';
import { finalize, take } from 'rxjs/operators';
import { roc, RxjsRemote } from '../';
import { RxjsRemoteClient } from '@maca134/rxjs-remote-client';
import { timer } from 'rxjs';

export class SomeClass {
	@roc()
	timer() {
		console.log('timer called');
		return timer(0, 1000)
			.pipe(finalize(() => console.log('timer complete on server')));
	}
}

(async () => {
	// Setup some udp sockets
	const serverUdp = createSocket('udp4');
	await new Promise(resolve => serverUdp.bind(8046, resolve));

	const clientUdp = createSocket('udp4');
	await new Promise(resolve => clientUdp.connect(8046, resolve));

	// SERVER SETUP
	const rxjsRemoteServer = new RxjsRemote();

	// Register a class instance
	rxjsRemoteServer.registerClass(new SomeClass);

	// Attach to some long-live socket (Socket.io, websocket, UDP)
	rxjsRemoteServer.attach({
		on: listener => serverUdp.on('message', message => listener(JSON.parse(message.toString()))),
		send: data => serverUdp.send(JSON.stringify(data), clientUdp.address().port)
	});


	// CLIENT

	// Give client an object for receiving and sending data
	const rxjsRemoteClient = new RxjsRemoteClient({
		on: listener => clientUdp.on('message', message => listener(JSON.parse(message.toString()))),
		send: data => clientUdp.send(JSON.stringify(data))
	});

	// Use like normal observables
	rxjsRemoteClient.observable<number>('SomeClass.timer')
		.pipe(
			take(5)
		)
		.subscribe(
			next => console.log('next', next),
			error => console.log('error', error),
			() => {
				console.log('complete');
				setTimeout(() => {
					clientUdp.close();
					serverUdp.close();
				}, 1000);
			},
		);
})();