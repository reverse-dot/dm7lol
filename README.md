# Fuente "Author"

Poné acá tus 12 archivos `.otf` de la fuente Author, con estos nombres EXACTOS
(son los mismos que ya tenés, tal cual):

```
fonts/Author-Extralight.otf
fonts/Author-ExtralightItalic.otf
fonts/Author-Light.otf
fonts/Author-LightItalic.otf
fonts/Author-Regular.otf
fonts/Author-Italic.otf
fonts/Author-Medium.otf
fonts/Author-MediumItalic.otf
fonts/Author-Semibold.otf
fonts/Author-SemiboldItalic.otf
fonts/Author-Bold.otf
fonts/Author-BoldItalic.otf
```

No hace falta tocar nada más: `style.css` ya tiene los 12 `@font-face` que
apuntan a `fonts/Author-*.otf` y ya está seteada como fuente principal de
toda la página (`html, body { font-family: 'Author', ... }`).

## ¿Por qué .otf y no .ttf?

Metí los `@font-face` apuntando a los `.otf` porque son los que mostraste en
la captura. Si preferís usar los `.ttf` en vez de los `.otf`, es la misma
idea: cambiá la extensión en cada `url(...)` de `style.css` (de `.otf` a
`.ttf`) y el `format("opentype")` por `format("truetype")`. No podés usar
los dos a la vez para el mismo peso/estilo sin declarar dos `@font-face`
(uno por formato); con uno solo alcanza.

## Pesos y variantes

Cada archivo se mapea a un `font-weight` / `font-style` para que el resto del
CSS (que usa `font-weight: 700`, `900`, etc.) elija automáticamente la
variante correcta:

| Archivo                          | weight | style   |
|-----------------------------------|--------|---------|
| Author-Extralight.otf              | 200    | normal  |
| Author-ExtralightItalic.otf        | 200    | italic  |
| Author-Light.otf                   | 300    | normal  |
| Author-LightItalic.otf             | 300    | italic  |
| Author-Regular.otf                 | 400    | normal  |
| Author-Italic.otf                  | 400    | italic  |
| Author-Medium.otf                  | 500    | normal  |
| Author-MediumItalic.otf            | 500    | italic  |
| Author-Semibold.otf                | 600    | normal  |
| Author-SemiboldItalic.otf          | 600    | italic  |
| Author-Bold.otf                    | 700    | normal  |
| Author-BoldItalic.otf              | 700    | italic  |

La fuente no tiene un peso "900" (el título `<h1>Ranking</h1>` pide 900):
el navegador va a usar el Bold (700) más cercano como reemplazo automático,
así que no rompe nada, solo se ve un poquito menos grueso que antes.

## Si la fuente no carga

Mientras no subas los `.otf`, o si algún nombre de archivo no coincide, el
navegador cae solo al fallback (`Inter` → system-ui) — la web sigue
funcionando igual, solo que con esa tipografía en vez de Author.
