import type { Entry } from './entry';

const RFC_9562 = 'https://www.rfc-editor.org/rfc/rfc9562';

export const identifier: readonly Entry[] = [
	{
		name: 'UUID',
		scalar: 'uuid',
		format: 'uuid',
		specifiedBy: RFC_9562,
		accept: [
			'550e8400-e29b-41d4-a716-446655440000',
			'00000000-0000-0000-0000-000000000000',
			'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
		],
		refuse: [
			'550e8400e29b41d4a716446655440000',
			'not-a-uuid',
			'550e8400-e29b-91d4-a716-446655440000',
		],
	},
	{
		name: 'UUIDv4',
		scalar: 'uuidV4',
		format: 'uuid',
		specifiedBy: RFC_9562,
		accept: ['123e4567-e89b-42d3-a456-426614174000'],
		refuse: [
			'017f22e2-79b0-7cc3-98c4-dc0c0c07398f',
			'123e4567-e89b-12d3-a456-426614174000',
			'123e4567-e89b-42d3-c456-426614174000',
		],
	},
	{
		name: 'UUIDv7',
		scalar: 'uuidV7',
		format: 'uuid',
		specifiedBy: RFC_9562,
		accept: ['017f22e2-79b0-7cc3-98c4-dc0c0c07398f'],
		refuse: [
			'123e4567-e89b-42d3-a456-426614174000',
			'017f22e2-79b0-7cc3-c8c4-dc0c0c07398f',
		],
	},
	{
		name: 'GUID',
		scalar: 'guid',
		format: 'uuid',
		accept: ['123e4567-e89b-12d3-c456-426614174000'],
		refuse: [
			'123e4567e89b12d3c456426614174000',
			'g23e4567-e89b-12d3-c456-426614174000',
		],
	},
	{
		name: 'ULID',
		scalar: 'ulid',
		format: 'ulid',
		specifiedBy: 'https://github.com/ulid/spec',
		accept: [
			'01ARZ3NDEKTSV4RRFFQ69G5FAV',
			'01arz3ndektsv4rrffq69g5fav',
			'7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
		],
		refuse: [
			'81ARZ3NDEKTSV4RRFFQ69G5FAV',
			'01ARZ3NDEKTSV4RRFFQ69G5FAI',
			'01ARZ3NDEKTSV4RRFFQ69G5FA',
		],
	},
	{
		name: 'Cuid2',
		scalar: 'cuid2',
		format: 'cuid2',
		specifiedBy: 'https://github.com/paralleldrive/cuid2',
		accept: ['tz4a98xxat96iws9zmbrgj3a', 'ab'],
		refuse: ['1abc', 'a', 'Abc', 'ab-c', `a${'b'.repeat(32)}`],
	},
	{
		name: 'NanoID',
		scalar: 'nanoId',
		format: 'nano-id',
		specifiedBy: 'https://github.com/ai/nanoid',
		accept: ['V1StGXR8_Z5jdHi6B-myT'],
		refuse: [
			'V1StGXR8_Z5jdHi6B-my',
			'V1StGXR8_Z5jdHi6B-myTx',
			'V1StGXR8_Z5jdHi6B-m!T',
		],
	},
	{
		name: 'KSUID',
		scalar: 'ksuid',
		format: 'ksuid',
		specifiedBy: 'https://github.com/segmentio/ksuid',
		accept: ['0ujtsYcgvSTl8PAuAdqWYSMnLOv', 'aWgEPTl1tmebfsQzFP4bxwgy80V'],
		refuse: [
			'0ujtsYcgvSTl8PAuAdqWYSMnLO',
			'0ujtsYcgvSTl8PAuAdqWYSMnLOvx',
			'0ujtsYcgvSTl8PAuAdqWYSMnLO-',
			'aWgEPTl1tmebfsQzFP4bxwgy80W',
		],
	},
	{
		name: 'XID',
		scalar: 'xid',
		format: 'xid',
		specifiedBy: 'https://github.com/rs/xid',
		accept: ['9m4e2mr0ui3e8a215n4g'],
		refuse: [
			'9M4E2MR0UI3E8A215N4G',
			'9m4e2mr0ui3e8a215n4h',
			'9m4e2mr0ui3e8a215n4w',
			'9m4e2mr0ui3e8a215n4',
		],
	},
	{
		name: 'ObjectID',
		scalar: 'objectId',
		format: 'object-id',
		specifiedBy:
			'https://www.mongodb.com/docs/manual/reference/method/ObjectId/',
		accept: ['507f1f77bcf86cd799439011', '507F1F77BCF86CD799439011'],
		refuse: [
			'507f1f77bcf86cd79943901',
			'507f1f77bcf86cd7994390111',
			'507f1f77bcf86cd79943901g',
			' 507f1f77bcf86cd79943901',
		],
	},
	{
		name: 'ISBN',
		scalar: 'isbn',
		format: 'isbn',
		specifiedBy:
			'https://www.isbn-international.org/content/isbn-users-manual/29',
		// `0306406153` and `9780306406158` (a wrong check digit) match the
		// pattern, which leaves the checksum out.
		accept: ['0306406152', '080442957X', '9780306406157', '9791090636071'],
		refuse: ['080442957x', '978-0-306-40615-7', '9770306406157', '030640615'],
	},
	{
		name: 'SemVer',
		scalar: 'semVer',
		format: 'sem-ver',
		specifiedBy: 'https://semver.org/spec/v2.0.0.html',
		accept: ['1.2.3', '0.0.0', '10.20.30', '1.0.0-rc.1+build.5'],
		refuse: [
			'v1.2.3',
			'1.2',
			'01.2.3',
			'1.2.3-01',
			'1.2.3-',
			'1.2.3+',
			'1.2.3 ',
		],
	},
];
