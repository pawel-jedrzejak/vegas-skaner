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
| Spis z natury | szary | wszystko, co leży na półce | `sku,ilosc,…` z liczbą, np. `4` | **ustawi** stan na tę liczbę |
| Przyjęcie | zielony | tylko przyjmowane pary | `sku,zmiana,…` ze znakiem, np. `+3` | **doda** do stanu |
| Wydanie | czerwony | tylko wydawane pary | `sku,zmiana,…` ze znakiem, np. `-2` | **odejmie** od stanu |

Nie mieszaj trybów: dostawy nie skanuj w sesji spisu, bo plik ustawiłby stan na liczbę z dostawy, zamiast ją dodać.

## Skanowanie

| Krok | Co zrobić |
|---|---|
| 1 | Zakładka **Lista** → wpisz nazwę sesji, np. `101 mat. 42` → wybierz **Tryb** → **Nowa**. Nazwa w tym formacie włącza filtr sesji (patrz niżej). |
| 2 | Zakładka **Skaner** → **Start skanera**. Zielona ramka = gotowy. |
| 3 | Podsuń zawieszkę tak, żeby biała naklejka wypełniła ramkę na szerokość (ok. 15–20 cm od telefonu). |
| 4 | **Wysoki podwójny pik** + duży napis `101-42-94-30 · 3 szt.` = zaliczone. Ramka żółta. |
| 5 | Zabierz zawieszkę. **Krótkie niskie „tyk”** + zielona ramka = gotowy na kolejną parę. |
| 6 | Żółte okno „Kod spoza listy sklepu” = odczyt nie pasuje do żadnego SKU, np. stary model 414. Stuknij **Dodaj „poza sklepem”** (potem zabierz zawieszkę) albo **Pomiń**. Jeśli to była pomyłka OCR i kolejna klatka da SKU ze sklepu, skaner zaliczy go sam i zamknie okno. |
| 7 | Żółte okno „Inny model/materiał niż w tej sesji” = odczyt inny niż filtr sesji. Sprawdź zawieszkę, potem **Dodaj mimo to** albo **Pomiń**. |

### Dźwięki

| Dźwięk | Znaczenie |
|---|---|
| Wysoki podwójny pik | Zeskanowane, sztuka doliczona |
| Krótkie niskie „tyk” | Gotowy na kolejną zawieszkę |
| Niski, opadający | Pytanie: kod spoza sklepu albo inny materiał niż w sesji |

Dźwięki grają też przy włączonym wyciszeniu (iOS 16.4+). Głośność ustawiasz przyciskami iPhone'a. W **Lista → Dźwięki** każdy dźwięk można wyłączyć i odsłuchać (▶). iPhone nie pozwala stronom na wibracje, więc zostaje dźwięk i kolor ramki.

Przyciski pod kamerą: **Cofnij** (cofa ostatnie zliczenie), **+1 jeszcze raz** (dolicza jeszcze jedną sztukę tego, co dodano ostatnio w tej sesji, także „poza sklepem”; pod napisem widać, co doliczy), **Latarka** (żółta = włączona), **i** (podgląd odczytu, do diagnozy).

**Latarka** pomaga w ciemnym magazynie: mniej szumu, mniej błędnych cyfr. Działa w Safari od iOS 17. Aplikacja pamięta, że była włączona, i zapala ją po Starcie i po powrocie z tła. Przy odblasku na błyszczącej naklejce przechyl lekko zawieszkę.

### Podgląd odczytu

Pod ramką na żywo widać, co skaner już przeczytał, np. `Model 414 · Mat. 87 · Pas 106 · Nog. 32 · spoza sklepu`. Znak `?` przy polu = tego jeszcze nie odczytał (popraw ułożenie, światło, włącz latarkę).

### Zabezpieczenia przed podwójnym zliczeniem

| Mechanizm | Jak działa |
|---|---|
| Dwie zgodne klatki | SKU jest zaliczany dopiero, gdy dwa kolejne odczyty dadzą ten sam kod z listy sklepu. |
| Zawieszka musi zniknąć | Po zaliczeniu ramka robi się żółta. Skaner uzbraja się ponownie dopiero, gdy przez 2 klatki w ramce nie ma dużej białej naklejki (co najmniej 8% ramki) **i** OCR nic nie czyta, oraz minęło 1,5 s. Rozmazana klatka przy ruchu ręki ani niepełny odczyt tej samej zawieszki nie odblokowują. Ta sama para dwa razy = trzeba ją świadomie zabrać z ramki i podsunąć ponownie. Jeśli ramka zostaje żółta mimo zabrania zawieszki, odsuń telefon od kupki na chwilę. |
| Filtr sesji | Kupka to zwykle jeden model i materiał. Odczyt innego materiału (np. `20` zamiast `40`) nie wchodzi automatycznie, tylko pyta. Bez filtra w nazwie sesji skaner pyta przy pierwszym skanie każdego nowego modelu/materiału w sesji (np. same B2, nagle 02: zgubione „B”). |
| Walidacja materiału | Materiał musi być kodem danego modelu z listy SKU (419: 92, 05, 02, 94, BK, B2, PO), zapisanym jak na zawieszce: `B2`/`b2` (sprana czerń), `B`/`BLACK` (czerń = BK), `2` = 02, `P` = PO. Pomyłki OCR poprawiane tylko jednoznacznie (`BZ` → B2). Śmieci (`B0`, `B2A`) = czytaj dalej, bez pytania. Czyste cyfry spoza listy (`14`) albo nieznane litery = pytanie „poza sklepem”. Zgubione „2” z „B2” daje `B` = BK: łapie to pytanie o nowy materiał w sesji. |
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

