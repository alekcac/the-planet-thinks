const base = {
  meta: { dt: '2026-06-11T10:00:00Z', domain: 'en.wikipedia.org' },
  wiki: 'enwiki',
};

export const fx = {
  humanEdit: {
    ...base,
    type: 'edit', namespace: 0, title: 'Eiffel Tower',
    user: 'ExampleUser', bot: false,
    server_name: 'en.wikipedia.org',
    length: { old: 105234, new: 105260 },
    revision: { old: 1290011111, new: 1290022222 },
  },
  botEdit: {
    ...base,
    type: 'edit', namespace: 0, title: 'Berlin',
    user: 'ExampleBot', bot: true,
    server_name: 'de.wikipedia.org',
    length: { old: 80000, new: 80012 },
    revision: { old: 222001, new: 222002 },
  },
  tempAccountEdit: {
    ...base,
    type: 'edit', namespace: 0, title: 'Mount Fuji',
    user: '~2026-12345-67', bot: false,
    server_name: 'ja.wikipedia.org',
    length: { old: 4000, new: 3900 },
    revision: { old: 333001, new: 333002 },
  },
  ipv6Edit: {
    ...base,
    type: 'edit', namespace: 0, title: 'Sydney Opera House',
    user: '2001:DB8:0:0:0:0:0:1', bot: false,
    server_name: 'en.wikipedia.org',
    length: { old: 51000, new: 51080 },
    revision: { old: 444001, new: 444002 },
  },
  wikidataEdit: {
    ...base,
    type: 'edit', namespace: 0, title: 'Q937',
    user: 'SomeUser', bot: false,
    server_name: 'www.wikidata.org',
    length: { old: 100, new: 120 },
    revision: { old: 555001, new: 555002 },
  },
  talkEdit: {
    ...base,
    type: 'edit', namespace: 1, title: 'Talk:Eiffel Tower',
    user: 'SomeUser', bot: false,
    server_name: 'en.wikipedia.org',
    length: { old: 9000, new: 9100 },
    revision: { old: 666001, new: 666002 },
  },
  categorize: {
    ...base,
    type: 'categorize', namespace: 14, title: 'Category:Towers',
    user: 'SomeUser', bot: false,
    server_name: 'en.wikipedia.org',
  },
  newPage: {
    ...base,
    type: 'new', namespace: 0, title: 'Some New Place',
    user: 'ExampleUser', bot: false,
    server_name: 'en.wikipedia.org',
    length: { new: 2400 },
    revision: { new: 777001 },
  },
};
