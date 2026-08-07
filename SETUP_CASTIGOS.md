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
4. En **Reglas** de Firestore, pega esto:

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

- Cada jugador puede **recibir máximo 1 castigo activo** (dura 6 horas)
- Cada jugador puede **enviar máximo 1 castigo** cada 6 horas
- Los castigos son **visibles para todos** con hover sobre el icono
- El hover muestra: icono, nombre del castigo, descripción, quién lo envió y cuánto tiempo queda
