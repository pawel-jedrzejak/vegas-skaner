# Vegas Skaner

Skaner zawieszek do spisu z natury w magazynie Vegas Jeans. Działa w Safari na iPhonie, bez instalacji: telefon czyta tekst z białej naklejki (model, materiał, pas, nogawka), zamienia go na SKU ze sklepu i zlicza sztuki. Nic nie zapisuje do Shopify, nie ma żadnych kluczy.

Adres: **https://pawel-jedrzejak.github.io/vegas-skaner/**

## Dodanie do ekranu iPhone'a

| Krok | Co zrobić |
|---|---|
| 1 | Otwórz adres w Safari (musi być Safari, nie Chrome). |
| 2 | Przycisk „Udostępnij” (kwadrat ze strzałką) → **„Do ekranu początkowego”** → Dodaj. |
| 3 | Uruchom „Vegas Skaner” z ekranu, stuknij **Start skanera**, zgódź się na kamerę. |
| 4 | Pierwsze uruchomienie pobiera silnik OCR (ok. 6 MB). Potem wszystko działa bez sieci. |

## Skanowanie

| Krok | Co zrobić |
|---|---|
| 1 | Zakładka **Lista** → wpisz nazwę sesji, np. `101 mat. 42` → **Nowa**. Nazwa w tym formacie włącza filtr sesji (patrz niżej). |
| 2 | Zakładka **Skaner** → **Start skanera**. Zielona ramka = gotowy. |
| 3 | Podsuń zawieszkę tak, żeby biała naklejka wypełniła ramkę na szerokość (ok. 15–20 cm od telefonu). |
| 4 | Pik + duży napis `101-42-94-30 · 3 szt.` = zaliczone. Zabierz zawieszkę, ramka znowu zielona, następna para. |
| 5 | Żółte okno „Kod spoza listy sklepu” = odczyt nie pasuje do żadnego SKU. Stuknij **Dodaj „poza sklepem”** albo **Pomiń**. |
| 6 | Żółte okno „Inny model/materiał niż w tej sesji” = odczyt inny niż filtr sesji. Sprawdź zawieszkę, potem **Dodaj mimo to** albo **Pomiń**. |

Przyciski pod kamerą: **Cofnij** (cofa ostatnie zliczenie), **+1 jeszcze raz** (dolicza ostatni SKU bez skanowania), **i** (podgląd odczytu, do diagnozy).

### Zabezpieczenia przed podwójnym zliczeniem

| Mechanizm | Jak działa |
|---|---|
| Dwie zgodne klatki | SKU jest zaliczany dopiero, gdy dwa kolejne odczyty dadzą ten sam kod z listy sklepu. |
| Zawieszka musi zniknąć | Po zaliczeniu ramka robi się żółta. Skaner uzbraja się ponownie dopiero, gdy przez 2 klatki nie widzi pełnej zawieszki i minęło 1,5 s. Trzymanie tej samej zawieszki w ramce nie doliczy drugiej sztuki. Ta sama para dwa razy = trzeba ją świadomie zabrać i podsunąć ponownie. |
| Filtr sesji | Kupka to zwykle jeden model i materiał. Odczyt innego materiału (np. `20` zamiast `40`) nie wchodzi automatycznie, tylko pyta. |
| Kontrola pasa | Centymetry muszą zgadzać się z calami z zawieszki (`84 / 33"`): 84 cm ≈ 33". Błędna cyfra w pasie jest odrzucana. |
| Pewność OCR | Słowa z materiałem i modelem muszą mieć pewność ≥ 75 %. |
| Lista SKU | Kod jest zaliczany tylko, jeśli istnieje w sklepie (1482 warianty). |

## Zły odczyt

| Sytuacja | Co zrobić |
|---|---|
| Zaliczyło zły SKU | **Cofnij** od razu, albo w **Lista** stuknij **−** przy złym i **+** przy dobrym. |
| Nie chce zaliczyć | Wyprostuj naklejkę w ramce, przybliż telefon, unikaj odblasku. Jeśli dalej nic: **Lista** → wpisz SKU ręcznie → **+1**. |
| Zawieszka ze starym kodem | Pojawi się okno „poza sklepem”. Dodaj, trafi do osobnej listy z odczytanym tekstem. |
| Ciągle pyta o inny materiał | Zmień filtr sesji w **Lista** (pole „Filtr sesji”) albo wyczyść go. |

