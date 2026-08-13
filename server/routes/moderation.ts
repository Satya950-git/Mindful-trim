const BLOCKED_TERMS = [
  'fuck','shit','cunt','bitch','bastard','asshole','piss','cock','dick','pussy',
  'nigger','nigga','faggot','fag','kike','spic','chink','wetback','slut','whore',
  'rape','kill yourself','kys','die','retard','idiot','moron','dumb','hate','violence',
  'bomb','terrorist','suicide','self-harm','drug','meth','cocaine','heroin',
];

const PATTERN = new RegExp(
  `\\b(${BLOCKED_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

export function moderateContent(text: string): { flagged: boolean; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { flagged: false };
  if (PATTERN.test(trimmed)) {
    return { flagged: true, reason: 'content_policy_violation' };
  }
  return { flagged: false };
}
