# Dungeons & Kings Charles

Compañero PWA en español para una campaña de fantasía 5e. Una cuenta puede dirigir una campaña y jugar en otras. Los asientos representan personajes persistentes. Cerrar el navegador conserva la ficha y el lugar en la mesa.

## Fase 1 · Modelo y persistencia

El esquema ejecutable está en `backend/mesa/models.py`. Las migraciones están incluidas.

| Entidad | Estado persistido y relaciones |
| --- | --- |
| User de Django | Identidad y contraseña con hash. La relación con cada sala determina el rol. |
| Room | DM, campaña, código único, revisión, orden de iniciativa, personaje activo y ronda. |
| Character | Dueño, sala y asiento opcionales, identidad, clase, nivel, seis características, PG, PG temporales, salvaciones, CA, iniciativa, Dados de Golpe, concentración, estados y monedas. |
| Action | Pertenece a una ficha. Tipo de acción, competencia con el arma, característica y dados de daño. |
| Spell / Slot | Cada ficha tiene su grimorio y sus reservas por nivel. Los trucos tienen nivel cero. El lanzamiento puede gastar un espacio de nivel superior. |
| Resource | Usos restantes y máximos, tipo de recuperación y opción de dado de Inspiración de Bardo. |
| Consumable | Cantidad, fórmula de efecto opcional y opción de aplicar la tirada como curación. |
| Event | Historial con hora y sala. El panel recupera las 60 entradas más recientes. |

El ingreso bloquea la sala con `select_for_update()`. Dos restricciones únicas impiden compartir un asiento y vincular dos fichas del mismo jugador a la misma sala. Otra restricción exige un asiento del 1 al 10 para cada ficha vinculada. El DM queda fuera de ese cupo.

## Fase 2 · API y reglas

Prefijo `/api/`. Enviar JSON y `Authorization: Bearer <access>` en las rutas autenticadas.

| Método y ruta | Entrada o resultado |
| --- | --- |
| POST register/ | username y password de al menos 8 caracteres |
| POST token/ y token/refresh/ | Obtener el par JWT o renovar access con refresh |
| GET lobby/ | Usuario, campañas accesibles y fichas libres |
| POST rooms/ | name. Devuelve id y code |
| POST characters/ | name, race, profession, max_hp y estadísticas opcionales |
| POST join/ | code y character, el identificador de una ficha propia libre |
| GET rooms/{sala}/?since={revision} | Instantánea de la mesa o 304 sin cuerpo. La marca presence=1 comunica actividad de la pestaña del jugador. |
| PATCH rooms/{sala}/characters/{ficha}/ | Comando táctico y versión de la ficha |
| PATCH rooms/{sala}/turn/ | start, next o end y versión de la sala. Exclusivo del DM |
| GET health/ | Disponibilidad del proceso HTTP |

Ejemplo de daño recibido para una ficha en versión 7:

```json
{"op":"hp","value":-5,"version":7}
```

Ejemplo para crear una poción a través del mismo endpoint:

```json
{"op":"setup","version":8,"pool":"items","data":{"name":"Poción de curación","quantity":3,"effect":"2d4+2","heals":true}}
```

| Operación | Parámetros además de version |
| --- | --- |
| hp / temp | value es un delta para PG o el total nuevo para temporales |
| death / conditions | death recibe text successes o failures y value entre 0 y 3. conditions recibe texto libre |
| profile | data con la ficha base, como en la creación |
| setup | pool entre actions, spells, slots, resources o items. data define el registro. id opcional para editarlo |
| attack / damage / standard | id del ataque, o text con el nombre de acción estándar. attack acepta mode |
| roll | text con fórmula como 1d20+3 o 2d4+2. mode normal, ventaja o desventaja, estas dos últimas para un d20 |
| slots / resources / items | id y delta value |
| cast / release | cast recibe id del conjuro y value con el nivel del espacio. replace confirma cambio de concentración. release la finaliza |
| consume / coin | id del objeto, o text con la moneda y value con el delta |
| rest | text short y value con los dados a gastar, o text long |

Las tiradas se resuelven en el servidor. Aplicar una poción modifica la cantidad, los PG y el historial en la misma transacción. Un comando con versión obsoleta recibe 409. El cliente recarga la ficha antes de volver a operar. Un fallo de red tras confirmar un comando se resuelve consultando el estado, sin repetir automáticamente la tirada.

**Convenciones de mesa.** El descanso prolongado sigue la consigna y devuelve la mitad de los Dados de Golpe **gastados**, redondeada hacia arriba. Con 4 dados totales y 3 gastados se recuperan 2. El manual de 2014 usa como referencia la mitad del total. El descanso breve suma el modificador de Constitución a cada dado de curación, con mínimo cero. Los máximos de espacios y recursos se configuran en la ficha para admitir variantes de mesa. La característica de lanzamiento se deduce de la clase y admite selección explícita. El MVP gestiona una clase y un tipo de Dado de Golpe por ficha. Las salvaciones contra muerte son un registro manual para la mesa.

