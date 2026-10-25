# Interface languages

The dashboard offers English, Spanish, Simplified Chinese, Tagalog, Vietnamese, Arabic and Hindi in both onboarding and the top bar. Language changes apply immediately to supported interface phrases and are saved separately from account and location preferences. Arabic uses right-to-left layout, while map widgets and video retain their original direction.

Spanish, Chinese, Tagalog, Vietnamese and Arabic are the five largest non-English home-language groups in the [Migration Policy Institute's table based on the 2024 ACS](https://www.migrationpolicy.org/journal/spotlight/frequently-requested-statistics-immigrants-and-immigration-united-states#language). That table covers all U.S. residents ages five and older, not only immigrants. Chinese groups spoken varieties together; this implementation provides Simplified Chinese text. Hindi was added at the owner's request.

## Scope

`public/locales/interface.json` contains English keys and six translations in the order defined by `LANGUAGES` in `public/language.js`: Spanish, Simplified Chinese, Tagalog, Vietnamese, Arabic, Hindi. It includes navigation, setup, common actions, selected status messages and accessible labels. Templates retain city names and numbers without translating them.

This is interface localization, not a whole-site document translation service. Public records, news articles, meeting documents, the recorded tour and unmatched descriptions remain in their original language. A visible notice explains this whenever a non-English language is selected. The dictionaries would benefit from native-speaker editorial review before any claim of professionally reviewed translations.

No translation service receives page text or account data. The catalog loads from the same origin only after a non-English choice, including a saved choice. Failed or malformed loads retain the previous language and allow a retry. Preferences work for the current visit even when storage is blocked.

The page retains English as its default text language for original records. Single-text-node containers with a translated phrase receive the selected language attribute. Input values, IDs, event handlers, links, account identities, map internals and option values are preserved. Newly rendered controls are translated through a batched mutation observer, and English restores the original text.

## Verification

- Full suite: 342 passing tests, including six language tests covering catalogs, restoration, template parameters, request races, retry, RTL reset and blocked storage.
- Browser: all seven choices, synchronized selectors, saved choice after reload, Hindi topic navigation, Arabic setup and unchanged guest identity/county.
- Narrow viewport: 319px-wide English/Hindi dashboard fits without horizontal page overflow. Related fixes keep long city selectors and status badges within their containers and prevent the old off-screen skip link from creating RTL overflow.

Run `node --test tests/language.test.js` after editing catalogs or the translation controller. Verify real rendered pages as well, especially mixed-language paragraphs and RTL layouts.
