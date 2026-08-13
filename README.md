# Movies & TV Recaps Maker Hub

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**פלטפורמת אינטרנט ליצירת סיכומי וידאו מקצועיים לסרטים וסדרות באמצעות בינה מלאכותית.** מעלים סרטון, מתארים אותו בטקסט, והמערכת חותכת ממנו אוטומטית קטעים לאורך כל הסרטון ויוצרת תסריט קריינות בעזרת Google Gemini AI — הכול ישירות בדפדפן, בלי להעלות את קובץ הווידאו לשום שרת.

תיעוד מפורט של כל השינויים וההחלטות הטכניות בפרויקט נמצא בקובץ [CHANGELOG.md](CHANGELOG.md).

## ✨ תכונות עיקריות

- 🎬 **עיבוד וידאו בדפדפן** — חיתוך והרכבה של הסיכום מתבצעים ב-FFmpeg.wasm ישירות בדפדפן שלכם, ללא שרת עיבוד חיצוני. קובץ הווידאו המקורי לעולם לא עוזב את המחשב שלכם בשלב הזה.
- 🤖 **תסריט חכם עם Gemini AI** — התיאור שאתם כותבים (עלילה, דמויות, אירועים מרכזיים) הוא המקור העיקרי לתסריט שנוצר; ה-AI מונחה במפורש להיצמד לטקסט שהזנתם ולא "להמציא" פרטים.
- ⏱️ **סנכרון אוטומטי בין אורך הסיכום למרווח החיתוך** — לאחר העלאת סרטון, המערכת מחשבת אוטומטית כל כמה שניות לחתוך כדי שהסיכום הסופי אכן ייצא באורך שביקשתם, ומציגה גם את משך הסרטון המקורי.
- 💾 **שמירה אמיתית של סיכומים** — ניתן לשמור סיכום (וידאו + תסריט + אודיו) להיסטוריה שלכם ולחזור אליו מאוחר יותר, כולל נגן וידאו מובנה בעמוד ההיסטוריה.
- 🌍 **תמיכה מלאה ב-6 שפות** — אנגלית, עברית, רוסית, ערבית, ספרדית וצרפתית. האתר מזהה אוטומטית את שפת הדפדפן שלכם (למשל דפדפן בעברית יקבל ממשק בעברית), עם אפשרות להחליף שפה ידנית מהתפריט העליון; עברית וערבית כוללות תמיכת RTL מלאה עם היפוך אוטומטי של כל הפריסה.
- 🔒 **בטוח ומאובטח** — מפתח ה-API שלכם ל-Gemini נשלח ישירות מהדפדפן ל-Google ולעולם לא נשמר בצד שרת.
- 🎨 **עיצוב זכוכית (Glassmorphism)** — ממשק כהה ומודרני עם פאנלים שקופים מטושטשים על רקע דינמי.
- 📊 **סטטיסטיקות שימוש** — מעקב אנונימי אחרי מספר הסיכומים שנוצרו ודירוגי משתמשים.

## 💻 דרישות מערכת (כולל Windows)

זוהי אפליקציית **אינטרנט** — אין קובץ התקנה (`.exe`) להורדה, וגם אין צורך בו. היא פועלת בכל מחשב עם דפדפן מודרני, כולל **Windows 10 / 11**, macOS ו-Linux.

