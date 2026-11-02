// Narrow topic picks still fill tabs: stories can fit several topics, outlets' topic sections are read,
// and outlets that word one story differently are matched through the names in their summaries.
const assert = require('assert');
const T = require('../src/topics');
const { rankStories, isLowQuality, caps } = require('../src/rank');
const { fetchAll, setFetch } = require('../src/fetcher');
const { SECTIONS, countryMatch } = require('../src/sources');
const feeds = require('./support/feeds')();
const now = Date.now();
const L = (source, title, summary = '', h = 1) => ({ source, title, summary, link: 'https://example.com/' + encodeURIComponent(source + title), ts: now - h * 36e5 });

// ties fit every tied topic; headline hits outweigh words in the summary
assert.deepStrictEqual(T.topicsOf('OpenAI CEO steps down'), ['business', 'ai']);
assert.ok(T.wanted('OpenAI CEO steps down', ['ai']) && T.wanted('OpenAI CEO steps down', ['business']));
assert.strictEqual(T.topicOf('OpenAI releases new chatbot', 'The company said revenue grew as the company expands.'), 'ai', 'headline wins over a rambling summary');
assert.ok(!T.wanted('Putin vows response after Ukraine drone strike', ['politics']), 'a war story stays war when War is unticked');

// a story the outlet filed under a picked topic counts, even with no keyword in the headline...
const match = [L('bbc', 'Saka winner settles derby as Arsenal beat Chelsea 2-1', '', 1), L('guardian', 'Saka winner as Arsenal beat Chelsea 2-1 in derby', '', 2)];
assert.strictEqual(rankStories(match, { show: ['sports'] }).length, 0, 'no keyword, no section: not sports');
assert.strictEqual(rankStories(match.map(i => ({ ...i, topics: ['sports'] })), { show: ['sports'] }).length, 1, 'filed under Sport: sports');
// ...but it never outweighs clear keywords: a crypto hack in the Business section is still crypto
const hack = [L('bbc', 'Crypto firm Binance covers losses after bitcoin hack'), L('guardian', 'Binance covers losses after bitcoin hack, crypto firm says')].map(i => ({ ...i, topics: ['business', 'finance'] }));
assert.strictEqual(rankStories(hack, { show: ['business'] }).length, 0, 'Crypto unticked: hidden');
assert.strictEqual(rankStories(hack, { show: ['crypto'] }).length, 1);

// differently worded headlines join through rare names in the summaries
const michigan = [
  L('bbc', 'Democrat endorses Republican candidate in key Michigan Senate race', 'Haley Stevens, who lost the Democratic nomination to Abdul El-Sayed, endorses his opponent Mike Rogers days before the vote.'),
  L('independent', 'Abdul El-Sayed’s primary opponent Haley Stevens endorses GOP candidate in Michigan Senate race', 'She shocked party officials by appearing with Mike Rogers at a Detroit church service.', 2),
  L('aljazeera', 'Michigan Dem Haley Stevens endorses Republican Senate candidate Mike Rogers', 'Stevens lost the Democratic primary to Abdul El-Sayed and now endorses his Republican opponent.', 3),
  L('nyt', 'Haley Stevens Abandons El-Sayed, Endorsing Mike Rogers in Michigan', 'Ms. Stevens, who lost the primary to Abdul El-Sayed, endorsed the Republican Senate candidate.', 4)];
const m = rankStories(michigan.slice(0, 2));
assert.strictEqual(m.length, 1, 'joined into one verified story'); assert.strictEqual(m[0].indep, 2);
assert.ok(rankStories(michigan).some(s => s.indep >= 2), 'four outlets: still joined, no crash');
// three outlets join into one story, even when each pair only links through the summaries
const crash = rankStories([
  L('bbc', 'University of Cambridge scientist among those who died in Spanish train crash', 'Dr Marta Shahbazi was travelling to Madrid to collect an award.'),
  L('guardian', 'Tributes paid to inspiring Cambridge scientist who died in Spain train crash', 'Dr Marta Shahbazi, a Cambridge researcher, was travelling to Madrid.', 2),
  L('independent', 'British scientist among 69 killed in Spain train disaster was travelling to collect award', 'Dr Marta Shahbazi of the University of Cambridge was travelling to Madrid.', 3)]);
