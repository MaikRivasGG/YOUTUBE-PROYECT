# Framehouse — gestor de produccion para canales de YouTube faceless

Panel de trabajo para equipos que producen video faceless en cadena: un pipeline
tipo Trello pero con las etapas reales del oficio (idea → guion → grabacion →
edicion → miniatura → revision → programado → publicado), roles por linea de
trabajo y sincronizacion en vivo entre todos los miembros.

Construido con **Next.js 16 (App Router) + TypeScript + Tailwind 4** sobre
**Supabase** (Postgres, Auth, RLS y Realtime), listo para desplegar en
**Vercel**.

---

## Indice

1. [Que incluye](#que-incluye)
2. [Arquitectura](#arquitectura)
3. [Puesta en marcha](#puesta-en-marcha)
4. [Despliegue en Vercel](#despliegue-en-vercel)
5. [Modelo de datos](#modelo-de-datos)
6. [Roles y permisos](#roles-y-permisos)
7. [Tiempo real](#tiempo-real)
8. [Scripts](#scripts)
9. [Decisiones tecnicas](#decisiones-tecnicas)

---

## Que incluye

| Pantalla                        | Ruta                                | Que resuelve                                                                                                 |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Login / registro / recuperacion | `/login`, `/registro`, `/recuperar` | Acceso con email y contrasena sobre Supabase Auth                                                            |
| Onboarding                      | `/bienvenida`                       | Crear equipo o cargar un equipo de demostracion con datos reales                                             |
| Pipeline de produccion          | `/produccion`                       | Tablero kanban con drag & drop, filtros, carga del equipo, vencimientos, mini calendario y actividad en vivo |
| Resumen                         | `/resumen`                          | Dashboard personal: mis tarjetas, KPIs del mes, carga por etapa                                              |
| Calendario editorial            | `/calendario`                       | Mes completo con lo que se publica cada dia                                                                  |
| Videos                          | `/videos`                           | Vista tabla con busqueda, filtros y orden                                                                    |
| Ficha de video                  | `/videos/[id]`                      | Guion, hook, brief, checklist, archivos, asignados y comentarios en vivo                                     |
| Equipo                          | `/equipo`                           | Miembros, cambio de rol, invitaciones por enlace                                                             |
| Canales                         | `/canales`                          | Alta y edicion de canales, color, nicho y ritmo objetivo                                                     |
| Analiticas                      | `/analiticas`                       | Publicaciones por mes, tiempo de ciclo, entregas a tiempo y carga por persona                                |
| Ajustes                         | `/ajustes`                          | Perfil, nombre del equipo y mapa de responsables por etapa                                                   |

Extras: buscador global con `Ctrl/Cmd + K`, invitaciones con enlace y token,
estado de conexion en vivo, menu responsive y soporte de teclado en el tablero.

---

## Arquitectura

```
src/
  app/
    (auth)/            Login, registro, recuperacion, invitacion  (layout partido)
    (app)/             Aplicacion con sidebar + topbar (requiere sesion y equipo)
    auth/callback/     Intercambio de code -> sesion (email, reset, OAuth)
    bienvenida/        Onboarding sin sidebar
  components/
    ui/                Primitivas propias (boton, campo, dialogo, menu, avatar...)
    layout/            Sidebar, cabecera de pagina, buscador global
    board/             Tablero: columnas, tarjetas, filtros, drag & drop
    dashboard/         Tarjetas de metricas, vencimientos, calendario, actividad
    video/ team/ channels/ calendar/
    providers/         Contexto de workspace (rol, canales, miembros)
  lib/
    domain/            Reglas de negocio puras: pipeline, roles, validadores zod
    supabase/          Clientes de navegador, servidor y refresco de sesion
    api/               Mutaciones del tablero desde el navegador
    board-state.ts     Estado del tablero (agrupar, filtrar, mover, realtime)
    analytics.ts       Metricas derivadas
  server/
    queries.ts         Lecturas en servidor (SSR)
    actions/           Server actions con validacion zod
  proxy.ts             Refresco de sesion y proteccion de rutas
supabase/migrations/   Esquema, funciones, RLS, realtime y datos demo
```

Principio general: **la interfaz nunca es la frontera de seguridad**. Cada regla
vive en Postgres (RLS + funciones `security definer`) y el cliente solo replica
la matriz de permisos para decidir que pinta.

---

## Puesta en marcha

### 1. Requisitos

- Node.js 20 o superior (probado en 22)
- Una cuenta de [Supabase](https://supabase.com)

### 2. Instalar

```bash
npm install
cp .env.example .env.local
```

### 3. Crear el proyecto de Supabase

1. Crea un proyecto nuevo en <https://supabase.com/dashboard>.
2. Copia `Project URL` y `anon public key` desde **Project Settings → API**.
3. Pegalos en `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL="https://xxxxxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOi..."
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

### 4. Aplicar las migraciones

Opcion A — **SQL Editor** (rapido): abre el editor SQL del proyecto y ejecuta,
**en este orden**, el contenido de:

1. `supabase/migrations/20250101000000_init_schema.sql`
2. `supabase/migrations/20250101000100_functions.sql`
3. `supabase/migrations/20250101000200_rls.sql`
4. `supabase/migrations/20250101000300_realtime.sql`
5. `supabase/migrations/20250101000400_demo_seed.sql`

Opcion B — **Supabase CLI**:

```bash
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

### 5. Configurar Auth

En **Authentication → URL Configuration**:

- `Site URL`: `http://localhost:3000` (y el dominio de produccion cuando exista)
- `Redirect URLs`: anade `http://localhost:3000/auth/callback`

Si quieres probar sin confirmar el correo, desactiva _Confirm email_ en
**Authentication → Providers → Email** mientras desarrollas.

### 6. Arrancar

```bash
npm run dev
```

Entra en <http://localhost:3000>, crea una cuenta y pulsa **Probar con datos de
ejemplo** para generar 4 canales y 10 videos repartidos por el pipeline.

---

## Despliegue en Vercel

1. Sube el repositorio a GitHub e importalo en Vercel (framework detectado:
   Next.js, sin configuracion extra).
2. Variables de entorno del proyecto:

   | Variable                        | Valor                           |
   | ------------------------------- | ------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto Supabase       |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave `anon`                    |
   | `NEXT_PUBLIC_SITE_URL`          | `https://tu-dominio.vercel.app` |

3. En Supabase, anade `https://tu-dominio.vercel.app/auth/callback` a los
   _Redirect URLs_ y pon el dominio como _Site URL_.

La clave `service_role` **no** se usa en la aplicacion: todo funciona con la
clave publica mas RLS. No la subas a Vercel salvo que anadas scripts de
administracion propios.

---

## Modelo de datos

```
profiles ──< workspace_members >── workspaces ──< channels
                                        │            │
                                        └──< videos >─┘
                                              ├──< video_assignees >── profiles
                                              ├──< checklist_items
                                              ├──< comments
                                              └──< assets
                                     activity (feed del equipo)
                                     invitations (alta por enlace)
```

Detalles que conviene conocer:

- **`videos.ref`** se genera solo (`VID-0001`) con un contador por equipo.
- **`videos.position`** es `double precision` con huecos de 1000: reordenar una
  tarjeta es **un solo UPDATE**, no reescribir la columna entera.
- **`published_at`** se sella automaticamente al entrar en la etapa `published`.
- **`activity`** se escribe desde triggers, nunca desde el cliente.

---

## Roles y permisos

| Rol         | Puede                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| `owner`     | Todo, incluido eliminar el equipo                                           |
| `admin`     | Todo salvo eliminar el equipo                                               |
| `producer`  | Crear y borrar videos, asignar y mover cualquier tarjeta, gestionar canales |
| `writer`    | Crear videos y mover su etapa (guion)                                       |
| `voice`     | Mover su etapa (grabacion / voz en off)                                     |
| `editor`    | Mover su etapa (edicion)                                                    |
| `designer`  | Mover su etapa (miniatura)                                                  |
| `publisher` | Mover programado y publicado                                                |
| `viewer`    | Solo lectura, sin comentarios                                               |

Regla de movimiento (identica en cliente y en base de datos): puedes mover una
tarjeta si eres productor o superior, **o** si estas asignado a ella, **o** si
tu rol es responsable de la etapa de origen o de la de destino.

La matriz vive dos veces a proposito:

- `public.has_permission()` y `public.can_move_video()` en Postgres — autoridad.
- `src/lib/domain/roles.ts` en el cliente — solo para la interfaz.

El trigger `videos_guard_stage_change` bloquea cualquier cambio de etapa no
autorizado, venga de un UPDATE directo o del RPC `move_video`.

---

## Tiempo real

- El tablero se suscribe a `videos`, `video_assignees` y `checklist_items` del
  equipo; la ficha de video a sus `comments`; el feed a `activity`.
- Las tablas llevan `REPLICA IDENTITY FULL`, asi que un UPDATE llega con la fila
  completa y el cliente reconcilia sin volver a consultar.
- Los eventos que llegan desordenados se descartan comparando `updated_at`
  (`applyRealtimeEvent` en `src/lib/board-state.ts`).
- Las acciones del tablero son **optimistas**: la tarjeta se mueve al instante y
  se revierte con aviso si el servidor la rechaza.
- RLS tambien se aplica a Realtime: nadie recibe filas de equipos ajenos.

---

## Scripts

```bash
npm run dev           # desarrollo
npm run build         # build de produccion
npm run lint          # ESLint (incluye reglas del compilador de React)
npm run typecheck     # TypeScript en modo estricto
npm run test          # tests unitarios (vitest)
npm run format        # Prettier con orden de clases de Tailwind
npm run verify        # lint + typecheck + test
```

Los tests cubren la logica pura: calculo de posiciones al reordenar, matriz de
permisos, reconciliacion de eventos realtime, filtros del tablero y metricas.

### Pruebas de base de datos

Las politicas RLS y las reglas del pipeline tambien se prueban de verdad, contra
un Postgres local efimero (requiere `initdb`, `pg_ctl` y `psql` en el PATH):

```bash
npm run db:test
```

El script crea un cluster temporal, aplica `supabase/tests/00_supabase_shim.sql`
(la parte de Supabase que no esta en las migraciones: esquema `auth`, `auth.uid()`
y los roles `anon` / `authenticated`), ejecuta las cinco migraciones y recorre 27
escenarios: quien ve que, quien puede mover cada etapa, invitaciones, intentos de
auto-promocion, borrados en cascada y enlaces no permitidos. Los `ERROR` marcados como _debe fallar_ son
el resultado esperado.

---

## Notas de seguridad

- **La interfaz no decide nada.** Cada regla esta en Postgres: RLS en las once
  tablas, `has_permission()` para los permisos generales y
  `videos_guard_stage_change` para los saltos de etapa. El cliente solo replica
  la matriz para pintar botones.
- **Solo se usa la clave `anon`.** La `service_role` no aparece en la
  aplicacion, asi que un despliegue comprometido no da acceso total a los datos.
- **Enlaces.** Los campos de URL que acaban en un `<a href>` o un `<img src>`
  solo aceptan `http(s)`, validado en el cliente y con un `CHECK` en la base de
  datos, para que nadie del equipo pueda guardar un `javascript:`.
- **Busqueda.** El termino se limpia antes de entrar en un filtro de PostgREST
  para que no pueda reescribir la condicion.
- **Redirecciones.** El parametro `next` del login y del callback de Supabase
  solo admite rutas internas.
- **Invitaciones.** Token de 192 bits, un solo uso, con caducidad y comprobacion
  de que el email coincide con la cuenta que la acepta.

Queda fuera y conviene anadir antes de abrir el producto al publico: cabecera
`Content-Security-Policy` con nonce, limite de intentos propio por encima del de
Supabase Auth y registro de auditoria exportable.

## Decisiones tecnicas

- **Mutaciones del tablero desde el navegador, no por server action.** Arrastrar
  una tarjeta debe sentirse instantaneo; el cambio se aplica en local, viaja
  directo a Postgres y vuelve al resto del equipo por Realtime. Las pantallas de
  configuracion (equipo, canales, perfil) si usan server actions porque necesitan
  revalidar el render del servidor.
- **Posiciones fraccionarias** en lugar de indices enteros: evita escrituras en
  cascada y conflictos cuando dos personas reordenan a la vez.
- **Componentes de interfaz propios** en vez de una libreria: el prototipo tenia
  un lenguaje visual concreto (lateral oscuro, lienzo claro, acento naranja) y
  replicarlo con tokens propios sale mas ligero que sobrescribir un tema ajeno.
- **Tipos de base de datos escritos a mano** en `src/types/database.ts`, con la
  ruta para regenerarlos con `supabase gen types` cuando el esquema crezca.
