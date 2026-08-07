# Íconos de rol

Poné acá tus 5 imágenes de rol, en formato **.webp**, con estos nombres exactos:

```
assets/roles/top.webp
assets/roles/jungle.webp
assets/roles/mid.webp
assets/roles/adc.webp
assets/roles/support.webp
```

No hace falta tocar código: `app.js` ya arma la ruta `assets/roles/{rol}.webp` solo,
usando el campo `"role"` de cada cuenta en `config/accounts.json` (o de
`data/players.json` si lo editás a mano).

- Tamaño recomendado: cuadrado, 64×64 o 128×128 px (se muestra a 22×22 en la tabla).
- Si un jugador no tiene `role` definido, o el archivo `.webp` todavía no existe,
  se muestra un ícono genérico (⚑) en su lugar — no rompe nada.