assert.strictEqual(crash.length, 1); assert.strictEqual(crash[0].indep, 3);
// a country that only one headline names is fine when the other headline names none
assert.strictEqual(rankStories([
  L('npr', "New York City Marathon: Sweden's Almgren and Kenya's Chepkirui win as 60,000 take part", "Andreas Almgren of Sweden won the men's race of the New York City Marathon in his debut while Sheila Chepkirui of Kenya won the women's race."),
  L('guardian', 'New York City Marathon: Andreas Almgren wins on debut as Sheila Chepkirui reclaims crown', 'Sheila Chepkirui of Kenya won the women’s race; Sweden’s Andreas Almgren won the men’s race on debut.', 2)]).length, 1, 'marathon');
// ...but not across more than 36 hours
assert.strictEqual(rankStories([michigan[0], { ...michigan[1], ts: now - 80 * 36e5 }]).length, 0, 'too far apart');

// different stories must stay apart (each pair: bbc + guardian; a wrong join would make one fake "verified" story)
const apart = [
  ['Alcaraz beats Sinner to win Paris title', 'Sinner wins Paris title, beating Alcaraz'],
  ['Saka winner as Arsenal beat Chelsea', 'Chelsea beat Saka and Arsenal at Stamford Bridge'],
  ['Senate passes bill to avert shutdown', 'House passes bill to avert shutdown', 'Senators voted late on Friday. The House votes next week on the plan from Mike Rogers and Haley Stevens.', 'The House voted late on Friday. The Senate votes next week on the plan from Mike Rogers and Haley Stevens.'],
  ['Elon Musk wins appeal over his pay package', 'Elon Musk to step down as chief executive, Tesla says', 'Elon Musk won his appeal in Delaware over the Tesla pay deal.', 'Elon Musk will step down as Tesla chief executive.'],
  ['Haley Stevens wins Michigan primary', 'Haley Stevens heckled at campaign rally', 'Haley Stevens won the vote in Detroit.', 'Haley Stevens was heckled in Detroit.'],
  ['Floods kill dozens in Niger', 'Floods kill dozens in Nigeria', 'Rains hit Niamey and Zinder, officials in Niger said.', 'Rains hit Kano and Zinder region border, officials in Nigeria said.'],
  ['Storm floods towns in Austria', 'Storm floods towns in Australia', 'Heavy rain hit Graz, Vienna and Linz.', 'Heavy rain hit Graz Street, Vienna Road and Linz Park.'],
  ['Appeals court rejects Justice Department request on California ballots', 'Justice Department issues subpoenas to California election workers', 'The Justice Department lost its bid in California.', 'The Justice Department sent subpoenas in California.']
];
apart.push(
  ['Elon Musk wins appeal over his pay package', 'Elon Musk to step down as chief executive amid pay row, Tesla says'],
  ['Taylor Swift announces new tour dates in Europe', 'Taylor Swift tour concert cancelled after terror threat'],
  ['Elon Musk signs deal with Saudi fund for xAI', 'Elon Musk deal to buy football club collapses'],
  ['Silicon Valley wants you to invest in miracles', "Silicon Valley parents want the tech they help build out of their children's schools"],
  ['Fighting spreads in South Sudan as talks stall', 'Fighting spreads in Sudan as talks stall'],
  ['Macron visits Niger amid jihadist threat', 'Macron visits Nigeria amid security crisis', 'Emmanuel Macron met the junta leader in Niamey.', 'Emmanuel Macron met Nigerian President Tinubu in Abuja.'],
  ['Commons passes assisted dying bill', 'Lords pass assisted dying bill', 'MPs backed the bill from Kim Leadbeater; the Lords debate it next with Charlie Falconer.', 'Peers backed the bill; it returns to the Commons from Kim Leadbeater and Charlie Falconer.'],
  ['Airline suspends flights to Tel Aviv', 'Airline resumes flights to Tel Aviv'],
  // each summary names the other place: still two places, two stories
  ['North Korea fires missile into sea near Japan', 'South Korea fires missile into sea near Japan', 'Kim Jong Un watched the test as South Korea and Tokyo protested.', 'The test came days after North Korea, Kim Jong Un and Tokyo traded threats.'],
  ['Moldovan president wins second term in runoff', 'Romanian president wins second term in runoff', 'Maia Sandu won again, Romanian and Brussels officials said.', 'Nicusor Dan won again; Moldovan leader Maia Sandu and Brussels officials congratulated him.'],
  ['Trump welcomes Flavio Bolsonaro after losing Brazil elections', 'Donald Trump loses allies after elections in Serbia and Brazil', '‘In my opinion, the election was a disgrace’, Trump said', 'Flavio Bolsonaro failed to gain power, Aleksandar Vucic was voted out of office, and Benjamin Netanyahu has weakened.'],
  // a capitalised name is still a name when some other story writes the same word in lower case (see FILLER)
  ['Strong earthquake shakes western Turkey, buildings damaged', 'Strong earthquake shakes Greece, buildings damaged', 'The quake was felt across the Aegean, seismologists at the EMSC said, with tremors on Lesbos.', 'The quake was felt across the Aegean, seismologists at the EMSC said, with tremors on Lesbos and Crete.'],
  ['Former chancellor Hunt to stand down at next election', 'Former minister Gove to stand down at next election', 'Jeremy Hunt told constituents in Surrey; Kemi Badenoch thanked him.', 'Michael Gove told constituents in Surrey; Kemi Badenoch thanked him.'],
  ['Knife attack in Nice leaves several wounded, suspect held', 'Knife attack in Marseille leaves several wounded, suspect held', 'Interior Minister Laurent Nuñez said the PNAT was not involved.', 'Interior Minister Laurent Nuñez said the PNAT was not involved yet.'],
  ['Tens of thousands of North Koreans rally against US drills', 'Tens of thousands of South Koreans rally against US drills', 'Crowds gathered in Pyongyang as Kim Jong Un watched.', 'Crowds gathered in Seoul days after Kim Jong Un spoke in Pyongyang.'],
  ['Fast-moving wildfire forces evacuations in Southern California', 'Wind-driven wildfire prompts evacuation orders in Northern California', 'Cal Fire said the blaze near Los Angeles grew overnight; Gavin Newsom declared an emergency.', 'Cal Fire said the blaze near Redding grew overnight; Gavin Newsom declared an emergency.'],
  ['Northern Irish farmers protest over EU trade deal', 'Irish farmers protest over EU trade deal', 'Farmers drove tractors through Belfast; Maros Sefcovic is due in Brussels.', 'Farmers drove tractors through Dublin; Maros Sefcovic is due in Brussels.'],
  ['Floods kill dozens in Myanmar as monsoon rains lash region', 'Floods kill dozens in Thailand as monsoon rains lash region', 'Tropical Storm Wipha brought torrential rain to towns along the Mekong river, officials said.', 'Tropical Storm Wipha brought torrential rain to towns along the Mekong river, and neighbouring Myanmar was also hit.'],
  // only one story names the other's person or place: the headlines say the same thing, so still two stories
  ['Labour MP Rosie Duffield quits party over Starmer leadership', 'Labour MP Diane Abbott quits party over Starmer leadership', 'Rosie Duffield said Keir Starmer had failed. Her move follows Diane Abbott leaving Labour last month.', 'Diane Abbott said Keir Starmer had betrayed Labour members.'],
  ['Atlanta police chief resigns after shooting inquiry', 'New Orleans police chief resigns after shooting inquiry', 'Darin Schierbaum stepped down after the Georgia Bureau of Investigation report.', 'Anne Kirkpatrick stepped down after the Georgia Bureau of Investigation report into officers who trained with Atlanta police.'],
  ['Atlanta police chief resigns after protests', 'New Orleans police chief resigns after protests', 'He quit after FBI agents met Keisha Lance; New Orleans had a similar case.', 'She quit after FBI agents met Keisha Lance, weeks after Atlanta.']
);
apart.push(
  ['DR Congo votes in presidential election', 'Congo Republic votes in presidential election', 'Voters in Kinshasa queued from dawn.', 'Voters in Brazzaville backed Denis Sassou Nguesso.'],
  ['Pakistan and Afghanistan agree ceasefire after talks in Doha', 'Pakistan and Afghanistan troops clash at border crossing'],
  ['Teachers in Denver strike over pay as union rejects offer', 'Teachers in Memphis strike over pay and class sizes', 'Denver teachers walked out after talks failed, following a similar strike in Memphis last month.', 'Memphis teachers began an indefinite walkout, weeks after colleagues in Denver threatened action.']
);
// an unrelated story that writes some name words in lower case
const FILLER = L('npr', 'Thanksgiving travel record expected', 'Officers continue the hunt; brine the turkey overnight; a nice southern and northern route; south roads.', 5);
for (const [a, b, sa = '', sb = ''] of apart) assert.strictEqual(rankStories([L('bbc', a, sa), L('guardian', b, sb, 2), FILLER]).length, 0, a + ' / ' + b);
// the same story told with a demonym or another name for the place
const together = [
  ['Sudanese army retakes key city of El Fasher, military says', 'Sudan army retakes key city of El Fasher, military says', 'Abdel Fattah al-Burhan said the Rapid Support Forces had fled Darfur.', 'The Rapid Support Forces left after weeks of fighting, Abdel Fattah al-Burhan said.'],
  ['Iranian navy seizes oil tanker in Strait of Hormuz', 'Iran seizes foreign oil tanker in Strait of Hormuz', 'The Revolutionary Guards said the Talara carried smuggled fuel.', 'Revolutionary Guards boarded the Talara, a Marshall Islands-flagged ship.'],
  ['M23 rebels seize key town in eastern Congo', 'M23 rebels seize key town in eastern Democratic Republic of Congo'],
  ['New Yorkers brace for first major snowstorm of winter', 'New York braces for first major snowstorm of winter'],
  ['Russian drone strike kills four in east Ukraine city of Kramatorsk', 'Russian drone strike kills four in eastern Ukraine city of Kramatorsk']
];
// a Title Case country stays a name even when another story writes "turkey" in lower case
assert.strictEqual(rankStories([L('bbc', 'Earthquake damages buildings in western Greece', 'The quake struck near Patras and was felt as far away as Izmir in Turkey, Greek officials said.'),
  L('nyt', 'Earthquake Strikes Western Turkey, Killing 2', 'The quake, centred near Izmir, was also felt on Greek islands, Turkish officials said.', 2),
  L('guardian', 'US turkey prices soar ahead of Thanksgiving as bird flu hits farms', '', 3)]).length, 0, 'Greece / Turkey');
