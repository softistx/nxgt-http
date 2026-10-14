/**
 * `readOnly` properties are the server's: a request body (`json`, a client's
 * `args`, a handler's `json`) has none of them, a reply keeps them. The
 * `read-only-keep` case is the same spec with `readOnly: 'keep'`.
 */
import type {
	ClientOperations,
	Draft,
	Operations,
	Pet,
	PetWrite,
	PetWriteInput,
} from '../generated/read-only/types';
import type {
	Operations as KeptOperations,
	Pet as KeptPet,
} from '../generated/read-only-keep/types';

type Equal<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
type Assert<T extends true> = T;
type Has<T, K extends string> = K extends keyof T ? true : false;

type Body = ClientOperations['createPet']['args'][0]['json'];
type Reply = Extract<
	ClientOperations['createPet']['reply'],
	{ status: 200 }
>['data'];

export type Checks = [
	// A handler's `json` lacks the read-only properties, a reply has them.
	Assert<Equal<Operations['createPet']['json'], PetWrite>>,
	Assert<Equal<Has<Operations['createPet']['json'], 'id'>, false>>,
	Assert<Equal<Has<Operations['createPet']['json'], 'createdAt'>, false>>,
	Assert<Equal<Has<Pet, 'id'>, true>>,
	Assert<
		Equal<Operations['createPet']['responses'][200]['application/json'], Pet>
	>,
	// What a client sends: no `id`, and a date as its string.
	Assert<Equal<Body, PetWriteInput>>,
	Assert<Equal<Has<Body, 'id'>, false>>,
	Assert<Equal<Reply, Pet>>,
	// A nested schema and an array of bodies.
	Assert<Equal<Has<NonNullable<PetWrite['owner']>, 'id'>, false>>,
	Assert<Equal<Has<Operations['createPets']['json'][number], 'id'>, false>>,
	// Inherited properties, and a schema only a body uses.
	Assert<Equal<Has<Operations['createDog']['json'], 'id'>, false>>,
	Assert<Equal<Has<Operations['createDog']['json'], 'barks'>, true>>,
	Assert<Equal<Operations['createDraft']['json'], Draft>>,
	Assert<Equal<Has<Draft, 'revision'>, false>>,
	// `readOnly: 'keep'`: the body is the schema as written.
	Assert<Equal<KeptOperations['createPet']['json'], KeptPet>>,
	Assert<Equal<Has<KeptOperations['createPet']['json'], 'id'>, true>>,
];

export function body(): Body {
	return { name: 'Rex' };
}