## Fase 3 · PWA y pantallas

| Archivo | Responsabilidad |
| --- | --- |
| frontend/src/main.tsx | Registro, sesión, selección de campaña, creación y vinculación de ficha |
| frontend/src/Table.tsx | Suscripción por polling, actualización optimista de contadores, reconciliación, panel del DM, iniciativa e historial |
| frontend/src/Sheet.tsx | Cabecera de supervivencia, descansos y pestañas de acciones, conjuros, recursos y consumibles |
| frontend/src/forms.tsx | Formularios para características, ataques, conjuros, espacios, recursos y objetos |
| frontend/src/api.ts | Transporte autenticado y renovación compartida del token |
| frontend/src/types.ts | Contratos TypeScript y modificadores |
| frontend/src/style.css | Tailwind y estilos adaptables |
| frontend/vite.config.ts | Proxy local, manifest y service worker generados en producción |

La pestaña visible consulta cambios cada 2,2 segundos después de cada respuesta. El jugador comunica presencia aproximadamente cada 30 segundos. El panel identifica como reciente una señal de los últimos 65 segundos. La PWA precarga el frontend y requiere conexión para abrir campañas y guardar jugadas. El navegador conserva la sesión JWT en sessionStorage durante la pestaña. Después de cerrarla, el usuario vuelve a entrar con sus credenciales.

## Ejecutar localmente

Requiere Python 3.12 y Node 22 o superior. Desde la carpeta del proyecto:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DKC_DEV=1
# Para probar los bloqueos y las mismas restricciones que en producción:
export DATABASE_URL='postgresql://usuario:clave@localhost:5432/dkc'
python manage.py migrate
python manage.py runserver
```

En PowerShell, activá el entorno con `.\.venv\Scripts\Activate.ps1` y usá `$env:DKC_DEV="1"` y `$env:DATABASE_URL="..."`. Para una prueba individual rápida, al omitir DATABASE_URL en desarrollo se utiliza SQLite. La prueba de concurrencia requiere PostgreSQL.

En otra terminal, desde la raíz:

```bash
cd frontend
npm ci
npm run dev
```

Abrí http://localhost:5173. Para probar los dos roles, usá dos sesiones de navegador. Creá la campaña como DM, copiá el código y registrá al jugador en la segunda sesión. En **Unirme a una sala → Crear personaje**, guardá la ficha, elegila e ingresá el código. Agregá ataques, conjuros, espacios, recursos y consumibles desde cada pestaña. Para retomar una campaña, elegí **Continuar campaña**.

## Desplegar en Render con Neon

1. Creá una base PostgreSQL en Neon. Copiá la cadena de conexión con SSL habilitado.
2. Subí el contenido de esta carpeta a tu repositorio, con render.yaml en la raíz. En Render, creá un Blueprint a partir de ese repositorio.
3. Completá los valores solicitados. Usá los dominios asignados a tus servicios. Si los nombres reciben un sufijo, usá la dirección final que aparece en cada panel.

| Servicio | Variable | Valor |
| --- | --- | --- |
| API | DATABASE_URL | Cadena PostgreSQL de Neon con sslmode=require |
| API | SECRET_KEY | Generada por Render |
| API | FRONTEND_ORIGIN | Origen HTTPS exacto del Static Site, sin barra final |
| Static Site | VITE_API_URL | URL HTTPS del Web Service terminada en /api |

4. El servicio aplica migraciones antes de iniciar Gunicorn. El sitio estático compila React y publica dist. Después de cambiar VITE_API_URL, volvé a compilar el frontend.
5. Abrí /api/health/ en la URL de la API, luego el sitio estático. Comprobá el ingreso de las dos cuentas. En un navegador móvil compatible, usá la opción de instalar o agregar a la pantalla de inicio.

Referencias de despliegue: https://render.com/docs/blueprint-spec y https://neon.com/docs/connect/connect-from-any-app

## Verificación reproducible

En backend, con el entorno de desarrollo activo: `python manage.py test mesa`. PostgreSQL requiere que el usuario de pruebas pueda crear una base temporal. Usá una base de desarrollo. En frontend: `npm ci && npm run build`. El build incluye el chequeo estricto de TypeScript y la generación del service worker.

Los casos de prueba cubren PG temporales, repetición de comandos obsoletos, salvaciones, pociones, descansos, recursos, espacios y concentración, permisos, iniciativa, polling y concurrencia por el último asiento.