for (const [a, b, sa = '', sb = ''] of together) assert.strictEqual(rankStories([L('bbc', a, sa), L('guardian', b, sb, 2), FILLER]).length, 1, a + ' / ' + b);

// two developments of one case stay apart; when two headlines are equally close, the newest one is shown
// a later development of the same story is one story, headed by the newest headline (no repeats)
const dev = rankStories([L('bbc', 'Erin Patterson appeal hearing begins in Melbourne', '', 30), L('guardian', 'Erin Patterson loses appeal in Melbourne', '', 1)], { localOk: true });
assert.strictEqual(dev.length, 1, 'begins then loses'); assert.strictEqual(dev[0].title, 'Erin Patterson loses appeal in Melbourne');
const binance = rankStories([
  L('npr', 'Binance Suspends Withdrawals After Crypto Hackers Steal $6.3 Billion', 'The crypto exchange said it was compromised in what could be the biggest crypto heist.', 48),
  L('nyt', 'Binance Suspends Withdrawals After Crypto Hackers Steal $6.3 Billion', 'The crypto exchange said it was compromised in what could be the biggest heist.', 47),
  L('techcrunch', 'Binance resumes customer withdrawals after record $6.3bn hack', 'Cryptocurrency exchange says 90% of losses covered as FBI blames North Korea', 10),
  L('guardian', 'Binance resumes customer withdrawals after record $6.3bn hack', 'Cryptocurrency exchange says 90% of losses covered as FBI blames North Korea.', 11)]);
