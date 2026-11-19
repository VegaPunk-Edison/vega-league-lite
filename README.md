# Vega League – Registrierungs-WebApp (Testphase)

Mobile-first Web-App im Terminal-Stil: Registrierung Feld für Feld, Prüf-Animation, Login per Fingerabdruck oder Code.

## Starten

```bash
npm install
npm start
```

Dann im Browser `http://localhost:3000` öffnen (Passkeys funktionieren auf `localhost`, nicht auf IP-Adressen).

## Konfiguration (optional)

| Variable   | Standard                  | Bedeutung                                   |
|------------|---------------------------|---------------------------------------------|
| `PORT`     | `3000`                    | Port des Servers                            |
| `HOST`     | `127.0.0.1`               | Netzwerk-Interface                          |
| `DATA_DIR` | `./data`                  | Ort der SQLite-Datenbank (`pifa.db`)        |
| `RP_ID`    | Hostname der Anfrage      | Passkey-Domain (z. B. `localhost`)          |
| `ORIGIN`   | Protokoll + Host der Anfrage | Erlaubter Origin für Passkeys            |

Für den Betrieb im Internet ist HTTPS nötig, sonst funktioniert der Fingerabdruck nicht.

## Aufbau

- `server/index.js` – Express-Server und API (Registrierung, Passkeys, Code-Login, Sitzungen)
- `server/validate.js` – Spam-Filter für Name, Geburtsdatum, Telefon und E-Mail
- `server/db.js` – SQLite-Schema
- `public/` – Oberfläche (HTML, CSS, JavaScript ohne Framework)
- `public/js/pifa-texts.js` – PIFA-Infotexte für die schnelle Animation

## Bekannte Grenzen (Testphase)

- Ein Konto ist an das Gerät gebunden (Cookie). Auf einem anderen Gerät muss man sich neu registrieren.
- Die Prüfung durch den „Mitarbeiter“ ist nur Show. Gefiltert wird nur offensichtlicher Spam.
- E-Mail-Bestätigung entfällt.