לשימוש רגיל באתר (לא לפיתוח) צריך רק:
- דפדפן עדכני — Google Chrome, Microsoft Edge או Firefox מומלצים (עיבוד הווידאו מבוסס WebAssembly, שנתמך היטב בדפדפנים אלו).
- מפתח API חינמי ל-Google Gemini (ניתן להשיג ב-[Google AI Studio](https://aistudio.google.com/app/apikey)).

> **הערה חשובה על מגבלות זיכרון בדפדפן:** גודל הקובץ המקסימלי הנתמך הוא **3.5GB**. זו לא מגבלה שרירותית — WebAssembly (הטכנולוגיה שמריצה את מנוע העיבוד בדפדפן) מוגבל ל-4GB זיכרון, ו-3.5GB משאיר מרווח ביטחון בטוח מתחת לתקרה הזו.

## 🚀 שימוש מהיר (למשתמש קצה)

1. פתחו את כתובת האתר בדפדפן (ב-Windows, macOS או כל מערכת אחרת).
2. לחצו על **API Key** בפינה העליונה והדביקו את מפתח ה-Gemini שלכם.
3. גררו קובץ וידאו (MP4 / AVI / MOV / MKV, עד 3.5GB) לתיבת ההעלאה.
4. מלאו כותרת ותיאור מפורט של הסרט/הסדרה — התסריט ייווצר בעיקר על סמך התיאור הזה.
5. כווננו את אורך הסיכום הרצוי (מרווח החיתוך יחושב אוטומטית).
6. לחצו **צור סיכום וידאו** והמתינו — זמן העיבוד תלוי באורך ובאיכות קובץ המקור (ראו הערה למטה).
7. לאחר הסיום: צפו בסיכום, העתיקו את התסריט, הורידו את הקובץ, או שמרו אותו להיסטוריה.

> **למה עיבוד וידאו לוקח זמן?** מנוע העיבוד חייב "לצפות" בכל הסרטון המקורי מתחילתו ועד סופו כדי לבחור אילו קטעים לחתוך, ולכן קובץ ארוך או ברזולוציה גבוהה יעובד לאט יותר. הפרויקט רץ כרגע על ליבת מעבד אחת בלבד בכוונה תחילה (החלטה מודעת שנועדה להימנע מסיכון תאימות עם משאבים חיצוניים באתר) — פרטים מלאים ב-[CHANGELOG.md](CHANGELOG.md).

## 🛠️ פיתוח מקומי

### דרישות מקדימות

- [Node.js](https://nodejs.org/) גרסה 20 ומעלה (מוגדר ב-`.node-version`) — גם ב-Windows וגם ב-macOS/Linux.
- npm (מגיע יחד עם Node.js).

### התקנה והרצה

באותה צורה בדיוק ב-Windows (PowerShell / CMD), macOS או Linux:

```bash
git clone <repository-url>
cd movies--tv--recaps--maker--with--ai--app

npm install
npm run dev
```

לאחר מכן פתחו בדפדפן את הכתובת שמוצגת בטרמינל (בדרך כלל `http://localhost:5173`).

### הגדרת Supabase (שמירת סיכומים, היסטוריה, התחברות)

הפרויקט משתמש ב-[Supabase](https://supabase.com) (חינמי) לשמירת סיכומים, היסטוריה, דירוגים והתחברות אופציונלית. בלי זה האתר עדיין עובד ליצירת סיכומים — רק השמירה/היסטוריה/התחברות לא יפעלו.

1. צרו פרויקט חינמי ב-[supabase.com](https://supabase.com).
2. **הפעילו התחברות אנונימית** (חובה): Dashboard → Authentication → Sign In / Providers → Anonymous Sign-Ins → Enable. זה מה שנותן לכל מבקר זהות אמיתית לשמירה בלי להירשם.
3. הריצו את הסכמה — שתי דרכים אפשריות, בוחרים אחת:
   - **ידנית (הכי פשוט):** העתיקו את התוכן של כל הקבצים ב-[`supabase/migrations/`](supabase/migrations/) **לפי סדר השמות** (`20260809120000_initial_schema.sql`, `20260812130000_app_stats.sql`, `20260813120000_drop_public_storage_select_policy.sql`) והריצו כל אחד בנפרד דרך Dashboard → SQL Editor → New query.
   - **אוטומטית דרך GitHub:** Dashboard → Project Settings → Integrations → GitHub → חברו את הריפו הזה, Working directory = `.`, הפעילו **Deploy to production** עם הענף `main`. **חשוב: השאירו את "Automatic branching" כבוי** — זו תכונה שיוצרת מסד נתונים נפרד לכל Pull Request ועלולה לגבות כסף (Supabase מציגים על כך אזהרה מפורשת: "Branching Compute is not covered by your organization's Spend Cap"). בלי branching, כל push ל-`main` פשוט מריץ את קובצי ה-migrations ב-`supabase/migrations/` על מסד הייצור, בחינם.

   שתי הדרכים יוצרות את אותו הדבר: טבלאות `recaps`, `tuning_jobs`, `app_stats` ו-`stats_visitors` + bucket אחסון ציבורי בשם `recaps`, כולל כל מדיניות ה-RLS ופונקציות ה-RPC הנדרשות (הסטטיסטיקות הגלובליות בעמוד הבית - כמות סיכומים שנוצרו, משתמשים ייחודיים, דירוג ממוצע - מתעדכנות רק דרך פונקציות אלה, לא ישירות מהלקוח).
4. העתיקו את ה-URL ומפתח ה-anon (או "publishable key" - זה השם החדש ל-anon key ב-Supabase) של הפרויקט (Dashboard → Settings → API) לקובץ `.env.local` (העתיקו מ-`.env.example`). שתי צורות השמות הבאות נתמכות (הקוד בודק את שתיהן) - אין צורך להגדיר את שתיהן, רק אחת:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

או, אם אלה השמות שכבר יש לכם (למשל מהעתקה של הוראות ה-"Connect" של Supabase עצמו, שכתובות עבור Next.js):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

מפתח ה-Gemini AI **לא** מוגדר כמשתנה סביבה — הוא מוזן ישירות על ידי כל משתמש דרך ממשק האתר ונשמר רק בזיכרון הדפדפן שלו.

> **הערה:** אין עוד תמיכה בהקראת טקסט אוטומטית (TTS) לסיכומים שלא כוללים קובץ MP3 משלכם — Supabase (בשונה מהפתרון הקודם) לא כולל שירות כזה מובנה.

## ☁️ פריסה ל-Cloudflare Pages

הפרויקט מוכן לפריסה כאתר סטטי:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Node version:** 20 (מוגדר ב-`.node-version`)

משתני הסביבה הנדרשים (בלוח הבקרה של Cloudflare Pages, תחת Settings → Environment variables, בטאב **Production**) - אחת משתי הצורות הבאות, לא חובה שתיהן:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

לפריסה משורת הפקודה, לאחר `npm install`:

```bash
npm run deploy
```

הפקודה בונה את הפרויקט ומריצה `wrangler pages deploy dist` (מוגדר גם ב-`wrangler.toml`). קובץ `public/_redirects` כבר כולל את חוקי ה-SPA fallback הנדרשים לניתוב בצד הלקוח.

## 🧰 טכנולוגיות

| תחום | טכנולוגיה |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| עיצוב | Tailwind CSS, Framer Motion, Radix UI |
| עיבוד וידאו | FFmpeg.wasm (WebAssembly, בדפדפן) |
| בינה מלאכותית | Google Gemini (יצירת תסריט + חיפוש מידע אופציונלי) |
| אחסון/היסטוריה/התחברות | Supabase (מסד נתונים Postgres + אחסון קבצים + Auth) |
| תרגום (i18n) | i18next, react-i18next, i18next-browser-languagedetector |
| פריסה | Cloudflare Pages (Wrangler) |
| פרסום | Google AdSense |

## 📁 מבנה הפרויקט

```
src/
├── components/            # רכיבי React
│   ├── HomePage.tsx        # דף הבית וניהול תהליך היצירה
│   ├── VideoUploader.tsx   # העלאת קובץ + קריאת משך הסרטון
│   ├── RecapSettings.tsx   # הגדרות הסיכום
│   ├── ProcessingStatus.tsx
│   ├── ResultsSection.tsx  # תצוגת התוצאה + שמירה
│   ├── RecapSaver.tsx      # דיאלוג שמירת סיכום
│   ├── HistoryPage.tsx     # היסטוריית סיכומים שמורים
│   ├── StatsSection.tsx    # סטטיסטיקות ודירוג
│   ├── LanguageSwitcher.tsx
│   └── ui/                 # רכיבי UI בסיסיים (shadcn/radix)
├── i18n/
│   └── config.ts            # אתחול i18next + זיהוי שפה + RTL/LTR
├── locales/                 # קבצי תרגום: en / he / ru / ar / es / fr
├── lib/
│   ├── supabase.ts          # לקוח Supabase + עזרי אימות/סוגים
│   ├── recapStorage.ts      # שמירת/טעינת סיכומים
│   ├── geminiTuning.ts      # Fine-tuning אישי מבוסס Gemini
│   └── stats.ts             # סטטיסטיקות גלובליות (Supabase)
├── types/
│   └── index.ts
└── App.tsx                  # ניתוב ראשי
```

## 🔧 סקריפטים זמינים

- `npm run dev` — שרת פיתוח
- `npm run build` — בנייה לייצור
- `npm run preview` — תצוגה מקדימה של הבנייה
- `npm run typecheck` — בדיקת טיפוסי TypeScript
- `npm run lint` — בדיקת קוד עם ESLint
- `npm run deploy` — בנייה ופריסה ל-Cloudflare Pages

## 🌍 שפות נתמכות

| שפה | קוד | כיוון |
|---|---|---|
| English | `en` | LTR |
| עברית | `he` | RTL |
| Русский | `ru` | LTR |
| العربية | `ar` | RTL |
| Español | `es` | LTR |
| Français | `fr` | LTR |

השפה נבחרת אוטומטית לפי שפת הדפדפן בביקור הראשון; כל בחירה ידנית מהתפריט העליון נשמרת ומועדפת בביקורים הבאים.

## 🔐 פרטיות ואבטחה

- קובצי הווידאו מעובדים מקומית בדפדפן ואינם מועלים לשרת.
- מפתח ה-Gemini API נשלח ישירות מהדפדפן ל-Google ואינו נשמר בצד שרת.
- סיכומים שנשמרים (וידאו, אודיו, תסריט) מאוחסנים דרך Supabase לפי בחירת המשתמש בלבד. בלי התחברות, כל מבקר מקבל זהות אנונימית פרטית (Supabase Anonymous Auth) - ההיסטוריה שלו לא נגישה למבקרים אחרים.
- פירוט מלא בעמודי [מדיניות הפרטיות](/privacy) ו[תנאי השימוש](/terms) שבתוך האתר.

## 📄 רישיון

פרויקט זה מוגן ברישיון MIT — ראו את קובץ [LICENSE](LICENSE) לפרטים.

## 📞 צור קשר

- **דוא"ל:** yaskovbs2502@gmail.com
