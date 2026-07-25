import { HEAVY_LOGO, ENERGY_LOGO } from './logos';

// The two letterhead identities. Staff pick one per job (request.letterhead).
// Contact details are from the original quotation format; confirm the email.
export const COMPANIES = {
  heavy: {
    key: 'heavy',
    name: 'Deluxe Heavy Equipment Rental LLC',
    tagline: 'Power Solution & Repairing Services',
    address: 'Musaffah M37, Abu Dhabi, UAE',
    phone: '+971 2 554 5718',
    email: 'info@deluxeuae.com',
    web: 'www.deluxeuae.com',
    logo: HEAVY_LOGO,
    accent: '#0E3E8F', // navy blue
  },
  energy: {
    key: 'energy',
    name: 'Deluxe Energy Solutions L.L.C',
    tagline: 'Energy Solutions',
    address: 'Musaffah M37, Abu Dhabi, UAE',
    phone: '+971 2 554 5718',
    email: 'info@deluxeuae.com',
    web: 'www.deluxeuae.com',
    logo: ENERGY_LOGO,
    accent: '#1E8A56', // energy green
  },
};

export function companyFor(letterhead) {
  return COMPANIES[letterhead] || COMPANIES.heavy;
}
