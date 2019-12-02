# RxJs Remote

This is basically RxJs observable over some kind of network connection. It should work over pretty much any long living connection, i've had it working with socket.io and UDP. Observables get cleanup when things go wrong or something disconnects.

Client files are here https://github.com/maca134/rxjs-remote-client

Install use `npm install --save @maca134/rxjs-remote`

## Quick Start (using Socket.io)

#### server
```typescript
// server.ts
import 'reflect-metadata';
import { timer } from 'rxjs';
import * as ioServer from 'socket.io';
import { finalize } from 'rxjs/operators';
import { RxjsRemote, roc } from '../../rxjs-remote/src';

class SomeClass {
	@roc()
	timer1() {
		console.log('timer1 called');
		return timer(0, 1000).pipe(finalize(() => console.log('timer complete')));
	}

	@roc<ioServer.Socket>({
		// adds the object give in attach as the first params (you may need the socket for something?)
		inject: true, 

		// change the name of the call, in this case the call name is 'SomeClass.notTimer3'
		name: 'notTimer2', 

		// an array of middleware to run before call the method. throw something to prevent the call
		middleware: [ 
			socket => {
				console.log(socket.id);
				// throw new Error('you do not have access here');
			}
		]
	})
	timer2() {
		console.log('timer2 called');
		return timer(0, 1000).pipe(finalize(() => console.log('timer complete')));
	}
}

// new instance with generic as the obj you want to "inject"
const rxjsRemoteServer = new RxjsRemote<ioServer.Socket>(); 

// register some class instances
rxjsRemoteServer.registerClasses([new SomeClass]); 

// socket.io
const io = ioServer(9895);

// when a new connection happens, attach the server to the socket
io.of('roc').on('connection', socket => {
	// connect things together
	rxjsRemoteServer.attach(
		{
			onMessage: listener => socket.on('message', listener),
			onClose: listener => socket.on('disconnect', listener),
			send: data => socket.send(data)
		}, 
		socket // the "inject" obj
	);
});
```

#### client
```typescript
// client.ts
import 'socket.io-client';
import { timer } from 'rxjs';
import { RxjsRemoteClient } from '../../rxjs-remote-client/src';
import { retryWhen, take, delayWhen, tap } from 'rxjs/operators';

// socket io
const client = io('http://localhost:9895/roc');

// new instance of client
const rxjsRemoteClient = new RxjsRemoteClient({
	onMessage: listener => client.on('message', listener),
	onClose: listener => client.on('disconnect', listener),
	send: data => client.send(data)
});


// do rxjs things
rxjsRemoteClient.observable<number>('SomeClass.timer')
	.pipe(
		take(5),
		retryWhen(err => err.pipe(
			tap(val => console.log(val)),
			delayWhen(val => timer(1000))
		))
	)
	.subscribe(
		next => console.log('next', next),
		error => console.log('error', error),
		() => console.log('complete'),
	);
```