**Wyślij** → **Kopiuj wszystko** (albo **Pobierz plik**, **Udostępnij…**). Wklej plik w sesji czatu z podłączonym Shopify. Jeden plik zawiera SKU ze sklepu i odczyty „poza sklepem”. Nazwa pliku zaczyna się od trybu: `spis-…`, `przyjecie-…`, `wydanie-…`.

```
sku,ilosc,status,odczyt
101-30-94-32,2,sklep,
101-14-110-32,1,poza_sklepem,"® | VEGAS | Materiat 14 | Model 101 | bw.pasa | 110:/ 43' | Dt.nogaw | 32”"
```

| Kolumna / wartość | Wpis do Shopify (lokalizacja „Vegas Jeans - Szybka 6/10”) |
|---|---|
| nagłówek `sku,ilosc` | ustaw stan „dostępne” na podaną liczbę (`inventorySetQuantities`) |
| nagłówek `sku,zmiana` | zmień stan o podaną wartość, `+` dodaje, `-` odejmuje (`inventoryAdjustQuantities`). Przed wpisem sprawdź, czy wydanie nie zejdzie poniżej zera. |
| status `sklep` | wpisz (kolumna `odczyt` ma ostatni tekst z OCR, tylko do diagnostyki) |
| status `poza_sklepem` | **nie wpisuj**. Kolumna `odczyt` ma tekst z OCR do wyjaśnienia: stary kod, materiał spoza sklepu albo zły odczyt. |

Stan sesji jest w pamięci przeglądarki (localStorage): zamknięcie Safari nic nie kasuje. Sesji może być wiele, przełącza się je w **Lista**.

## Jak to działa (technicznie)

| Element | Rozwiązanie |
|---|---|
| OCR | [tesseract.js 6](https://github.com/naptha/tesseract.js) (Tesseract 5 LSTM, WASM SIMD) w Web Workerze, model `eng` z tessdata_fast. Pliki w `vendor/` (działa offline). |
| Obraz | Wycinek ramki z tylnej kamery (1920×1080), skala szarości, przycięcie do białej naklejki, progowanie Sauvola w Tesseracie, PSM 6. Naklejkę szukają dwie metody (`preprocess.js`): najjaśniejszy prostokąt (działa też na jasnych dżinsach z latarką) i stały próg (lepszy na ciemnym tle). Po niepełnym odczycie następna klatka próbuje drugiej metody. |
| Parser | `parser.js`: model ze sklepu ∈ {101, 417, 419}, materiał (mapa `mapping.json`), pas 80–116 parzysty + zgodność z calami, nogawka ∈ {30, 32, 34}. Toleruje typowe błędy OCR (`4l7`, `941 37"`, `410` zamiast `110`, brak ukośnika). Wyraźnie przeczytany inny model (np. `414`) nie jest „poprawiany” do najbliższego, tylko idzie do „poza sklepem”. |
| Nogawka | `lengthpass.js`: gdy brakuje tylko nogawki, drugie przejście OCR na pasku pod „Dł.nogaw.”, powiększonym ×2/×3, tryb jednej linii, tylko cyfry i `"`. Ok. 60 ms, tylko w razie potrzeby. |
| Lista SKU | `skus.json` (1482 SKU z Shopify, 26 materiałów × 19 pasów × 3 nogawki). |
| Stan | `store.js`, localStorage. Sesja ma tryb (spis, przyjęcie, wydanie) i log zmian. Eksport dokłada nagłówek i znak. |
| PWA | `manifest.webmanifest` + `sw.js` (cache wszystkich plików). |

### Pomiary (bez telefonu)

| Test | Wynik |
|---|---|
| Parser (testy jednostkowe) | 19/19 |
| Sesje i eksport w 3 trybach, cel przycisku „+1”, odczyt w CSV (testy jednostkowe) | wszystkie OK |
| Walidacja materiału (testy parsera: BZ, b2, 8Z, B0, B2A, B, Black, ©2, 2, 82, P) | 35/35 |
| Sesja z samymi B2, potem zawieszka 419-02 (`tools/e2e/new_material.mjs`) | pytanie „Nowy model/materiał”, bez stuknięcia nic nie dolicza |
| „+1” po „Dodaj poza sklepem” (`tools/e2e/bug_again.mjs`) | dolicza 414 poza sklepem; kod ze sklepu bez zmian (do 0.5.1 doliczał poprzedni kod ze sklepu) |
| Zdjęcie z zawieszkami (2 naklejki) | 2/2 SKU dobrze |
| 120 sztucznych zawieszek (obrót ±8°, rozmycie, odblask, cień, zagięcie, szum, JPEG) | 67 dobrze, 0 źle, 5 „poza sklepem” (do potwierdzenia stuknięciem), 48 bez odczytu (najbardziej rozmyte/małe, następna klatka) |
| Czas OCR jednej klatki (Node, ten sam WASM) | średnio 185 ms, maks. 400 ms |
| Klatki z nagrania z magazynu (model 414, 33 klatki) | 22 pełne odczyty `414-87-106-32` → pytanie „poza sklepem”, 0 złych (przed poprawką: 0, skaner milczał) |
| Jedna zawieszka trzymana ~10 s, nogawka co 0,3 s nieczytelna (`tools/e2e/make_hold.py`) | 1 szt. (wersja 0.4.0 liczyła 5) |
| Nagranie z magazynu, jasne dżinsy + latarka (82 klatki, 419-B2-106-30) | 43 pełne odczyty, 0 złych, OCR klatki 109 ms (0.5.0: 34, 256 ms; na iPhonie 1,1–1,4 s, bo czytała całą ramkę) |
| To samo nagranie jako film w Chromium, 2 pary po 16 s ruchu ręką | 2 szt. (0.5.0: 4 szt., każda para liczona 2×) |
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
