// The AI writing tells this site's copy is held to, from the "humanizer" skill
// (https://github.com/blader/humanizer, MIT), which in turn draws on Wikipedia's
// "Signs of AI writing" maintained by WikiProject AI Cleanup.
//
// Section numbers match that skill so a hit can be looked up there. Strength decides what a hit
// costs: 'strong' patterns are ones a careful writer almost never produces on purpose, so one
// sighting is a failure. 'weak' patterns (a lone dash, a stacked hyphen, one passive clause) are
// ordinary human habits on their own, so they only fail when several land in the same passage.
//
// Each pattern carries the fix rather than just the complaint, because the reader of a failure is
// usually someone about to rewrite the sentence.

export const STRONG = 'strong';
export const WEAK = 'weak';

// \b does not fire next to an apostrophe or inside a hyphenated word the way these phrases need,
// so the boundaries are written out where it matters.
const PATTERNS = [
  {
    id: 1, strength: STRONG, name: 'Not X but Y',
    fix: 'State the point directly. Keep a contrast only if the negative half corrects a belief the reader holds.',
    tests: [
      /\bnot (?:just|only|merely|simply) \w+[^.!?]{0,60}?,? but\b/i,
      /\bit'?s not (?:about )?\w+[^.!?]{0,40}?,? it'?s\b/i,
      /\bisn'?t (?:just|only|merely|simply)\b/i,
      /\bmore than (?:just|simply) (?:a|an|the)\b/i,
      /\brather than (?:a |an |the )?(?:just|merely)\b/i,
      /\bthis (?:does|doesn'?t|did) not mean\b/i,
    ],
  },
  {
    id: 2, strength: STRONG, name: 'One-line closer or dramatic fragment',
    fix: 'Cut a line that restates what the reader just read. Keep it only if it adds a fact.',
    tests: [
      /\bthat(?:'s| is) the real (?:win|point|story|question)\b/i,
      /\bthat distinction matters\b/i,
      /\bread that again\b/i,
      /\blet that sink in\b/i,
      /\bthis (?:shows|demonstrates|proves) the importance of\b/i,
      /\bthe message (?:was|is) clear\b/i,
      /\bit was a lesson in\b/i,
      /\bwhich is (?:exactly )?the point\b/i,
    ],
  },
  {
    id: 3, strength: STRONG, name: 'Saying that sounds deep',
    fix: 'Replace the saying with the specific claim.',
    tests: [
      /\bthe real question is\b/i,
      /\bat its core\b/i,
      /\bin reality,/i,
      /\bwhat really matters\b/i,
      /\bfundamentally,/i,
      /\bthe deeper (?:issue|problem|truth)\b/i,
      /\bthe heart of the matter\b/i,
      /\bbecomes a trap\b/i,
      /\bthe (?:language|currency|architecture) of (?:trust|power|change|modern)\b/i,
    ],
  },
  {
    id: 4, strength: STRONG, name: 'Staged run-up before the point',
    fix: 'Remove the run-up and start with the point.',
    tests: [
      /\blet'?s (?:dive|explore|break this down|take a look|look at)\b/i,
      /\bdive (?:in|into)\b/i,
      /\bhere'?s what you need to know\b/i,
      /\bwithout further ado\b/i,
      /\bhere'?s the thing\b/i,
      /\bthe thing is,/i,
      /\blet'?s be honest\b/i,
      /\breal talk\b/i,
      /^\s*(?:honestly|look|listen)[,?]/i,
      /\bnow let'?s\b/i,
    ],
  },
  {
    id: 5, strength: STRONG, name: 'Arguing with no one',
    fix: 'Remove the defense. If it holds a real claim, state the claim.',
    tests: [
      /\bthis isn'?t (?:mainly |really |just )?about\b/i,
      /\bi'?m not saying\b/i,
      /\bto be clear,/i,
      /\bdon'?t get me wrong\b/i,
      /\bthis is not to say\b/i,
      /\bsome might say\b/i,
      /\ba tempting approach would be\b/i,
      /\bone might be tempted to\b/i,
      /\ban obvious approach would be\b/i,
      /\byou might think\b[^.!?]{0,40}\bbut\b/i,
      /\bit would be easy to just\b/i,
    ],
  },
  {
    id: 6, strength: WEAK, name: 'Forced triad',
    fix: 'Check each item adds a distinct idea. Merge them or develop the strongest one.',
    // Only the single-sentence "A, B, and C" shape where all three are short abstract nouns.
    // Three concrete items (three cities, three dates) are ordinary and must not fire.
    tests: [
      /\b(?:innovation|inspiration|insights?|excellence|synergy|empowerment|transformation)\b[^.!?]{0,40},\s[^.!?]{0,40}\band\s(?:innovation|inspiration|insights?|excellence|synergy|empowerment|transformation)\b/i,
    ],
  },
  {
    id: 8, strength: WEAK, name: 'Dash as the universal connector',
    fix: 'Use a period, comma, colon or parentheses. Leave dashes inside code, paths and URLs alone.',
    tests: [/[—–]/, /(?:^|\s)--(?:\s|$)/],
  },
  {
    id: 9, strength: WEAK, name: 'Stacked qualifier',
    fix: 'Keep a qualifier only where the source supports it and the meaning needs it.',
    tests: [
      /\bto be fair\b/i,
      /\bit'?s also possible\b/i,
      /\bcould potentially\b/i,
      /\bmight arguably\b/i,
      /\bin some cases it may\b/i,
      /\bmay potentially\b/i,
    ],
  },
  {
    id: 12, strength: STRONG, name: 'Overused AI word',
    fix: 'Use a plain word, or cut the sentence if the word was carrying it.',
    tests: [
      /\bdelve\b/i, /\bdeep dive\b/i, /\bintricac(?:y|ies)\b/i, /\bintricate\b/i,
      /\binterplay\b/i, /\btapestry\b/i, /\btestament\b/i, /\bmeticulous(?:ly)?\b/i,
      /\bpivotal\b/i, /\bgarner(?:ed|s)?\b/i, /\bbolster(?:ed|s)?\b/i,
      /\bshowcase(?:s|d)?\b/i, /\bvibrant\b/i,
      // The verb only. "Underscore" is also the name of a character, and the username rules
      // genuinely have to say which characters are allowed.
      /\bunderscor(?:es|ed|ing)\s+(?:the|its|a|an|how|that|just)\b/i,
      /\bever[- ]evolving\b/i, /\bcutting[- ]edge\b/i, /\bgame[- ]changer\b/i,
      /\bholistic\b/i, /\bseamless(?:ly)?\b/i, /\bempower(?:s|ed|ing)?\b/i,
      /\bleverage(?:s|d|ing)?\b/i,
      /\blandscape of\b/i, /\brealm of\b/i, /\bcrucial\b/i,
      /\bit'?s worth noting\b/i, /\bit'?s important to note\b/i,
      /\bin today'?s world\b/i, /\bwhen it comes to\b/i,
      /\bplays? a (?:key|crucial|vital|pivotal) role\b/i,
      /\bthat'?s where \w+ comes? in\b/i,
      /\bthink of it as\b/i,
    ],
  },
  {
    id: 13, strength: STRONG, name: 'Inflated significance',
    fix: 'Keep the fact and drop the significance. End on the last concrete fact.',
    tests: [
      /\bstands as a testament\b/i,
      /\ba (?:pivotal|crucial|defining) moment\b/i,
      /\bmark(?:ing|s|ed) a (?:pivotal|crucial|new|major) (?:moment|era|chapter)\b/i,
      /\bunderscores its importance\b/i,
      /\breflects a broader\b/i,
      /\b(?:enduring|lasting) legacy\b/i,
      /\bsetting the stage for\b/i,
      /\bevolving landscape\b/i,
      /\bindelible mark\b/i,
      /\bcontinues to thrive\b/i,
      /\bthe future looks bright\b/i,
      /\bexciting times (?:ahead|lie ahead)\b/i,
      /\ba step in the right direction\b/i,
    ],
  },
  {
    id: 14, strength: WEAK, name: 'Vague connection',
    fix: 'Name the relationship the source gives. If the source does not say, leave it vague rather than inventing one.',
    tests: [
      /\bassociated with\b/i,
      /\bin association with\b/i,
      /\bin connection with\b/i,
      /\btied to\b/i,
    ],
  },
  {
    id: 15, strength: STRONG, name: 'Shallow -ing rider',
    fix: 'Keep the fact. Keep the rider only where the source supports what it claims.',
    tests: [
      /,\s(?:highlighting|underscoring|emphasizing|symbolizing|showcasing|cultivating|fostering|encompassing|reflecting the)\b/i,
      /,\s(?:ensuring|contributing to) (?:a |an |the )?(?:better|greater|stronger|lasting|deeper)\b/i,
    ],
  },
  {
    id: 16, strength: STRONG, name: 'Sales language',
    fix: 'State what the thing is.',
    tests: [
      /\bnestled\b/i, /\bin the heart of\b/i, /\bbreathtaking\b/i, /\bmust[- ]visit\b/i,
      /\bstunning\b/i, /\bdiverse array\b/i, /\brenowned\b/i,
      // Figurative only. On a planning site a groundbreaking is the event where a shovel goes
      // into the ground, which is the literal sense and appears constantly.
      /\bgroundbreaking (?:work|research|study|approach|technology|innovation|platform|idea)\b/i,
      /\bprofound\b/i, /\bexemplifies\b/i, /\bcommitment to excellence\b/i,
      /\brich (?:history|heritage|culture|tapestry|tradition)\b/i,
      /\bnatural beauty\b/i,
    ],
  },
  {
    id: 17, strength: STRONG, name: 'Borrowed authority',
    fix: 'Name the real source and what it said, or cut the claim.',
    tests: [
      /\bexperts (?:argue|believe|say|agree)\b/i,
      /\bobservers have cited\b/i,
      /\bindustry reports\b/i,
      /\bsome critics\b/i,
      /\bseveral publications\b/i,
      /\bit is widely (?:believed|held|regarded)\b/i,
    ],
  },
  {
    id: 18, strength: WEAK, name: 'Avoiding is, are and has',
    fix: 'Use is, are or has.',
    tests: [
      /\bserves as\b/i, /\bstands as\b/i, /\bfunctions as\b/i, /\boperates as\b/i,
      /\bboasts\b/i,
    ],
  },
  {
    id: 21, strength: WEAK, name: 'Curly quotation mark',
    fix: 'Use straight quotes, or the HTML entity the surrounding markup uses.',
    tests: [/[“”]/],
  },
  {
    id: 22, strength: STRONG, name: 'Chatbot residue',
    fix: 'Remove the wrapper and keep the content.',
    tests: [
      /\bi hope this helps\b/i,
      /\b(?:of course|certainly|absolutely)!/i,
      /\bgreat question\b/i,
      /\byou'?re absolutely right\b/i,
      /\bwould you like me to\b/i,
      /\bwant me to\b/i,
      /\bshould i continue\b/i,
      /\bhere is a (?:list|summary|breakdown) of\b/i,
      /\blet me know if\b/i,
    ],
  },
  {
    id: 23, strength: STRONG, name: 'Knowledge-limit disclaimer or guess',
    fix: 'State what the source does not show, or remove the sentence.',
    tests: [
      /\bas of my (?:last )?(?:training|knowledge)\b/i,
      /\bup to my last (?:training )?update\b/i,
      /\bwhile specific details are limited\b/i,
      /\bbased on available information\b/i,
      /\bnot widely documented\b/i,
      /\bin the (?:provided|available) sources\b/i,
      /\bmaintains a low profile\b/i,
      /\bit is believed that\b/i,
    ],
  },
  {
    id: 24, strength: STRONG, name: 'Closing summary or look ahead',
    fix: 'When you have answered, stop.',
    tests: [
      /\bin conclusion\b/i,
      /\bto summarize\b/i,
      /\bat the end of the day\b/i,
      /\bonly time will tell\b/i,
      /\bit remains to be seen\b/i,
      /\bultimately,/i,
      /\boverall,\s*(?:the|this|it)\b/i,
    ],
  },
];

// Phrases that match a pattern above but are correct here, with the reason. A hit whose text
// contains one of these is dropped. Keep each one narrow: the point is to exempt a specific true
// phrase, not to switch a pattern off.
export const ALLOWED = [
  // SB 35 and SB 423 call it "streamlined ministerial approval" in the statute itself. The word
  // is the legal term of art, so it stays wherever it names that process.
  'streamlined review', 'streamlined ministerial', 'streamlining', 'SB 35 streamlined',
  // "robust" and "key" have ordinary technical meanings this codebase relies on.
  'key (adjective)', 'primary key', 'API key', 'key=', 'keyboard',
  // A legal/zoning term, not sales language.
  'rich housing element',
];

export function patternsFor(strength) {
  return strength ? PATTERNS.filter(p => p.strength === strength) : PATTERNS;
}

/**
 * Finds every tell in one line of copy.
 * Returns [{ id, name, strength, fix, match }].
 */
export function findTells(text) {
  if (!text) return [];
  const hits = [];
  for (const pattern of PATTERNS) {
    for (const test of pattern.tests) {
      const m = test.exec(text);
      if (!m) continue;
      const matched = m[0];
      if (ALLOWED.some(ok => text.toLowerCase().includes(ok.toLowerCase()))) continue;
      hits.push({
        id: pattern.id, name: pattern.name, strength: pattern.strength,
        fix: pattern.fix, match: matched.trim(),
      });
      break;   // one hit per pattern per line is enough to send someone to the sentence
    }
  }
  return hits;
}

export default PATTERNS;
