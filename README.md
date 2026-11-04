# Книга обліку доходів і витрат ФОП (Типова форма № 261) — PWA & Android (Capacitor)

Автономний повнофункціональний Progressive Web App (PWA) та нативний Android-додаток (Capacitor) для щоденного оперативного обліку доходів і витрат самозайнятих осіб (ФОП на загальній системі оподаткування та осіб, які провадять незалежну професійну діяльність) з автоматичним формуванням Типової форми та Додатка з амортизації згідно з **наказом Міністерства фінансів України від 13.05.2021 № 261**.

---

## 1. Ключові можливості
1. **Локальна база даних IndexedDB (`Dexie.js`, схема `TaxBookDB` v1):**
   - `profile`: реквізити платника податків (ПІБ, РНОКПП / паспорт, категорія діяльності, статус платника ПДВ).
   - `transactions`: щоденні записи про доходи (`INCOME`), повернення коштів (`RETURN`) та витрати (`EXPENSE`) з розбивкою за графами 6–9 (`col_6`, `col_7`, `col_8`, `col_9`).
   - `fixedAssets`: реєстр об'єктів основних засобів та нематеріальних активів за пп. 177.4.9 ПКУ.
2. **Нативна мобільна інтеграція (Capacitor 6 для Android):**
   - `@capacitor/filesystem` + `@capacitor/share`: нативне збереження двосторінкових Excel-звітів (`.xlsx`) та JSON-бекапів у пам'ять смартфона з миттєвим відкриттям системного меню «Поділитися» (Telegram, Viber, Google Drive, Email).
   - `@capacitor/app`: підтримка системної апаратної кнопки «Назад» (закриття модального вікна швидкого запису -> повернення на вкладку «Журнал» -> вихід із додатку).
   - `@capacitor/splash-screen` та `@capacitor/assets`: фірмовий екран завантаження (`#1E293B`) та адаптивні іконки Android у папці `assets/`.

---

## 2. Локальний запуск та генерація Android-проекту

```bash
# 1. Встановлення залежностей
npm install

# 2. Запуск у режимі розробки (Web / PWA)
npm run dev

# 3. Створення Android-платформи та синхронізація бандлу
npm run build
npx cap add android
npx cap sync android

# 4. Генерація нативних іконок та сплеш-скрінів із папки assets/
npm run cap:assets

# 5. Відкриття у Android Studio
npm run cap:open:android
```

---

## 3. Автоматична збірка підписаного Release APK через GitHub Actions

У проекті налаштовано CI/CD пайплайн `.github/workflows/android-release.yml`, який автоматично збирає, вирівнює (`zipalign`) та підписує (`apksigner`) готовий до встановлення файл `TaxBook-261-Release-Signed.apk`.

### Як створити власний ключ підпису (Keystore) та налаштувати GitHub Secrets:

1. **Згенеруйте ключ підпису локально:**
   ```bash
   keytool -genkeypair -v -keystore release.keystore -alias taxbook_key -keyalg RSA -keysize 2048 -validity 10000
   ```
2. **Перетворіть файл `release.keystore` у Base64:**
   - **Linux / macOS:** `base64 -i release.keystore | tr -d '\n' > keystore.b64`
   - **Windows (PowerShell):** `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Content keystore.b64`
3. **Додайте 4 секрети у налаштуваннях репозиторію GitHub** (`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`):
   - `ANDROID_KEYSTORE_BASE64` — вміст файлу `keystore.b64`
   - `ANDROID_KEYSTORE_PASSWORD` — пароль до сховища ключів
   - `ANDROID_KEY_ALIAS` — аліас ключа (напр. `taxbook_key`)
   - `ANDROID_KEY_PASSWORD` — пароль до ключа

> **Примітка:** Якщо секрети ще не задані, workflow автоматично створить тимчасовий сертифікат підпису під час збірки, щоб ви одразу отримали працездатний підписаний APK у вкладці **Actions -> Artifacts (`TaxBook-261-Release-APK`)**.
