// Who runs the site and how to reach them. Change these here and every page follows.
export const SITE = {
  name: 'TradeReports',
  operator: 'DynamixAI, run by Pius Ajamma',
  owner: 'Pius Ajamma',
  place: 'Wigan, England',
  email: 'tradereport.dynamixai@outlook.com',
  // the date the legal pages last changed
  updated: '12 November 2026',
  // GoatCounter code (the "tradereports" in tradereports.goatcounter.com); empty sends nothing
  counter: 'tradereports',
};

// an email link with the subject and a starting message filled in
export function mailto(subject: string, body = ''): string {
  const q = new URLSearchParams({ subject, body }).toString().replace(/\+/g, '%20');
  return `mailto:${SITE.email}?${q}`;
}
