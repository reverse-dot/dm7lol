# Ranking SoloQ Challenge

Web estática (HTML/CSS/JS puro, sin frameworks) para un torneo de LP entre amigos, pensada para GitHub Pages. Replica el diseño: podio top 3, tabla completa con filtros, búsqueda, ordenamiento por columna, racha (sparkline), countdown del torneo, etc.

## Cómo está armado (y por qué)

GitHub Pages solo sirve archivos estáticos: no puede correr un backend ni guardar una API key en secreto. Y la Riot API no se puede llamar directo desde el navegador (no manda headers CORS, y jamás hay que exponer tu key en código público). Por eso el proyecto se divide en dos partes:

1. **La web (`index.html`, `style.css`, `app.js`)** — solo lee `data/players.json` y pinta todo. No sabe nada de Riot ni de tu API key.
2. **El actualizador (`scripts/update-data.js`)** — un script de Node que sí llama a la Riot API con tu key, y regenera `data/players.json`. Corre fuera del navegador: en tu compu, o automáticamente con GitHub Actions.

Así el sitio publicado nunca expone tu API key, y vos controlás cuándo se actualiza.

## Estructura

```
lol-ranking/
├── index.html                     # la página
├── style.css
├── app.js                         # lee data/players.json y renderiza todo
├── data/
│   └── players.json               # lo que se ve en la web (se regenera solo)
├── config/
│   └── accounts.json              # ACÁ agregás/sacás a tus amigos
├── scripts/
│   └── update-data.js             # llama a la Riot API
└── .github/workflows/
    └── update-ranking.yml         # automatiza el update cada 24h
```

## 1. Agregar o sacar jugadores

Editá `config/accounts.json`. Por cada persona agregás un bloque con su Riot ID (lo que está antes del `#`) y su tagline (lo que está después):

```json
{
  "riotId": "Siler",
  "tagLine": "SOL",
  "region": "americas",
  "platform": "na1",
  "displayTag": "JNOGALES CORTI#SOL",
  "opggUrl": "https://op.gg/summoners/na/Siler-SOL"
}
```

- `region`: agrupa varios servers para las rutas de cuenta/partidas → `americas`, `europe`, `asia`, `sea`.
- `platform`: el server puntual → `na1`, `la1`, `la2`, `br1`, `euw1`, `eun1`, `kr`, `oc1`, etc.
- `tournamentEndsAt` (arriba del todo del archivo) define cuándo termina el countdown — formato ISO, ej `"2026-08-19T07:30:32Z"`.

No hace falta tocar nada más: la próxima vez que corras el updater, esa cuenta ya aparece en el ranking.

## 2. Conseguir tu Riot API key

1. Entrá a https://developer.riotgames.com/ y logueate con tu cuenta de Riot.
2. Copiá la **Development API Key** que te dan en el dashboard (empieza con `RGAPI-`).
3. Esta key **expira cada 24 horas** — es una limitación de Riot, no del script. Para no tener que regenerarla todos los días, más abajo te explico cómo pedir una **Production Key** (gratis, pero piden un formulario de aprobación).

## 3. Actualizar el ranking manualmente

