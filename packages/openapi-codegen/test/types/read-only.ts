/**
 * `readOnly` properties are the server's: a request body (`json`, a client's
 * `args`, a handler's `json`) has none of them, a reply keeps them.
 * `writeOnly` properties are the client's: a body keeps them, a reply (a
 * client's `reply`, a handler's response) has none. The `read-only-keep` case
 * is the same spec with both kept, `write-only-keep` with `writeOnly: 'keep'`.
 */
import type {
	Account,
	AccountRead,
	AccountWrite,
	ClientOperations,
	CredentialRead,
	Draft,
	Operations,
	Pet,
	PetWrite,
	PetWriteInput,
	Receipt,
	TeamRead,
	User,
	UserRead,
} from '../generated/read-only/types';
import type {
	ClientOperations as KeptClientOperations,
	Operations as KeptOperations,
	Pet as KeptPet,
} from '../generated/read-only-keep/types';
import type { ClientOperations as WriteKeptClientOperations } from '../generated/write-only-keep/types';

type Equal<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
type Assert<T extends true> = T;
type Has<T, K extends string> = K extends keyof T ? true : false;

type Body = ClientOperations['createPet']['args'][0]['json'];
type Reply = Extract<
	ClientOperations['createPet']['reply'],
	{ status: 200 }
>['data'];

type UserBody = ClientOperations['createUser']['args'][0]['json'];
type UserReply = Extract<
	ClientOperations['createUser']['reply'],
	{ status: 200 }
>['data'];
type AdminReply = Extract<
	ClientOperations['listAdmins']['reply'],
	{ status: 200 }
>['data'][number];
type KeptUserReply = Extract<
	KeptClientOperations['createUser']['reply'],
	{ status: 200 }
>['data'];
type WriteKeptUserReply = Extract<
	WriteKeptClientOperations['createUser']['reply'],
	{ status: 200 }
>['data'];
type WriteKeptAccountBody =
	WriteKeptClientOperations['createAccount']['args'][0]['json'];

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
	// `writeOnly`: a request body requires `password`, a reply lacks it.
	Assert<Equal<Operations['createUser']['json'], User>>,
	Assert<Equal<Has<Operations['createUser']['json'], 'password'>, true>>,
	Assert<Equal<Has<UserBody, 'password'>, true>>,
	Assert<
		Equal<
			Operations['createUser']['responses'][200]['application/json'],
			UserRead
		>
	>,
	Assert<Equal<UserReply, UserRead>>,
	Assert<Equal<Has<UserReply, 'password'>, false>>,
	Assert<Equal<Has<UserReply, 'email'>, true>>,
	// Nested, through `allOf` and in a list.
	Assert<Equal<Has<TeamRead['owner'], 'password'>, false>>,
	Assert<
		Equal<Has<NonNullable<TeamRead['credentials']>[number], 'token'>, false>
	>,
	Assert<Equal<Has<CredentialRead, 'username'>, true>>,
	Assert<Equal<Has<AdminReply, 'password'>, false>>,
	Assert<Equal<Has<AdminReply, 'level'>, true>>,
	Assert<Equal<Has<Operations['createAdmin']['json'], 'password'>, true>>,
	// A schema only replies use is stripped in place.
	Assert<
		Equal<
			Operations['getReceipt']['responses'][200]['application/json'],
			Receipt
		>
	>,
	Assert<Equal<Has<Receipt, 'pin'>, false>>,
	// Both kinds on one schema: Write has no `id`, Read has no `secret`.
	Assert<Equal<Operations['createAccount']['json'], AccountWrite>>,
	Assert<
		Equal<
			Operations['createAccount']['responses'][200]['application/json'],
			AccountRead
		>
	>,
	Assert<Equal<Has<AccountWrite, 'id'>, false>>,
	Assert<Equal<Has<AccountWrite, 'secret'>, true>>,
	Assert<Equal<Has<AccountRead, 'secret'>, false>>,
	Assert<Equal<Has<AccountRead, 'id'>, true>>,
	Assert<Equal<Has<Account, 'id'>, true>>,
	Assert<Equal<Has<Account, 'secret'>, true>>,
	// `writeOnly: 'keep'`: replies are the schemas as written; `readOnly` still applies.
	Assert<Equal<Has<KeptUserReply, 'password'>, true>>,
	Assert<Equal<Has<WriteKeptUserReply, 'password'>, true>>,
	Assert<Equal<Has<WriteKeptAccountBody, 'id'>, false>>,
];

export function body(): Body {
	return { name: 'Rex' };
}
