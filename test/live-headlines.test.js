// Regression cases taken from real headlines seen on the live feeds (2026-10-31): the same story worded differently by two outlets.
const assert = require('assert');
const { rankStories } = require('../src/rank');
const L = (source, title) => ({ source, title, link: 'https://example.com/' + Math.random().toString(36).slice(2), summary: '', ts: Date.now() - 36e5 });
const merges = (a, b) => rankStories([a, b]).length === 1;
const MERGE = [
  [['bbc', 'Hundreds evacuated from Russian-occupied Oleshky during rare Ukraine ceasefire'], ['aljazeera', 'Hundreds from Russian-occupied Oleshky land in Belarus en route to Ukraine']],
  [['bbc', 'Spain train disaster clouds Sánchez chances of re-election'], ['nyt', 'Train Disaster Is a Blow to Spain’s Leader, Already an Election Underdog']],
  [['wired', 'The $6.3 Billion Binance Hack Was Pulled Off in Just 20 Minutes'], ['arstechnica', 'Hackers steal $6.3 billion from Binance in record crypto heist']],
  [['bbc', "Flávio Bolsonaro calls himself 'leader of Brazil' after election loss"], ['guardian', 'Flávio Bolsonaro calls himself the ‘leader of Brazil’ after fleeing to Miami']]
];
MERGE.push(
  [['nyt', 'Binance Suspends Withdrawals After Crypto Hackers Steal $6.3 Billion'], ['arstechnica', 'Hackers steal $6.3 billion from Binance in record crypto heist']],
  [['nyt', 'Trump Adds Midterm Rallies in Kansas and Iowa After Initially Canceling Events'], ['pbs', 'As early voting surges, Trump reshuffles his schedule to add back rallies in Iowa and Kansas']],
  [['nyt', 'Christa Pike Describes Pain and Isolation After Botched Execution'], ['pbs', 'Christa Pike says she feels constant pain in first public statement since failed execution']]
);
MERGE.push(
  // sentence-initial event nouns must not split a story from a version with an attribution
  [['bbc', 'Hurricane Milton makes landfall in Florida'], ['guardian', 'NHC says Hurricane Milton makes landfall in Florida']],
  [['bbc', 'Tornado hits Oklahoma town, three dead'], ['guardian', 'Oklahoma police say tornado hits town, three dead']],
  [['bbc', 'Gunman opens fire at Texas mall, three killed'], ['guardian', 'NSW police say gunman opens fire at Texas mall, three killed']],
  [['bbc', 'Drone strike hits Kyiv apartment block, four killed'], ['guardian', 'Ukraine says drone strike hits Kyiv apartment block, four killed']]
);
const SPLIT = [
  [['bbc', 'Trump’s tariffs could shutter this Canadian town'], ['guardian', 'Trump signs executive order on AI chips']],
  [['bbc', 'Fed holds rates steady'], ['guardian', 'ECB holds rates steady']],
  [['bbc', 'Israel strikes Gaza hospital, dozens killed'], ['npr', 'Israel strikes Lebanon, dozens killed']],
  [['bbc', 'Russia and Ukraine hold talks in Turkey'], ['guardian', 'Russia and Belarus hold military drills']],
  // swapped roles, names far apart
  [['bbc', 'Ukraine drone attack hits oil refinery in Russia'], ['guardian', 'Russia drone attack hits oil refinery in Ukraine']],
  // Title Case headlines (NYT, CBS, ABC style): names must still be compared
  [['nyt', 'Powerful Earthquake Strikes Off Coast Of Japan, Killing Dozens'], ['cbs', 'Powerful Earthquake Strikes Off Coast Of Indonesia, Killing Dozens']],
  [['nyt', 'Gunmen Kill 20 In Attack On Village In Nigeria'], ['abc', 'Gunmen Kill 20 In Attack On Village In Mali']],
  // one chamber vs the other
  [['bbc', 'Senate passes bill to avert government shutdown'], ['npr', 'House passes bill to avert government shutdown']],
  [['nyt', 'Senate Passes Bill To Avert Government Shutdown'], ['cbs', 'House Passes Bill To Avert Government Shutdown']]
];
SPLIT.push(
  // sentence-initial names (country, party, club, company)
  [['bbc', 'Kenya protests turn deadly as police fire on crowds'], ['guardian', 'Uganda protests turn deadly as police fire on crowds']],
  [['bbc', 'Labour wins Scottish by-election'], ['guardian', 'Reform wins Scottish by-election']],
  [['bbc', 'Arsenal sign striker from Real Madrid'], ['guardian', 'Chelsea sign striker from Real Madrid']],
  [['nyt', 'Apple fined by EU over App Store rules'], ['bbc', 'Google fined by EU over App Store rules']],
  [['bbc', 'North Korea fires missile toward Japan'], ['guardian', 'South Korea fires missile toward Japan']],
  // unknown company/leader/city names at the start of a headline
  [['bbc', 'Nissan to cut 9,000 jobs worldwide'], ['guardian', 'Honda to cut 9,000 jobs worldwide']],
  [['bbc', 'Zelensky arrives in Washington for Trump talks'], ['guardian', 'Netanyahu arrives in Washington for Trump talks']],
  [['bbc', 'Musk sues OpenAI over for-profit shift'], ['guardian', 'Altman sues OpenAI over for-profit shift']],
  [['bbc', 'Toronto mayor resigns'], ['guardian', 'Ottawa mayor resigns']],
  [['bbc', 'Ryanair profits fall'], ['guardian', 'Easyjet profits fall']],
  [['bbc', 'Oil prices climb on supply fears'], ['guardian', 'Oil prices slide on supply fears']],
  [['bbc', 'Fed holds interest rates steady'], ['guardian', 'Fed cuts interest rates sharply']],
  [['bbc', 'Court confirms ruling on tariffs'], ['guardian', 'Court rejects ruling on tariffs']],
  [['bbc', 'Pilot survives crash landing'], ['guardian', 'Pilot loses crash landing']],
  // -s company names are names, not plurals
  [['bbc', 'Barclays profits fall'], ['guardian', 'Lloyds profits fall']],
  // spelled-out numbers and opposite outcomes
  [['bbc', 'Blast kills ten in market'], ['guardian', 'Blast kills four in market']],
  [['bbc', 'Court blocks Trump tariff order'], ['guardian', 'Court upholds Trump tariff order']],
  [['bbc', 'Supreme Court rejects Trump tariff appeal'], ['guardian', 'Supreme Court hears Trump tariff appeal']],
  [['bbc', 'Senate fails to pass budget bill'], ['guardian', 'Senate passes budget bill']]
);
MERGE.forEach(([a, b], i) => assert(merges(L(...a), L(...b)), 'should merge #' + i + ': ' + a[1]));
SPLIT.forEach(([a, b], i) => assert(!merges(L(...a), L(...b)), 'must not merge #' + i + ': ' + a[1]));
console.log('live headline tests passed');