assert.strictEqual(binance.length, 1, 'suspends then resumes'); assert.ok(/resumes/.test(binance[0].title)); assert.strictEqual(binance[0].indep, 4);
// look-alikes days apart are still two stories
for (const [a, b] of apart) assert.ok(rankStories([L('bbc', a, '', 30), L('guardian', b, '', 1)], { localOk: true }).every(s => s.sources.length === 1), 'follow-up: ' + a);
// repeat filter: another angle on a story already shown is hidden (its links count as seen); broad names do not tie stories
const shown = rankStories([L('techcrunch', 'Binance resumes withdrawals following $6.3 billion breach', '', 3), L('guardian', 'Binance resumes customer withdrawals after record $6.3bn hack', '', 4),
  L('verge', 'North Korea linked to massive Binance crypto heist', '', 5), L('dw', 'FBI says North Korea behind $6.3 billion Binance crypto heist', '', 6)], { localOk: true });
assert.strictEqual(shown.length, 1, 'one Binance story'); assert.strictEqual(shown[0].links.length, 4);
assert.strictEqual(rankStories([L('techcrunch', 'Nvidia weighs playing the cosigner for Nscale’s AI data center in West Virginia', '', 3), L('verge', 'OpenAI might rebrand its AI data centers as compute campuses', '', 4)], { localOk: true }).length, 2, 'AI data centers');
assert.strictEqual(rankStories([L('nyt', 'Haley Stevens endorses GOP candidate in Michigan Senate race', '', 3), L('npr', 'Former President Obama endorses Booker in Kentucky Senate race', '', 4)], { localOk: true }).length, 2, 'Senate races');
// two different strikes days apart are not one verified story
assert.strictEqual(rankStories([L('bbc', 'Russian missile strike on Kharkiv apartment block kills 12', '', 50), L('guardian', 'Russian missile strike on Kharkiv hospital kills 4', '', 2)]).length, 0, 'Kharkiv strikes');
// a single-outlet story never hides a verified one; a verified story needs a stronger tie to be hidden
const tech = rankStories([L('techcrunch', 'Hackers steal Salesforce customer support records in Gainsight breach', '', 1), L('verge', 'Salesforce cuts 4,000 customer support jobs as AI agents take over', '', 2), L('wired', 'Salesforce cuts 4,000 customer support jobs, replacing them with AI agents', '', 2)], { profile: 'tech', localOk: true, singleCap: 2 });
assert.ok(tech.some(s => s.verified), 'verified Salesforce story kept');
assert.strictEqual(rankStories([L('bbc', 'Ryanair cancels hundreds of summer flights as French air traffic control strike begins', '', 2), L('guardian', 'Ryanair cancels hundreds of summer flights as French air traffic control strike begins', '', 3),
  L('sky', 'Ryanair profit jumps 42% as air fares rise and flights stay full', '', 2), L('independent', 'Ryanair profit jumps 42% as air fares rise and flights stay full', '', 3)]).length, 2, 'Ryanair');
