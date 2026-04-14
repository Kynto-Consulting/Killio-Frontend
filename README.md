# Killio Frontend

Killio es una plataforma de ejecucion de trabajo para equipos que necesitan pasar de la idea a la accion sin perder contexto.
Este frontend es la cara visible del producto: una experiencia unificada para boards, documentos, automatizaciones, integraciones y colaboracion en tiempo real.

## Que es Killio

Killio reemplaza la combinacion fragil de notas sueltas, chats dispersos, hojas de calculo, tableros separados y documentos aislados.
En un solo lugar permite:
- planear trabajo
- ejecutar tareas
- documentar decisiones
- automatizar flujos
- conectar herramientas externas
- ver actividad y progreso en vivo

## Para quien es

Killio esta pensado para equipos que necesitan claridad operativa y velocidad de ejecucion:
- equipos de producto y operaciones
- agencias y equipos de delivery
- startups que trabajan con mucha coordinacion
- equipos tecnicos que documentan y automatizan su trabajo
- grupos que necesitan trazabilidad entre decisiones, tareas y documentos

## Lo que resuelve

### 1. Boards que realmente mueven trabajo
Los boards de Killio no son solo columnas bonitas. Sirven para convertir prioridades en avance real.

Con Killio puedes:
- crear boards por equipo o iniciativa
- organizar listas y cards por etapa
- asignar responsables
- etiquetar y priorizar trabajo
- comentar avances sin salir del flujo
- ver timers y actividad reciente
- compartir boards con el nivel de visibilidad adecuado

### 2. Documentos que no se rompen cuando el trabajo crece
Killio usa documents por bricks para que la documentacion sea modular, editable y utilizable en serio.

Eso significa poder:
- escribir con bloques estructurados
- insertar tablas, graficos, accordions, columnas y media
- reordenar contenido con facilidad
- colaborar en tiempo real
- comentar y mantener historiales
- exportar contenido cuando hace falta compartirlo fuera del producto

### 3. Automatizaciones que reducen trabajo repetitivo
Killio incluye scripts y workflows visuales para que el equipo no tenga que repetir tareas manuales.

Desde el frontend puedes:
- abrir el canvas visual de automatizaciones
- crear y editar scripts
- ejecutar flujos manualmente
- revisar logs y resultados
- usar presets para arrancar mas rapido
- conectar nodos visuales para mover informacion entre sistemas

### 4. Integraciones que conectan el trabajo con el mundo real
Killio no vive aislado. El frontend permite administrar conexiones que hacen que el producto entre en la operacion diaria.

Actualmente se soporta:
- GitHub App
- Slack webhooks
- WhatsApp credentials
- vistas de integraciones dentro del dashboard

### 5. Colaboracion visible
Killio esta pensado para que el contexto no se pierda entre pantallas.

Incluye:
- presencia de usuarios
- chat de equipo
- activity history por scope
- notificaciones
- invitaciones y roles
- rutas publicas para compartir o aceptar acceso

## Experiencia principal del producto

### Boards
Los boards son el centro de ejecucion de Killio. Ahí el equipo ve:
- trabajo en curso
- prioridades
- comentarios
- asignaciones
- cambios recientes
- estado visual del board

### Documents
Los documents funcionan como una capa de conocimiento viva. Ahí el equipo puede:
- definir procesos
- registrar decisiones
- armar reports
- documentar operaciones
- crear contenido reutilizable

### Scripts
Los scripts convierten procesos repetitivos en flujos visibles y mantenibles.
Son utiles para automatizar desde eventos de GitHub hasta movimientos de cards o generacion de contenido.

### Integrations
Las integraciones conectan Killio con el stack real del equipo.
Esto permite que los boards y los documentos no sean islas, sino nodos dentro de una operacion mas amplia.

## Por que se siente distinto

Killio no intenta ser solo un tablero, ni solo un editor, ni solo un automatizador.
La propuesta es combinar todo eso en una superficie coherente:
- una decision termina en una card
- una card puede alimentar un documento
- un documento puede disparar un workflow
- un workflow puede actualizar boards o integraciones
- todo queda trazado en actividad y notificaciones

## Qué incluye este repositorio

Este repositorio contiene la aplicacion web completa de Killio, incluyendo:
- auth y sesion
- dashboard principal
- boards y cards
- editor de documentos por bricks
- historial de actividad
- integraciones
- workflows/scripts
- chat y realtime
- soporte i18n
- PWA y experiencia mobile

## Stack tecnico

La tecnologia existe para sostener el producto, no para definirlo. Aun asi, el frontend se apoya en:
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Ably para realtime
- dnd-kit para interacciones de board
- Serwist para PWA
- River para automatizaciones
- HyperFormula y Recharts para bricks de datos

## Como se usa

1. Inicia sesion.
2. Crea o abre un team.
3. Organiza boards y cards.
4. Documenta el trabajo en bricks.
5. Conecta integraciones.
6. Automatiza tareas repetitivas con scripts.
7. Revisa actividad, notificaciones y cambios en vivo.

## Setup local

### Requisitos
- Node.js 20+
- npm 10+
- Killio Backend corriendo

### Variables de entorno

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_KILLIO_API_URL=http://localhost:4000
```

### Arranque

```bash
npm install
npm run dev
```

Abre http://localhost:3000.

## Rutas principales
- `/` -> landing y entrada principal
- `/login` y `/signup` -> acceso
- `/b` -> boards
- `/d` -> documents
- `/history` -> actividad
- `/teams` -> equipos
- `/integrations` -> integraciones y workflows
- `/accept-invite` -> invitaciones

## Operacion de producto

Antes de publicar cambios importantes, conviene validar:
- boards y cards siguen siendo usables en desktop y mobile
- documents siguen editandose y reordenandose bien
- scripts siguen mostrando el canvas y los runs
- integrations siguen reflejando el estado real de conexiones
- el realtime sigue actualizando presencia y actividad

## Relacion con el backend

Este frontend consume la API de Killio Backend para:
- auth y sesion
- teams, boards, cards y documents
- activity y notifications
- ai y uploads
- scripts e integrations
- ably auth para realtime

## Mensaje de producto

Killio ayuda a que el trabajo deje de depender de demasiadas herramientas separadas.
Es una experiencia para equipos que quieren ver el trabajo, documentarlo, automatizarlo y moverlo de forma ordenada desde una sola interfaz.