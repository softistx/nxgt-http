/**
 * Each HTTP operation of each service, once, as the emitter sends it: a
 * service nested in another lists its operations in both. The services' own
 * diagnostics are the emitter's to report.
 */
import type { Program } from '@typespec/compiler';
import { getAllHttpServices, type HttpOperation } from '@typespec/http';

export function eachHttpOperation(
	program: Program,
	visit: (operation: HttpOperation) => void,
): void {
	const [services] = getAllHttpServices(program);
	const visited = new Set<HttpOperation['operation']>();
	for (const service of services) {
		for (const operation of service.operations) {
			if (visited.has(operation.operation)) continue;
			visited.add(operation.operation);
			visit(operation);
		}
	}
}