// different places stay visible as two stories
assert.strictEqual(rankStories([L('bbc', 'Fighting spreads in South Sudan as talks stall', '', 30), L('guardian', 'Fighting spreads in Sudan as talks stall', '', 1)], { localOk: true }).length, 2);
const lead = rankStories([L('bbc', 'Mushroom murderer Erin Patterson loses appeal', 'Erin Patterson, the mushroom murderer, lost her appeal.', 30), L('guardian', 'Erin Patterson loses appeal over mushroom murders', 'Erin Patterson, the mushroom murderer, lost her appeal.', 1)]);
assert.strictEqual(lead.length, 1); assert.strictEqual(lead[0].title, 'Erin Patterson loses appeal over mushroom murders', 'newest wins a tie');
// joined place names are names; ordinary Title Case words are not joined
assert.ok(caps('West Midlands police arrest 12 in drugs raids').has('westmidland'));
assert.ok(caps('New Orleans police chief resigns').has('neworlean'));
assert.ok(!caps('New Plan To Cut Taxes Unveiled By Treasury Today').has('newplan'));
// media pieces are left out
for (const t of ['Why growth is a lie | Radical Thinking – podcast', 'The view on disability care | Editorial', 'Sir Patrick Stewart: A life in pictures']) assert.ok(isLowQuality({ title: t, link: 'https://example.com/a' }), t);