Necesitás [Node.js 18+](https://nodejs.org/) instalado.

```bash
cd lol-ranking
export RIOT_API_KEY="RGAPI-tu-key-aca"
node scripts/update-data.js
```

Esto pisa `data/players.json` con los datos frescos. Después:

```bash
git add data/players.json
git commit -m "Actualizar ranking"
git push
```

Y GitHub Pages se actualiza solo en 1-2 minutos.

## 4. Automatizarlo cada 24h con GitHub Actions (recomendado)

Ya viene el workflow armado en `.github/workflows/update-ranking.yml`, corre todos los días a las 09:00 UTC solo. Para activarlo:

1. En tu repo de GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre: `RIOT_API_KEY`. Valor: tu key.
3. Listo — desde la pestaña **Actions** también podés ejecutarlo a mano ("Run workflow") cuando quieras un update al toque.

**Importante:** con una Development Key normal, el workflow automático va a fallar cada vez que la key esté vencida (dura 24h). Dos opciones:
- Pisar el secret `RIOT_API_KEY` a mano una vez por día antes de que corra el cron (poco práctico).
- Pedir una **Production API Key** en el mismo dashboard de Riot Developer Portal (botón "Register Product"). Piden que completes info del proyecto — para un ranking personal entre amigos normalmente se aprueba sin problema. Esa key no expira y ahí sí el cron corre 100% solo, para siempre.

## 5. Publicar en GitHub Pages

1. Subí esta carpeta a un repo de GitHub (puede ser público o privado, GitHub Pages funciona con los dos si tenés plan Pro, o público en plan free).
2. **Settings → Pages → Source**: elegí `Deploy from a branch`, rama `main`, carpeta `/ (root)`.
3. En un par de minutos tu ranking va a estar en `https://tu-usuario.github.io/tu-repo/`.

## Sobre la tipografía "Author"

Toda la web usa la fuente `Author` como tipografía principal (definida con
`@font-face` en `style.css`, cae a `Inter` si no está disponible). Los
archivos van en `fonts/Author-*.otf` — mirá `fonts/README.md` para la lista
exacta de nombres y el detalle de qué peso/estilo corresponde a cada uno.

## Sobre la columna "Shells"

Esta columna no viene de la Riot API — Riot no tiene el concepto de "shells", así que la dejé como campo libre para que vos definas qué significa en tu torneo (puntos bonus, logros, lo que quieras). El script `update-data.js` la respeta y no la pisa: solo actualiza LP/W/L/racha desde la API y mantiene lo que hayas cargado a mano en `data/players.json` para ese campo. Si querés, lo podés editar directo en ese archivo:

```json
"shells": [{ "icon": "flame", "count": 7 }]
```

Iconos disponibles para `shells`: `skull`, `flame`, `clock`, `trophy` (se pueden agregar más en `SHELL_ICONS` dentro de `app.js`).

## Sobre el orden del ranking (elo)

El orden (podio, `#`, y la columna Elo) ya no se calcula solo por LP: se calcula por
**tier → división → LP**, en ese orden de prioridad. Así un jugador en Emerald I con
menos LP siempre queda arriba de un Emerald IV con más LP, que es como funciona el
ranking real de League of Legends. Esto se aplica tanto en `app.js` (frontend) como
en `scripts/update-data.js` (al generar `data/players.json`).

El emblema que aparece junto al LP también cambia de color según el tier real de
cada jugador (Hierro, Oro, Esmeralda, Diamante, etc.) — es un ícono propio, no un
asset de Riot Games, pero distinto para cada rango.

## Sobre el ícono de "Rol"

El ícono de rol (Top/Jungla/Mid/ADC/Support) sale de `assets/roles/{rol}.webp`.
Vos ponés ahí tus propias imágenes — mirá `assets/roles/README.md` para el detalle
de nombres de archivo. El rol de cada jugador se define con el campo opcional
`"role"` en `config/accounts.json` (o directo en `data/players.json`). Si no hay
`role` definido o falta el `.webp`, se muestra un ícono genérico sin romper nada.

## Sobre "LIVE" (streaming)

El campo `live` tampoco viene de Riot (esa API no sabe nada de Twitch/Kick). Por ahora es manual: lo editás en `data/players.json`. Si más adelante querés que se detecte solo, se puede sumar una llamada a la API pública de Twitch (`GET streams?user_login=...`) dentro de `update-data.js` — avisame si querés que lo arme.

## ±LP (columna de ganancia/pérdida)

La Riot API no expone cuánto LP ganás o perdés partida por partida, así que el script estima esos números usando un promedio típico de SoloQ (~21 LP por partida) aplicado a tus victorias/derrotas recientes. Es una aproximación visual para que la columna tenga sentido, no un dato exacto — el LP total (la columna "Elo") sí es 100% real, viene directo de `league-v4`.

## Rate limits

Las dev keys de Riot permiten 20 requests/segundo y 100 requests/2 minutos. El script mete un delay de ~900ms entre llamadas para no pasarse, y reintenta solo si Riot responde 429. Con 4-10 jugadores no deberías tener problemas; si sumás muchos amigos (20+), el update tarda más pero sigue funcionando.
