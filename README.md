# AFPAM Bot

Bot de WhatsApp y panel de ventas de **AFPAM Texcoco, Puertas Automáticas**.

- **Bot** (`src/lib/bot/`): atiende a los clientes por WhatsApp, recolecta sus datos, avisa a los vendedores y registra ventas y comisiones.
- **Webhook de WhatsApp**: `/api/whatsapp/webhook` · **Tarea programada**: `/api/cron/bot`
- **Panel**: inicio, tablero de solicitudes, contactos, vendedores y comisiones, configuración del bot.
- **Pruebas del bot**: `npm run prueba:bot`

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1d782cf6-2718-4338-8603-61e3454417fc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
