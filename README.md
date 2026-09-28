# Muhammet Enes Yürekli · Portföy

**Canlı:** https://enesyurekli.vercel.app

Oyun geliştirici portföyüm, Türkçe ve İngilizce. Proje kartlarında ekran görüntüsü yok. Her projenin çekirdek mekaniğini tarayıcı için canvas'ta yeniden yazdım ve kartın içinde çalıştırıyorum. Demolar orijinal Unity build'leri değildir, sayfada da böyle etiketlidir. Örnek veri kullananlar "örnek veri" etiketi taşır. Crystal Clutch kartı ise repodaki gerçek level dosyalarıyla çalışır.

## Demolar

| Kart | Tarayıcıda çalışan |
| --- | --- |
| Giriş | Başlık satırlarının üstünde koşan, klavyeyle oynanabilen mürekkep karakter |
| Crystal Clutch | Oyunun kendi kurallarıyla (LabBoard.cs ve LabBot.cs'ten port) repodaki gerçek level'lar; Ortalama bot oynar, ziyaretçi devralabilir. Yanında Level Lab, level'ı bir worker'da 200 kez oynatıp kazanma eğrisini tasarım hedefiyle karşılaştırır |
| Fruit Merge | Kavanozda verlet fiziğiyle düşen meyveler; aynı iki meyve bir üst seviyeye birleşir |
| Can Bağı | SOS paketleri ESP32 mesh ağında ağ geçidine atlar, en yakın gönüllü eşleşir |
| Donanım Arşivi | Zamanlanmış GitHub Actions çalışması fırsatları tarar, eşleşenler WhatsApp bildirimi olur |
| Multiplayer | Kavram demosu: snapshot interpolasyonu, sunucu ve istemci görüntüsü yan yana |

## Yapı

Build adımı yok: düz HTML, CSS ve JavaScript.

```
index.html              sayfa ve Türkçe metin
assets/css/site.css
assets/js/i18n.js       İngilizce metin ve canvas metinleri
assets/js/ink.js        bütün canvas'ların ortak el çizimi araçları
assets/js/demo.js       demo host: canvas boyutu, ekranda değilken döngüyü durdurur
assets/js/main.js       dil, navigasyon, demo bağlantıları
assets/js/demos/        runner, crystal, merge, mesh, pipeline, netcode
                        crystal-rules.js: Crystal Clutch kuralları ve botu (sayfa, worker ve Node'da çalışır)
                        crystal-lab.js: Level Lab worker'ı
```

## Lokal çalıştırma

```
python -m http.server 8000
```

Sonra http://localhost:8000 adresini aç. `?lang=en` İngilizce açar.

## Yayın

Vercel'de statik site olarak yayında. Header ve cache ayarları `vercel.json` dosyasında, yüklenecek dosya listesi `.vercelignore` dosyasında.
