import type { TypedSocket } from '../types';

/** A typed socket over `WebSocket`: JSON both ways, sends queued until it opens. */
export function openSocket<Send, Receive>(
	url: URL,
): TypedSocket<Send, Receive> {
	const raw = new WebSocket(url);
	const listeners = new Set<(message: Receive) => void>();
	const queue: string[] = [];
	const opened = new Promise<void>((resolve, reject) => {
		raw.addEventListener('open', () => {
			for (const message of queue.splice(0)) raw.send(message);
			resolve();
		});
		raw.addEventListener('error', () =>
			reject(new Error(`The socket to ${url} failed`)),
		);
	});
	opened.catch(() => {});
	raw.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data)) as Receive;
		for (const listener of listeners) listener(message);
	});
	return {
		raw,
		opened,
		send(message) {
			const text = JSON.stringify(message);
			if (raw.readyState === WebSocket.OPEN) raw.send(text);
			else queue.push(text);
		},
		on(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		close: (code, reason) => raw.close(code, reason),
		async *[Symbol.asyncIterator]() {
			const pending: Receive[] = [];
			let wake: (() => void) | undefined;
			let closed = raw.readyState === WebSocket.CLOSED;
			const off = this.on((message) => {
				pending.push(message);
				wake?.();
			});
			const onClose = () => {
				closed = true;
				wake?.();
			};
			raw.addEventListener('close', onClose);
			try {
				while (true) {
					const next = pending.shift();
					if (next !== undefined) {
						yield next;
						continue;
					}
					if (closed) return;
					await new Promise<void>((resolve) => {
						wake = resolve;
					});
					wake = undefined;
				}
			} finally {
				off();
				raw.removeEventListener('close', onClose);
			}
		},
	};
}