// headlines that name the US or the UK, and look-alikes that do not
const us = countryMatch('US', 'United States'), gb = countryMatch('GB', 'United Kingdom');
for (const t of ['Japan America Society gala draws Biden', 'U.S. strikes trade deal', 'US jobs report beats forecasts', 'American Airlines cancels flights', 'Americans head to the polls']) assert.ok(us(t), t);
for (const t of ['Let us know what you think', 'Latin America braces for storm', 'South America floods', 'North America heatwave', "Team New Zealand wins America's Cup", 'Team New Zealand wins America’s Cup', 'Argentina win Copa America', 'Pan American Games open in Lima']) assert.ok(!us(t), t);
for (const t of ['UK inflation falls', 'British Airways strike called off', 'Scotland votes on budget', 'Storm hits South Wales', 'London fire: dozens evacuated']) assert.ok(gb(t), t);
for (const t of ['Floods in New South Wales', 'British Columbia wildfire grows', 'New England storm', 'London Breed concedes San Francisco mayor race']) assert.ok(!gb(t), t);

// fetcher: a narrow pick that leaves tabs short reads the picked topics' sections; all topics read only the main feeds
(async () => {
  const urls = sec => SECTIONS[sec].map(f => f[1]);
  const story = (title, sec) => { for (const u of urls(sec)) feeds.bodies[u] = feeds.rss([[title, u.replace(/\/[^/]*$/, '/') + encodeURIComponent(title)]]); };
  feeds.bodies = {};
  story('Saka winner settles derby as Arsenal beat Chelsea 2-1', 'sports');
  story('Senate passes budget after tense vote', 'politics');
  story('OpenAI releases new chatbot model for schools', 'ai');
  setFetch((u, o) => feeds.fetch(u, o));
  const all = await fetchAll({ country: 'US', state: '', topics: T.IDS });
  assert.ok(!feeds.calls.some(u => Object.values(SECTIONS).flat().some(f => f[1] === u)), 'all topics: no section feeds');
  assert.strictEqual(all.world.length, 0);

  feeds.calls.length = 0;
  const sport = await fetchAll({ country: 'US', state: '', topics: ['sports'] });
  assert.ok(urls('sports').every(u => feeds.calls.includes(u)), 'sports pick: sport sections read');
  assert.ok(!feeds.calls.some(u => urls('health').includes(u)), 'only the picked topics’ sections');
  assert.strictEqual(sport.world.length, 1, 'World fills from the sport sections'); assert.ok(sport.world[0].indep >= 2, 'still verified');
  assert.strictEqual(sport.country.length, 0, 'a London derby is not US news');
  assert.strictEqual(sport.tech.length, 0, 'sport stays out of AI & Tech');

  const politics = await fetchAll({ country: 'US', state: '', topics: ['politics'] });
  assert.ok(politics.country.length >= 1 && politics.country.every(s => s.sources.every(o => ['NYT', 'NPR', 'CBS News'].includes(o))), 'US Country tab: US outlets’ politics sections only');
  const gbPolitics = await fetchAll({ country: 'GB', state: '', topics: ['politics'] });
  assert.ok(gbPolitics.country.every(s => !s.sources.some(o => ['NYT', 'NPR', 'CBS News'].includes(o))), 'GB Country tab: no US politics');

  story('US Open: Alcaraz beats Sinner in New York final', 'sports');
  const named = await fetchAll({ country: 'US', state: '', topics: ['sports'] });
  assert.strictEqual(named.country.length, 1, 'a sport story that names the US reaches the US Country tab');

  // a section story that changes is picked up even when every main feed answers "not modified"
  story('England beat Wales in Six Nations decider', 'sports');
  const changedSection = await fetchAll({ country: 'US', state: '', topics: ['sports'] });
  assert.ok(changedSection.world.some(s => /Six Nations/.test(s.title)), 'new section story shown');

  const ai = await fetchAll({ country: 'US', state: 'California', topics: ['ai'] });
  assert.ok(ai.tech.length >= 1, 'AI section stories reach AI & Tech');
  assert.strictEqual(ai.state.length, 0, 'not about California: stays off Local');
  console.log('topic fill tests passed');
})();