## Wysyłka

**Wyślij** → **Kopiuj CSV** (albo **Pobierz plik**, **Udostępnij…**). Plik ma format `sku,ilosc`. Wklej go w sesji czatu, a Claude wpisze stany do Shopify. Osobno jest lista „poza sklepem”.

Stan sesji jest w pamięci przeglądarki (localStorage): zamknięcie Safari nic nie kasuje. Sesji może być wiele, przełącza się je w **Lista**.

## Jak to działa (technicznie)

| Element | Rozwiązanie |
|---|---|
| OCR | [tesseract.js 6](https://github.com/naptha/tesseract.js) (Tesseract 5 LSTM, WASM SIMD) w Web Workerze, model `eng` z tessdata_fast. Pliki w `vendor/` (działa offline). |
| Obraz | Wycinek ramki z tylnej kamery (1920×1080), skala szarości, automatyczne przycięcie do białej naklejki, progowanie Sauvola w Tesseracie, PSM 6. |
| Parser | `parser.js`: model ∈ {101, 417, 419}, materiał (mapa `mapping.json`), pas 80–116 parzysty + zgodność z calami, nogawka ∈ {30, 32, 34}. Toleruje typowe błędy OCR (`4l7`, `941 37"`, `410` zamiast `110`, brak ukośnika). |
| Lista SKU | `skus.json` (1482 SKU z Shopify, 26 materiałów × 19 pasów × 3 nogawki). |
| Stan | `store.js`, localStorage, log zmian (`+1/−1`) przygotowany pod przyszły tryb przyjęć/wydań. |
| PWA | `manifest.webmanifest` + `sw.js` (cache wszystkich plików). |

### Pomiary (bez telefonu)

| Test | Wynik |
|---|---|
| Parser (testy jednostkowe) | 19/19 |
| Zdjęcie z zawieszkami (2 naklejki) | 2/2 SKU dobrze |
| 120 sztucznych zawieszek (obrót ±8°, rozmycie, odblask, cień, zagięcie, szum, JPEG) | 67 dobrze, 0 źle, 5 „poza sklepem” (do potwierdzenia stuknięciem), 48 bez odczytu (najbardziej rozmyte/małe, następna klatka) |
| Czas OCR jednej klatki (Node, ten sam WASM) | średnio 185 ms, maks. 400 ms |
| Test end-to-end w Chromium z podstawioną kamerą (12 zawieszek po 2 s) | 9 zaliczonych, 0 złych, 3 pominięte (rozmycie 2 px); ok. 1 s od pojawienia się zawieszki do pika; 150 ms na klatkę |

## Narzędzia deweloperskie

```bash
npm install
npm test                                   # testy parsera
mkdir -p tools/lang_fast && curl -sSL -o tools/lang_fast/eng.traineddata https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata
python3 tools/gen_labels.py /tmp/synth 60 7          # sztuczne zawieszki + truth.json
node tools/bench.mjs /tmp/synth --lang=tools/lang_fast --pre=gray --thr=2   # OCR + parser, czasy
python3 tools/e2e/make_video.py /tmp/synth /tmp/cam.mjpeg 12                # "film z kamery"
npm run serve &  node tools/e2e/run.mjs /tmp/cam.mjpeg                      # test w Chromium (Playwright)
```

Na GitHub Pages publikuje `.github/workflows/pages.yml`. Jednorazowo w repozytorium: **Settings → Pages → Build and deployment → Source: „GitHub Actions”**, potem **Actions → „GitHub Pages” → Run workflow** (albo dowolny push na `main` lub gałąź `claude/**`).

## Plany (nie teraz)

Tryb ruchów (+1 przyjęcie / −1 wydanie offline) i naklejki z kodem kreskowym: `store.js` ma już log zmian z polem `src`, a do kodów kreskowych wystarczy drugi dekoder obok OCR (BarcodeDetector w Safari 17+ albo ZXing), który zwraca ten sam SKU.
