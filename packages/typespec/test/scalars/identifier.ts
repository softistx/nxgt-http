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
];
