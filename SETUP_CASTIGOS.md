# Setup del sistema de castigos

## 1. Agregar jugadores (contraseñas)

Edita `config/users.js`:

```js
const USERS = [
  { player: "X1no",   password: "xino123"   },
  { player: "zingCL", password: "zing456"   },
  { player: "Focus",  password: "focus789"  },
  // El campo "player" debe coincidir EXACTAMENTE con summonerName en data/players.json
];
```

Cada jugador elige su nombre en el dropdown y pone su contraseña. Sin registro, sin email.

---

## 2. Configurar Firebase (para que los castigos sean visibles para todos)

Sin Firebase, los castigos solo duran mientras el usuario tiene la página abierta. Con Firebase, se guardan y todos ven los mismos castigos en tiempo real.

### Pasos:

1. Ve a https://console.firebase.google.com
2. Crea un nuevo proyecto (gratis)
3. Ve a **Firestore Database** → Crear base de datos → modo producción
4. En **Reglas** de Firestore, pega esto (más abajo en la sección de Admin
   hay una versión actualizada que además protege el botón de reset):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /punishments/{doc} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

5. Ve a **Configuración del proyecto** → agrega una app **Web**
6. Copia el objeto `firebaseConfig` y pégalo en `config/firebase.js`:

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "mi-proyecto.firebaseapp.com",
  projectId: "mi-proyecto",
  storageBucket: "mi-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
```

7. Agrega los scripts de Firebase en `index.html` justo antes del cierre `</body>` (antes de `config/firebase.js`):

```html
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-firestore-compat.js"></script>
```

Reemplaza `9.x.x` con la versión actual: https://firebase.google.com/docs/web/setup

---

## 3. Los 8 castigos disponibles

| # | Icono | Nombre | Descripción |
|---|-------|--------|-------------|
| 1 | 🤡 | Clown Mode | Jugar con el campeón más troll del parche |
| 2 | 🔇 | Silencio total | Mutear a todos y jugar sin chat |
| 3 | 🐌 | Slow Motion | Solo ítems de movimiento, sin daño |
| 4 | 🎯 | Mid or Feed | Solo puede ir a mid, aunque no sea su rol |
| 5 | 🙈 | No mires el mapa | Prohibido mirar el minimapa |
| 6 | 🎪 | Support vida | Support con build full AP |
| 7 | 💸 | Gastador | Gastar todo el oro apenas lo tenga |
| 8 | 🦆 | El Pato | Escribir "cuac" en el chat cada vez que muera |

Puedes modificar la lista en `app.js` → array `PUNISHMENTS`.

---

## Reglas del sistema

- Cuando alguien tira un castigo, se abre una **ruleta que gira 10 segundos**
  mostrando los 8 castigos al azar (cada vez más lenta, como una ruleta de
  verdad) y al terminar se queda con **uno totalmente aleatorio**.
- El castigo es **obligatorio**: la persona que lo recibe no tiene que
  confirmarlo ni aceptarlo de ninguna forma. Apenas termina la ruleta, el
  castigo queda aplicado y **el timer de 6 horas arranca en ese mismo
  instante**.
- Mientras el castigo sigue activo (dentro de esas 6h), esa persona **no
  puede recibir otro castigo de nadie más**.
- Cada jugador puede **enviar máximo 1 castigo** cada 6 horas (contado desde
  que lo envía).
- Mientras gira la ruleta, el modal no se puede cerrar — una vez que se
  arranca a sortear, el castigo se aplica sí o sí.
- Los castigos son **visibles para todos** con hover sobre el icono.
- El hover muestra: icono, nombre del castigo, descripción, quién lo envió y
  cuánto tiempo queda de las 6 horas.

---

## 4. Panel de Administrador (resetear todos los castigos)

Se agregó un usuario **admin** que puede resetear todos los castigos con un
botón, sin esperar a que se cumplan las 6 horas. A diferencia de los
jugadores (que solo tienen una contraseña chequeada en el JavaScript, algo
fácil de saltarse desde la consola del navegador), el admin usa
**Firebase Authentication real**, así que la contraseña se verifica del lado
del servidor de Google y **las reglas de Firestore pueden exigir esa sesión**
para permitir el borrado. Nadie que no tenga la contraseña del admin puede
ejecutar el reset, ni siquiera abriendo la consola del navegador.

### Pasos para crearlo:

1. En Firebase Console, ve a **Authentication** → pestaña **Sign-in method**
   → habilita el proveedor **Correo electrónico/contraseña**.
2. Ve a la pestaña **Users** → **Add user** → cargá un email (puede ser
   cualquiera, ej. `admin@tuservidor.com`) y una **contraseña muy larga y
   compleja** (Firebase exige mínimo 6 caracteres, pero usa algo tipo
   generador de contraseñas de 20+ caracteres). Guardala en un lugar seguro,
   es la única forma de resetear los castigos.
3. Copiá el **User UID** que Firebase le asignó a ese usuario (aparece en la
   lista de Users, es un string largo tipo `aB3xQ...`).
4. Ve a **Firestore Database** → **Reglas** y reemplaza las reglas por estas
   (cambiá `PEGA_AQUI_EL_UID_DEL_ADMIN` por el UID que copiaste):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /punishments/{doc} {
      allow read: if true;
      allow create, update: if true;
      allow delete: if request.auth != null
                    && request.auth.uid == "PEGA_AQUI_EL_UID_DEL_ADMIN";
    }
  }
}
```

5. Listo. En la web, hacé click en **Iniciar sesión** → **Acceso admin →** y
   entrá con el email y contraseña que creaste en el paso 2. Vas a ver un
   botón rojo **"🗑️ Resetear castigos"** en la navbar que borra todos los
   castigos (pendientes y activos) de todos los jugadores.

### Nota sobre seguridad

Los jugadores normales **no** usan Firebase Authentication (siguen con el
login simple por contraseña de `config/users.js`), así que técnicamente
alguien muy insistente podría escribir castigos directamente desde la
consola del navegador sin pasar por el login. Eso queda fuera del alcance de
este proyecto (es un juego entre amigos, no un sistema con datos sensibles),
pero el **reset del admin sí queda completamente protegido**, que era lo
pedido: solo quien tenga la contraseña de admin puede borrar todo.
