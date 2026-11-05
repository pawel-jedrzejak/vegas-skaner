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

## Tryby sesji

Tryb wybierasz przy zakładaniu sesji (**Lista → Tryb → Nowa**). Jedna sesja ma jeden tryb. Tryb widać na kolorowym pasku nad kamerą.

| Tryb | Pasek | Co skanujesz | Plik | Co zrobi Shopify |
|---|---|---|---|---|
| Spis z natury | szary | wszystko, co leży na półce | `sku,ilosc` z liczbą, np. `4` | **ustawi** stan na tę liczbę |
| Przyjęcie | zielony | tylko przyjmowane pary | `sku,zmiana` ze znakiem, np. `+3` | **doda** do stanu |
| Wydanie | czerwony | tylko wydawane pary | `sku,zmiana` ze znakiem, np. `-2` | **odejmie** od stanu |

Nie mieszaj trybów: dostawy nie skanuj w sesji spisu, bo plik ustawiłby stan na liczbę z dostawy, zamiast ją dodać.

## Skanowanie

| Krok | Co zrobić |
|---|---|
| 1 | Zakładka **Lista** → wpisz nazwę sesji, np. `101 mat. 42` → wybierz **Tryb** → **Nowa**. Nazwa w tym formacie włącza filtr sesji (patrz niżej). |
| 2 | Zakładka **Skaner** → **Start skanera**. Zielona ramka = gotowy. |
| 3 | Podsuń zawieszkę tak, żeby biała naklejka wypełniła ramkę na szerokość (ok. 15–20 cm od telefonu). |
| 4 | **Wysoki podwójny pik** + duży napis `101-42-94-30 · 3 szt.` = zaliczone. Ramka żółta. |
| 5 | Zabierz zawieszkę. **Krótkie niskie „tyk”** + zielona ramka = gotowy na kolejną parę. |
| 6 | Żółte okno „Kod spoza listy sklepu” = odczyt nie pasuje do żadnego SKU. Stuknij **Dodaj „poza sklepem”** albo **Pomiń**. |
| 7 | Żółte okno „Inny model/materiał niż w tej sesji” = odczyt inny niż filtr sesji. Sprawdź zawieszkę, potem **Dodaj mimo to** albo **Pomiń**. |

### Dźwięki

| Dźwięk | Znaczenie |
|---|---|
| Wysoki podwójny pik | Zeskanowane, sztuka doliczona |
| Krótkie niskie „tyk” | Gotowy na kolejną zawieszkę |
| Niski, opadający | Pytanie: kod spoza sklepu albo inny materiał niż w sesji |

Dźwięki grają też przy włączonym wyciszeniu (iOS 16.4+). Głośność ustawiasz przyciskami iPhone'a. W **Lista → Dźwięki** każdy dźwięk można wyłączyć i odsłuchać (▶). iPhone nie pozwala stronom na wibracje, więc zostaje dźwięk i kolor ramki.

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

**Wyślij** → **Kopiuj CSV** (albo **Pobierz plik**, **Udostępnij…**). Wklej plik w sesji czatu z podłączonym Shopify. Osobno jest lista „poza sklepem”. Nazwa pliku zaczyna się od trybu: `spis-…`, `przyjecie-…`, `wydanie-…`.

| Nagłówek pliku | Wpis do Shopify (lokalizacja „Vegas Jeans - Szybka 6/10”) |
|---|---|
| `sku,ilosc` | ustaw stan „dostępne” na podaną liczbę (`inventorySetQuantities`) |
| `sku,zmiana` | zmień stan o podaną wartość, `+` dodaje, `-` odejmuje (`inventoryAdjustQuantities`). Przed wpisem sprawdź, czy wydanie nie zejdzie poniżej zera. |

Stan sesji jest w pamięci przeglądarki (localStorage): zamknięcie Safari nic nie kasuje. Sesji może być wiele, przełącza się je w **Lista**.

## Jak to działa (technicznie)

| Element | Rozwiązanie |
|---|---|
| OCR | [tesseract.js 6](https://github.com/naptha/tesseract.js) (Tesseract 5 LSTM, WASM SIMD) w Web Workerze, model `eng` z tessdata_fast. Pliki w `vendor/` (działa offline). |
| Obraz | Wycinek ramki z tylnej kamery (1920×1080), skala szarości, automatyczne przycięcie do białej naklejki, progowanie Sauvola w Tesseracie, PSM 6. |
| Parser | `parser.js`: model ∈ {101, 417, 419}, materiał (mapa `mapping.json`), pas 80–116 parzysty + zgodność z calami, nogawka ∈ {30, 32, 34}. Toleruje typowe błędy OCR (`4l7`, `941 37"`, `410` zamiast `110`, brak ukośnika). |
| Lista SKU | `skus.json` (1482 SKU z Shopify, 26 materiałów × 19 pasów × 3 nogawki). |
| Stan | `store.js`, localStorage. Sesja ma tryb (spis, przyjęcie, wydanie) i log zmian. Eksport dokłada nagłówek i znak. |
| PWA | `manifest.webmanifest` + `sw.js` (cache wszystkich plików). |

### Pomiary (bez telefonu)

| Test | Wynik |
|---|---|
| Parser (testy jednostkowe) | 19/19 |
| Sesje i eksport w 3 trybach (testy jednostkowe) | wszystkie OK |
| Zdjęcie z zawieszkami (2 naklejki) | 2/2 SKU dobrze |
| 120 sztucznych zawieszek (obrót ±8°, rozmycie, odblask, cień, zagięcie, szum, JPEG) | 67 dobrze, 0 źle, 5 „poza sklepem” (do potwierdzenia stuknięciem), 48 bez odczytu (najbardziej rozmyte/małe, następna klatka) |
| Czas OCR jednej klatki (Node, ten sam WASM) | średnio 185 ms, maks. 400 ms |
| Test end-to-end w Chromium z podstawioną kamerą (12 zawieszek po 2 s) | 7–8 zaliczonych, 0 złych, do 1 pytania „poza sklepem”, reszta pominięta (rozmycie 2 px); ok. 1 s od pojawienia się zawieszki do pika; 150 ms na klatkę. Wynik zmienia się o 1 przy przesunięciu ramki o kilka pikseli. |

## Narzędzia deweloperskie

```bash
npm install
npm test                                   # testy parsera i sesji
mkdir -p tools/lang_fast && curl -sSL -o tools/lang_fast/eng.traineddata https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata
python3 tools/gen_labels.py /tmp/synth 60 7          # sztuczne zawieszki + truth.json
node tools/bench.mjs /tmp/synth --lang=tools/lang_fast --pre=gray --thr=2   # OCR + parser, czasy
python3 tools/e2e/make_video.py /tmp/synth /tmp/cam.mjpeg 12                # "film z kamery"
npm run serve &  node tools/e2e/run.mjs /tmp/cam.mjpeg                      # test w Chromium (Playwright)
```

Na GitHub Pages publikuje `.github/workflows/pages.yml`. Jednorazowo w repozytorium: **Settings → Pages → Build and deployment → Source: „GitHub Actions”**, potem **Actions → „GitHub Pages” → Run workflow** (albo dowolny push na `main` lub gałąź `claude/**`).

## Plany (nie teraz)

Naklejki z kodem kreskowym: wystarczy drugi dekoder obok OCR (BarcodeDetector w Safari 17+ albo ZXing), który zwraca ten sam SKU. Tryby i eksport zostają bez zmian.
