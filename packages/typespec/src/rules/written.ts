/**
 * Whether the emitter writes an operation: not a template's declaration,
 * nor its instance (`Read<Pet>`), nor an operation of an interface
 * template's. Only the operations declared from them are checked.
 */
import { isTemplateDeclaration, type Operation } from '@typespec/compiler';
import { isEmitted } from '../operation-ids';

export function isWritten(operation: Operation): boolean {
	const container = operation.interface;
	return (
		isEmitted(operation) &&
		!isTemplateDeclaration(operation) &&
		(container === undefined || !isTemplateDeclaration(container))
	);
}
