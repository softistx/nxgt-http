import type { Entry } from './entry';

export const geo: readonly Entry[] = [
	{
		name: 'Latitude',
		scalar: 'latitude',
		format: 'double',
		accept: [48.8566, 0, -0.5, 90, -90],
		refuse: [90.000001, -90.5, '48.8566', null],
	},
	{
		name: 'Longitude',
		scalar: 'longitude',
		format: 'double',
		accept: [2.3522, 0, -0.5, 180, -180],
		refuse: [180.000001, -180.5, '2.3522', null],
	},
];
