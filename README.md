# sdvg.io

Минималистичный трекер задач: эпики, спринты, проекты. Single-page React + Vite, хранение в localStorage, PWA с офлайн-режимом.

## Запуск локально

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production-сборка в dist/
npm run preview      # локальный preview production-сборки
npm run pwa-assets   # пере-генерация PWA-иконок из public/logo.svg
```

## PWA

После `npm run build` приложение можно установить из браузера (Chrome/Edge → иконка install в адресной строке; iOS Safari → "Поделиться" → "На экран Домой"). Service worker precache'ит весь bundle, работает офлайн.

## Деплой на Railway

1. Подключи репозиторий в [railway.app](https://railway.app)
2. Railway автоматически найдёт `Dockerfile` и `railway.toml`
3. После первого деплоя — добавь custom domain (для PWA и iOS install нужен HTTPS)

Контейнер слушает `$PORT` (Railway проставит), healthcheck на `/`.

## Локальный Docker

```bash
docker build -t sdvg .
docker run --rm -p 3000:3000 sdvg
```
