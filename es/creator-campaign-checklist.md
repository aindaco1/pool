---
layout: default
title: Lista para creadores de campañas
description: "Una lista práctica para preparar una campaña en The Pool: guardar el proyecto, revisar vistas previas, publicar, preparar media y recompensas, promoción, checkout, reportes y fulfillment."
permalink: /es/creator-campaign-checklist/
lang: es
indexable: false
translation_key: creator_campaign_checklist
last_modified_at: 2026-09-29
---

<div class="creator-checklist-layout">
<article class="creator-checklist-article" markdown="1">

# Lista para creadores de campañas

Esta página es una guía práctica para preparar una campaña en **The Pool**.

Responde a una pregunta sencilla:

> ¿Qué necesitamos de una persona creadora para lanzar una campaña completa, clara y convincente?

La lista cubre:

- datos básicos de la campaña
- imágenes y video
- texto y guía de extensión
- niveles, recompensas y artículos de apoyo
- add-ons de campaña y add-ons de plataforma
- recompensas físicas, envío, envío gratis y tarifas de respaldo
- expectativas de impuestos y checkout
- enlaces para compartir y embeds para promoción
- QR, enlaces de referencia y preparación de Blasts para patrocinadores
- reportes, fulfillment y entrega final
- acceso al panel, borradores y expectativas de publicación

## Notas de la plataforma actual

Revisada el 29 de septiembre de 2026 con las versiones de The Pool hasta **v1.2.22**. Esta lista cubre el flujo actual para creadores:

- las personas creadoras y sus equipos pueden tener acceso específico al panel para preparar campañas, editar contenido, revisar vistas previas, reportes, analytics, marketing y Blast sin acceso directo al repositorio
- las personas superadministradoras inicializan campañas de solo preview, asignan o crean usuarios de campaña y manejan controles de plataforma; el trabajo diario de preparación queda en manos del equipo asignado
- **Guardar**, **Vista previa** y **Publicar** en la cabecera abarcan las nueve pestañas de edición, incluso para revisar campañas ya públicas; **Guardar borrador** en Contenido sigue siendo un respaldo separado del navegador
- las vistas previas protegidas muestran el último proyecto guardado correctamente; la página pública y el checkout usan la versión publicada
- las personas superadministradoras pueden archivar campañas que no estén live; el source y la media de la campaña se mueven al archivo en vez de borrarse
- la biblioteca de media permite buscar y filtrar imágenes, video y audio de la campaña; ver dimensiones, duración, peso, referencias, estado de optimización, derivados faltantes y advertencias de uso; y reemplazar de forma segura fuentes de la misma campaña sin cambiar su ruta pública
- el texto alternativo se recomienda para imágenes con significado y nunca bloquea Guardar o Publicar; las imágenes puramente decorativas deben marcarse de forma explícita
- las cargas de video aceptan MP4, WebM y MOV de hasta 100 MB; la optimización de imágenes se publica automáticamente después de validarse, mientras las conversiones de video siguen requiriendo revisión
- los add-ons de campaña pueden pertenecer a una sola campaña y contar hacia su meta
- dejar vacío el inventario de un producto o variante significa disponibilidad ilimitada; un `0` explícito significa agotado
- las variantes de add-ons pueden heredar el precio base o tener un precio específico, incluso un override válido de `$0`; el Worker verifica el precio actual y conserva precios históricos válidos para selecciones guardadas que no cambian
- los usuarios asignados reciben reportes diarios de aportes y de cumplimiento después de la fecha límite de forma predeterminada; puedes desmarcar usuarios o agregar otros destinatarios en la configuración
- los embeds alojados dan un widget vivo para sitios web y páginas de partners que aceptan HTML
- las páginas de campaña incluyen enlaces para compartir en Bluesky, X, Threads, Facebook, SMS y email
- los textos de compartir usan estado de campaña, título, blurb y URL pública cuando la plataforma destino permite texto
- las campañas próximas pueden recoger recordatorios únicos de lanzamiento antes de abrir aportes
- el lanzamiento y las fechas límite siguen la zona horaria configurada para la plataforma
- los analytics de campaña mantienen visible el ingreso bruto de campaña y también muestran el ingreso neto después de comisiones de procesamiento asignadas
- las personas operadoras de plataforma pueden vigilar el uso de planes de Cloudflare y Resend desde el panel sin exponer tokens de proveedores al equipo creador
- los equipos de campaña pueden usar enlaces de vista previa protegida para revisar borradores de campaña de forma privada antes del lanzamiento público
- los equipos de campaña pueden crear URLs con tracking, guardar códigos de referencia, descargar códigos QR, guardar borradores compartidos de Marketing y revisar performance de referencias/UTM desde Analíticas
- Campaigns -> Blast puede guardar borradores compartidos y enviar correos a patrocinadores con imágenes alojadas por la campaña, imágenes existentes seleccionadas y enlaces de YouTube/Vimeo compatibles con email
- en producción, los updates de campaña usan entrega durable con reintentos limitados; los correos de diario, milestone y announcement live incluyen unsubscribe de un clic por campaña, mientras los correos de pledge y pago siguen siendo transaccionales
- al recargar el panel, los equipos de campaña vuelven a su último tab permitido, campaña seleccionada y subtab de Campaigns para retomar trabajo de contenido, Marketing o Blast en el mismo lugar
- el checkout puede recoger consentimiento explícito para un solo recordatorio de checkout abandonado, separado de recordatorios de lanzamiento y blasts de campaña; los equipos de campaña pueden revisar salud agregada de recordatorios y usar controles de supresión limitados sin ver PII del recordatorio
- una campaña puede publicar opcionalmente una página de producto localizada e indexable para su nivel físico destacado, pero solo con precio positivo, imagen, descripción y fecha exacta esperada de disponibilidad; esto no crea por sí solo una cuenta de Merchant Center ni garantiza presencia en Google Shopping
- los Términos públicos explican la política predeterminada de venta final/sin devoluciones, el proceso para artículos dañados, defectuosos, incorrectos o faltantes y la responsabilidad de comunicar cambios importantes de producción o fulfillment
- las mejoras de performance hacen más estable la primera carga, incluidos embeds hero de YouTube diferidos y entrega responsiva de imágenes, pero las campañas aún necesitan media optimizada y copy conciso

## Versión rápida

### Obligatorio para lanzar

- título de la campaña
- slug, o aprobación del que el panel deriva del título antes de compartir enlaces públicos
- nombre público de la persona creadora
- categoría
- meta de financiamiento
- fecha de inicio
- fecha límite
- blurb corto
- imagen cuadrada principal
- imagen ancha principal o video de campaña
- al menos un nivel de recompensa
- nombre, precio y descripción de cada nivel
- revisar los destinatarios asignados de reportes y cualquier correo adicional
- correos de editoras o editores del panel, si el equipo creador editará directamente
- correos opcionales de personas revisoras que verán el borrador privado antes del lanzamiento
- decisión sobre recordatorios de lanzamiento para campañas próximas: formulario público, sin formulario o lanzamiento sin periodo previo

### Muy recomendado

- imagen de la persona creadora o estudio
- descripción larga de la campaña
- 3 a 6 niveles
- 1 a 3 artículos de apoyo, si aplican
- add-ons de campaña para merch o extras de precio fijo
- video pitch de campaña
- 3 a 8 imágenes adicionales
- plan de promoción con el código embed de la campaña
- destinos para QR/enlaces de referencia en impresos, venues, partners o bios sociales
- plan para el primer Blast de lanzamiento o empuje final
- captions para compartir en lanzamiento, campaña live, empuje final, campaña funded y campaña ended

### Si algo es físico

- marcar la recompensa como física
- definir un preset de envío o medidas/peso explícitos
- decidir si el envío será gratis, cotizado por USPS, tarifa plana manual o tarifa de respaldo
- incluir inventario
- incluir variantes y cantidades por variante, si aplican
- incluir una fecha o ventana realista de disponibilidad o entrega
- confirmar que el copy de tallas, fit, venta final y problemas de fulfillment coincide con los Términos públicos
- definir responsable de fulfillment y notas de empaque o entrega

Si se habilitará la página opcional de Shopping, el nivel físico destacado también necesita precio positivo, imagen, descripción y fecha exacta esperada de disponibilidad.

<figure class="creator-checklist-screenshot creator-checklist-screenshot--narrow">
  <img src="/assets/images/checklists/creator-campaign-checklist/campaign-card.png" alt="Tarjeta de campaña con título, blurb, progreso y nivel destacado." loading="lazy">
  <figcaption>Una tarjeta terminada necesita una imagen legible, un blurb claro, contexto de progreso y una acción principal.</figcaption>
</figure>

## Qué hace que una campaña se sienta completa

Una campaña completa normalmente combina cuatro cosas:

1. una premisa clara
2. una identidad visual fuerte
3. un video pitch o imagen hero persuasiva
4. recompensas fáciles de entender y atractivas

La campaña debe explicar rápido:

- qué es el proyecto
- por qué importa
- por qué este equipo puede hacerlo
- qué recibe quien apoya
- por qué conviene unirse ahora

## Información central

| Elemento | Obligatorio | Guía |
|----------|-------------|------|
| Título | Sí | 2 a 8 palabras. Corto y legible en tarjeta. |
| Slug | Sí al lanzar | El panel puede derivarlo del título. Revísalo antes de compartir enlaces; debe ser estable, en minúsculas y con guiones. Ejemplo: `picnic-de-medianoche`. |
| Nombre de creador/a | Sí | Nombre público. |
| Categoría | Sí | Ejemplo: `Cortometraje`, `Largometraje`, `Álbum`, `Fanzine`. |
| Meta | Sí | Monto en dólares enteros. |
| Fecha de inicio | Sí | Fecha pública real de lanzamiento. |
| Fecha límite | Sí | Fecha real de cierre. |
| Blurb corto | Sí | Una oración clara, idealmente 12 a 24 palabras. |
| Nivel destacado | Recomendado | El nivel de entrada más claro. |
| Reportes para usuarios / Correos adicionales para reportes | Revisar | Los usuarios asignados están seleccionados de forma predeterminada. Desmarca a quienes no deban recibir reportes y agrega otros destinatarios si hace falta. Guarda y publica los cambios. |
| Responsable de fulfillment | Recomendado | Quién entrega las recompensas si la campaña se cobra con éxito. |
| Editores del panel | Recomendado | Correos autorizados del equipo creador que tienen acceso solo a esta campaña. |
| Personas revisoras | Opcional | Correos de confianza que reciben un enlace de vista previa protegida antes del lanzamiento público. |
| Recordatorios de lanzamiento | Opcional | Si la campaña tiene periodo previo, decidir si se recogerán correos para un único recordatorio cuando abra. |
| Página de Shopping del nivel destacado | Opcional | Mantenerla deshabilitada salvo que el nivel destacado sea físico y tenga precio, imagen, descripción, tratamiento de envío, copy de políticas y fecha exacta esperada de disponibilidad. |

<figure class="creator-checklist-screenshot creator-checklist-screenshot--compact">
  <img src="/assets/images/checklists/creator-campaign-checklist/creator-facts.png" alt="Panel de datos de creador con imagen, nombre, categoría y enlace de embed." loading="lazy">
  <figcaption>Los metadatos básicos aparecen en la página pública, así que los huecos se notan.</figcaption>
</figure>

## Handoff del panel de administración

The Pool usa un panel privado para la edición normal de campañas y operaciones. Las personas creadoras no necesitan acceso directo al repositorio para los cambios soportados, y los usuarios de campaña asignados deben tratar el panel como su espacio principal de preparación.

El panel puede gestionar:

- ajustes de campaña, fechas, blurbs, imágenes, video, opciones de envío y campos opcionales de Shopping para el nivel destacado
- contenido largo mediante el editor WYSIWYG de bloques
- niveles, artículos de apoyo, add-ons de campaña, stretch goals, entradas de diario y decisiones
- vistas previas de reportes, listas de patrocinadores, analytics, enlaces de marketing/referencia y accesos al constructor de embeds
- descargas de QR de campaña y enlaces de referencia guardados
- borradores de Blast, envíos de prueba, envíos live e historial enviado de solo lectura
- textos de compartir y entradas de social preview mediante los mismos campos de título, blurb, imagen hero y estado que se muestran en la página pública
- enlaces de vista previa protegida para personas revisoras de confianza antes de que la campaña sea pública
- biblioteca de media basada en el manifest con búsqueda, filtros, referencias, estado de optimización, advertencias por uso y reemplazo seguro dentro de la misma campaña

Antes del lanzamiento, confirma:

- qué correos del equipo creador deben tener acceso específico a la campaña
- qué personas revisoras externas, si las hay, deben recibir enlaces de vista previa protegida
- quién del equipo creador es responsable de publicar cambios de campaña desde el panel
- si se requiere revisión de plataforma antes del lanzamiento, especialmente para precios, impuestos, envío, inventario o cambios sensibles a proveedores
- qué campos deben quedarse estables cuando ya existan enlaces públicos, especialmente slug, URL, precios, inventario, envío e impuestos
- si la página opcional de Shopping seguirá deshabilitada o ya tiene un nivel físico destacado completo y una fecha de disponibilidad confirmada

Notas operativas:

- Una persona superadministradora puede crear una campaña de solo preview con un título, asignar usuarios existentes o crear usuarios nuevos. A partir de ahí, el equipo asignado puede completar la campaña desde el panel. La campaña queda oculta de rutas públicas, embeds, share cards, sitemap y prefetching hasta el lanzamiento.
- Los IDs nuevos de niveles, artículos, add-ons, decisiones y variantes pueden derivarse del nombre o label en el panel; los IDs heredados deben mantenerse estables.
- Usa **Guardar** en la cabecera para conservar todo el proyecto entre sesiones y dispositivos. **Guardar borrador** solo respalda el editor de Contenido en el navegador actual.
- Publicar cambios de campaña o configuración pasa por el flujo de la plataforma y puede tardar en desplegarse.
- Los enlaces de vista previa protegida expiran después de 24 horas, pueden regenerarse desde el panel por una persona autorizada de la campaña y no hacen visible una campaña de solo preview en las rutas públicas.
- La gestión de usuarios es separada: los usuarios del panel se guardan en Worker KV y no crean commits en GitHub.
- El sign-in del panel puede pedir un desafío de Cloudflare Turnstile antes de enviar el magic link por email.
- Los formularios de recordatorio para campañas próximas también pueden usar Cloudflare Turnstile; las claves y secretos los configuran las personas operadoras de plataforma, no las creadoras.
- Los analytics distinguen ingresos brutos de campaña e ingresos netos después de comisiones de procesamiento asignadas, para ayudar a reconciliar totales sin ocultar la matemática pública de financiación.
- El lanzamiento ocurre a medianoche de la fecha de inicio y el cierre a las 23:59:59 de la fecha límite, en la zona horaria de plataforma. El campo **Estado** del panel sigue esas fechas automáticamente. Confirma la zona horaria antes de publicar textos sensibles al horario.
- Los borradores compartidos de Marketing y Blast usan sus propias acciones para cargar, guardar y borrar, y vencen después de siete días. Son independientes de Guardar el proyecto y del respaldo de Contenido en el navegador.
- Las imágenes de Blast se suben al directorio de assets de la campaña antes del dry run automático, mientras YouTube y Vimeo se convierten en enlaces compatibles con email.
- Las advertencias de la biblioteca de media son revisiones de lanzamiento. Resuelve referencias rotas y derivados faltantes, y revisa avisos de peso o proporción antes de publicar.
- Reemplazar una fuente conserva su ruta pública y puede cambiar todos los lugares publicados que la usan después del despliegue. Para preparar una revisión sin publicarla, sube un archivo nuevo desde el editor de campaña. El reemplazo en la misma ruta se limita a la campaña y al tipo de media originales y rechaza ediciones desactualizadas.
- La publicación de Shopping falla de forma cerrada si faltan datos del nivel destacado o su fecha de disponibilidad. Mantén el switch apagado hasta confirmar todos los datos.

## Guardar, revisar y publicar {#save-preview-and-publish}

Abre [el panel](/es/admin/), entra a **Campañas** y selecciona tu proyecto. Las acciones de la cabecera abarcan Configuración, Contenido, Niveles, Elementos de apoyo, Complementos, Metas extendidas, Apoyo continuo, Diario y Decisiones.

| Acción | Qué guarda o publica | Qué ven revisores y patrocinadores |
|--------|----------------------|------------------------------------|
| **Guardar borrador** en Contenido | Respalda texto y referencias de media existentes en este navegador, perfil, sitio e idioma del editor. Los archivos seleccionados aún necesitan subirse. | No cambia el proyecto guardado ni la página pública. No incluye otras pestañas de edición. |
| **Guardar** en la cabecera | Guarda todo el proyecto como una copia de trabajo compartida, incluidas las cargas pendientes de Contenido y Diario. | Los enlaces de vista previa activos muestran esa versión. La campaña pública no cambia. |
| **Vista previa** en la cabecera | Guarda los cambios y abre los controles para compartir la vista previa protegida. Invita revisores solo cuando quieras que reciban un enlace. | Una vista de solo lectura, sin aportes habilitados. Los enlaces vencen después de 24 horas. |
| **Publicar** en la cabecera | Guarda los cambios y publica la copia de trabajo. | La campaña se hace pública, o se actualiza la campaña existente, después del despliegue. Los aportes siguen las fechas configuradas. |

Para una campaña nueva o una revisión:

1. Completa las pestañas necesarias y pulsa **Guardar**. Mantén abierto el editor hasta que terminen las cargas y el guardado; una miniatura local no confirma que el archivo se haya guardado.
2. Abre **Vista previa** y revisa textos, media, recompensas, precios, envío y diseño móvil. Una campaña recién creada necesita que termine la primera generación del sitio para que exista su ruta de vista previa.
3. Comparte los enlaces protegidos con las personas elegidas. Los guardados posteriores actualizan lo que ven los revisores, pero no envían invitaciones ni extienden las 24 horas de vigencia. Abrir Vista previa conserva los enlaces que siguen activos.
4. Pulsa **Publicar** cuando esté lista. Se exige título, fechas válidas de inicio y cierre en orden, y una meta positiva; usa el resto de esta lista para revisar la preparación del lanzamiento. Una campaña con fecha futura se publica como próxima.
5. Espera el despliegue y abre la URL pública fuera del panel autenticado. Revisa la página, la ruta del otro idioma, la reproducción de media, las recompensas disponibles, la vista social y el embed. Guardar o revisar una vista privada no confirma que la página pública se haya actualizado.

Si otra persona cambió el proyecto, compara tu trabajo conservado con la versión actual antes de reintentar. Un guardado fallido conserva los cambios del editor; lo escrito después de iniciar un guardado puede requerir otro. **Publicar** puede seguir disponible después de Guardar porque la versión pública aún no se actualizó.

Si falta contenido, conserva el perfil original del navegador y cualquier pestaña del editor abierta, copia el texto visible y pide ayuda al equipo de plataforma. No borres los datos del sitio ni sobrescribas el borrador durante la recuperación. Los respaldos del navegador no se comparten entre dispositivos o idiomas, y **Guardar borrador** no conserva los archivos seleccionados.

## Imágenes y video

### Imagen cuadrada

- **Uso:** tarjetas de campaña, fallback de hero, share cards y contexto social
- **Recomendado:** `1200 × 1200 px`
- **Mínimo:** `1000 × 1000 px`
- **Formato:** `WebP`, `JPG` o `PNG`
- **Peso ideal:** menos de `500 KB`
- debe seguir siendo legible cuando se recorta dentro de un preview social

### Imagen ancha

- **Uso:** hero de campaña, poster del video, fallback social
- **Recomendado:** `1600 × 900 px`
- **Mínimo:** `1400 × 788 px`
- **Formato:** `WebP`, `JPG` o `PNG`
- **Peso ideal:** menos de `700 KB`

### Imagen de creador/a

- **Recomendado:** `800 × 800 px`
- **Mínimo:** `400 × 400 px`
- mantener rostro, logo o sujeto principal legible en tamaño pequeño

### Video pitch

El video debe construir confianza, tono y urgencia. No necesita equipo caro, pero sí claridad, audio limpio y una razón convincente para apoyar.

- **Resolución recomendada:** `1920 × 1080`
- **Mínimo:** `1280 × 720`
- **Duración ideal:** `2:00 a 3:30`
- **Máximo recomendado:** `5:00`
- **Formato preferido para self-hosting:** `.webm`
- **Cargas aceptadas:** MP4, WebM o MOV, hasta `100 MB` por video en Hero, Contenido, Diario y reemplazos de media
- **Reproducción:** usa códecs compatibles con navegadores y prueba el archivo en escritorio y móvil; aceptar un MOV no garantiza que se reproduzca en todos los navegadores
- **Optimización:** se conserva el video original. Un WebM generado se usa después de revisarse; una conversión más grande puede omitirse. Conserva el original y no dependas de una conversión automática para poder subir un archivo demasiado pesado

También puedes usar una URL compatible de YouTube o Vimeo. El reproductor hero de YouTube carga cuando la persona pulsa reproducir, así que revisa tanto el póster como el video.

### Revisar la media después de guardar

- Comprueba la miniatura local y el archivo desplegado. El editor puede mostrar una vista previa mientras el recurso público aún se despliega.
- La optimización de imágenes se ejecuta después de subirlas y puede publicar fuentes más pequeñas y tamaños WebP responsivos automáticamente tras validación y las comprobaciones completas del sitio. No publica los textos o precios guardados de la campaña.
- Las conversiones de video siguen una revisión separada. Algunos tamaños de imagen o derivados de video se omiten a propósito cuando pesarían más que el original; consulta advertencias persistentes con el equipo de plataforma antes de volver a subir el mismo archivo.

El pipeline de media puede crear variantes WebP de `320w`, `480w`, `640w`, `960w` y `1600w` para páginas públicas cuando la imagen fuente es más grande. La biblioteca muestra estado de optimización, derivados faltantes, referencias conocidas, referencias rotas y advertencias de peso/proporción desde el manifest versionado. Aun así, conviene exportar las imágenes cerca de las dimensiones y recortes recomendados antes de subirlas y resolver problemas de media antes del lanzamiento.

Se recomienda texto alternativo útil para cada imagen pública con significado; dejarlo vacío no bloquea Guardar ni Publicar. Una imagen puramente decorativa puede llevar alt vacío solo si se selecciona de forma explícita **Imagen decorativa**; no uses esa opción para evitar describir contenido importante.

El video responde:

- quién eres tú y quién es el equipo
- qué es el proyecto
- por qué este proyecto importa ahora
- qué acción debe tomar la audiencia

## Texto de campaña

La mejor copia funciona por capas:

- blurb corto
- descripción larga
- texto de niveles
- artículos de apoyo, stretch goals y diario de producción

### Blurb corto

- **Ideal:** 12 a 24 palabras
- **Máximo recomendado:** 30 palabras
- debe funcionar como logline, no como pitch completo

### Descripción larga

- **Ideal:** 300 a 900 palabras
- **Mínimo útil:** unas 200 palabras
- **Zona alta cómoda:** unas 1200 palabras

Buenas secciones:

- El proyecto
- Por qué lo hacemos
- Qué cubre el financiamiento
- El enfoque visual
- Dónde estamos ahora

### Bloques de contenido

El cuerpo largo puede incluir texto, citas, imágenes, galerías y embeds estructurados. Se recomienda texto alternativo para cada imagen con significado y, si ayuda, una leyenda.

El editor y las vistas públicas admiten negrita, cursiva, énfasis combinado y subrayado. Las descripciones de recompensas conservan el formato compatible en el carrito, incluso al restaurarlo. Revisa el texto en la vista móvil y en el carrito; usa los controles de formato del editor en lugar de pegar HTML o scripts.

Los embeds estructurados deben usar URLs `https://` de orígenes aprobados de YouTube, Vimeo o Spotify. Instagram puede usarse como enlace social o CTA de correo cuando corresponda, pero no como embed estructurado. Cualquier proveedor nuevo debe revisarse antes de lanzar por seguridad, diseño y comportamiento móvil.

## Niveles y recompensas

Para la mayoría de campañas:

- **Rango ideal:** 5 a 7 niveles
- **Mínimo fuerte:** 4 niveles

Anclas útiles:

- `$10 a $20` para entrada
- `$25` como nivel estratégico
- `$50`
- `$100`
- `$250`
- `$500+`

Para cada nivel, entrega:

- ID del nivel
- nombre
- precio
- descripción
- si es digital o físico
- si es limitado
- si es stackable
- si permanece en late support
- imagen opcional
- umbral de desbloqueo opcional

<figure class="creator-checklist-screenshot creator-checklist-screenshot--compact">
  <img src="/assets/images/checklists/creator-campaign-checklist/tier-card.png" alt="Tarjeta de nivel con imagen, nombre, precio, descripción y botón de estado cerrado." loading="lazy">
  <figcaption>Los niveles funcionan mejor cuando nombre, precio, imagen y descripción se entienden de un vistazo.</figcaption>
</figure>

## Artículos de apoyo

Son opcionales y sirven para financiar necesidades específicas.

Para cada artículo:

- ID
- etiqueta
- monto objetivo
- explicación corta de lo que financia
- si permanece en late support
- si es digital o físico

Ejemplos:

- `Inscripciones a festivales`
- `Tiempo de estudio + músicos`
- `Licencia de material de archivo`

## Add-ons

Los add-ons sirven para extras de precio fijo, merch o upgrades que deben verse como tarjetas de producto.

La plataforma soporta dos alcances:

- **Add-ons de campaña:** pertenecen a una campaña y cuentan hacia el subtotal/meta de esa campaña.
- **Add-ons de plataforma:** pertenecen al operador de The Pool y no cuentan hacia ninguna meta de campaña.

Para un add-on de campaña, entrega:

- ID
- nombre
- descripción
- precio
- categoría: `digital` o `physical`
- imagen
- inventario, si es limitado
- variantes y cantidades por variante, si aplican
- precio base que heredarán las variantes y override explícito para cualquier variante con precio diferente
- preset de envío o medidas/peso explícitos, si es físico
- responsable de fulfillment

Notas importantes:

- los add-ons de campaña cuentan para el progreso de la campaña
- los add-ons de plataforma quedan separados como merch de la plataforma
- los add-ons físicos de campaña siguen las reglas de envío de esa campaña
- un precio de variante vacío hereda el precio base; un override explícito de `$0` significa una variante gratis y no equivale a dejarlo en blanco
- el inventario vacío de producto o variante significa ilimitado; usa `0` solo si debe estar agotado y una cantidad positiva para existencias limitadas
- los usuarios asignados pueden subir fotos para add-ons de campaña nuevos o existentes, incluso en campañas publicadas; guarda, revisa y publica la revisión
- cambiar de variante usa su precio actual de catálogo, mientras una variante sin cambios en un pledge existente puede conservar su precio unitario histórico válido
- no uses un cambio de precio para reescribir expectativas ya guardadas; revisa copy público, inventario y fulfillment antes de publicarlo
- los reportes separan filas de campaña y filas de plataforma

## Página opcional de Shopping para el nivel destacado

The Pool puede publicar una página de producto localizada para una sola recompensa. Es opcional y solo debe activarse para una recompensa física completa y apropiada para product search.

La página reutiliza el nivel destacado de la campaña; no crea otro catálogo. Antes de habilitarla, confirma:

- el nivel destacado es físico
- tiene precio positivo
- tiene una imagen de producto clara y una descripción completa
- la fecha exacta esperada de disponibilidad cae en o después de la fecha límite de campaña y dentro de un año desde el build del sitio
- el timeline visible, plan de fabricación, tratamiento de envío y fecha de disponibilidad coinciden
- el copy no promete devoluciones o cambios que contradigan la política predeterminada de venta final
- tallas, formato, materiales, contenido incluido y otros detalles esenciales están claros

Durante la campaña live, la página describe la recompensa como preventa; fuera de la ventana live aparece sin stock. Muestra precio, marca/vendedor, disponibilidad, envío, venta final y enlaces a las políticas públicas.

Activarla puede hacer que la recompensa sea elegible para experiencias de producto en buscadores, pero no garantiza presencia en Google Shopping. Verificación de Merchant Center, feed compatible, ajustes de envío/devoluciones, aprobación de destinos y revisión del operador son trabajo separado. Mantén **Producto de Shopping habilitado** apagado hasta tener datos completos y capacidad para mantenerlos iguales en todos los lugares.

## Promoción y embeds

The Pool incluye un constructor de embed:

- `/embed/campaign/?slug=tu-campaign-slug`
- `/es/embed/campaign/?slug=tu-campaign-slug`

El embed es un `iframe` vivo para sitios que aceptan HTML. Refleja el estado actual de la campaña, monto pledged, progreso, countdown, media y CTA. El mismo constructor también aparece dentro del tab Marketing del panel junto con herramientas para códigos de referencia, enlaces UTM guardados y descargas de QR.

<figure class="creator-checklist-screenshot">
  <img src="/assets/images/checklists/creator-campaign-checklist/embed-builder.png" alt="Constructor de embed con controles de layout, tema, media, CTA, código y vista previa." loading="lazy">
  <figcaption>El constructor convierte la promoción en decisiones concretas: layout, tema, media, CTA y destino.</figcaption>
</figure>

Prepara:

- URL principal de campaña
- destinos donde se pegará el embed
- destinos de QR: posters, tarjetas, señalización de venue, programas, postales o bios sociales
- nombres de códigos de referencia para partners, prensa, venues, cast/crew o canales del equipo de campaña
- modo preferido: completo o compacto
- si debe mostrar media
- copy de lanzamiento
- 3 a 5 captions cortos
- captions por estado:
  - upcoming: invitar a estar pendiente del lanzamiento
  - live: pedir apoyo ahora
  - empuje final: nombrar el monto restante o la fecha límite
  - funded: agradecer y explicar próximos pasos
  - ended: resumir el resultado y dónde seguir updates
- blurb corto para email/newsletter
- asunto y cuerpo breve para un Blast de lanzamiento o empuje final
- CTA Button Label y CTA Button URL si el Blast necesita una acción clara
- contactos de prensa o partners, si aplican

Los botones de compartir usan la URL pública de campaña y texto por estado donde se permite. Facebook y otros destinos centrados en preview dependen principalmente del Open Graph title, description e imagen de la campaña.

Prueba los QR desde la cámara de un teléfono real antes de imprimirlos o compartirlos ampliamente. El copy de Blast debe ser conciso, usar pocas imágenes y enlazar media alojada por la campaña en lugar de hotlinks remotos. Los equipos que operan su propio fork ensayan `npm run setup:deploy -- --mode=production --dry-run` antes del lanzamiento para revisar preparación de proveedores, reutilización de namespaces KV, secretos y pasos de deploy antes de que lleguen patrocinadores.

Los mensajes de Blast/announcement live, diario y milestone incluyen unsubscribe de un clic por campaña; no deben presentarse como correo transaccional obligatorio. En producción, el envío masivo entra a una cola durable con reintentos limitados, así que una acción live exitosa puede significar que el mensaje fue aceptado para entrega, no que ya llegó a cada inbox.

Usa entradas de diario o announcements para comunicar cambios importantes de calendario, plan creativo, especificaciones de recompensas, disponibilidad o fulfillment. Al corregir un update existente, conserva su ID para que un cambio de metadatos no se trate como un broadcast nuevo.

## Recompensas físicas y envío

Las recompensas físicas agregan inventario, costos, envío y fulfillment. Funcionan mejor cuando son simples, significativas y bien presupuestadas.

Para cualquier recompensa física o add-on físico, define:

- categoría física/digital
- preset de envío o peso/dimensiones
- inventario
- variantes, si aplican
- fecha o ventana realista de disponibilidad y entrega
- si califica para envío gratis
- si necesita tarifa plana específica de campaña
- si puede usar la tarifa de respaldo si USPS no está disponible
- si se ofrecerán opciones domésticas con firma o firma de adulto
- responsable de fulfillment y restricciones de origen
- copy preciso de tallas, fit, materiales, contenido incluido, venta final y problemas de fulfillment

Modelo actual:

- USPS puede cotizar envíos nacionales e internacionales
- existen tarifas de respaldo configuradas
- una campaña puede forzar tarifa plana
- algunos presets simples pueden usar tarifas manuales
- puede haber envío gratis global o por campaña/item
- las opciones con firma se guardan en el pledge, email, Manage Pledge y reportes

Las recompensas cobradas son venta final por defecto, sin devoluciones o cambios por preferencia, fit o talla. Los artículos dañados, defectuosos, incorrectos o faltantes siguen necesitando un proceso real de solución; se pide reportarlos pronto y normalmente dentro de siete días calendario después de que el carrier marque la entrega. Las fechas son estimados de buena fe, no garantías, pero los cambios importantes de producción o fulfillment deben comunicarse con honestidad.

Regla clave:

> No prometas un precio de envío en la copia si la configuración de campaña no lo hace cumplir.

Revisa la [política de envío](/es/terms/#shipping-policy) y la [política de no devoluciones y problemas de fulfillment](/es/terms/#returns-refunds) antes de cerrar el copy. Los términos específicos de campaña pueden añadir detalle, pero no deben contradecir la política de plataforma ni prometer soluciones que el equipo no puede ofrecer.

## Impuestos y checkout

El checkout es verificado por servidor. El Worker reconstruye carrito, envío, impuestos, tips, add-ons y totales antes de iniciar el pago de Stripe.

La persona creadora no calcula impuestos, pero debe evitar prometer precios con impuesto incluido salvo que eso esté configurado.

El copy de campaña debe explicar correctamente el modelo all-or-nothing:

- hacer un pledge guarda el método de pago; no cobra de inmediato el monto de campaña
- si la campaña no alcanza su meta antes de la fecha límite, el pledge de campaña no se cobra
- si alcanza la meta, el método guardado puede cobrarse después del cierre; una tarjeta vencida o fallida todavía puede impedir el cobro
- niveles, apoyo directo/custom, artículos de apoyo y add-ons de campaña cuentan hacia el progreso
- impuestos, envío, add-ons de plataforma y tips opcionales de plataforma no cuentan hacia el progreso
- The Pool no descuenta comisión de plataforma del financiamiento, pero las comisiones de Stripe y los gastos de campaña todavía pueden reducir el neto que recibe el equipo creador

No digas que cada dólar pledged ya fue cobrado, que el supporter paga de inmediato o que la persona creadora recibe el total bruto público sin costos de procesamiento.

El comportamiento actual puede incluir:

- tasa plana configurada
- reglas offline de respaldo
- soporte de New Mexico GRT
- soporte opcional de ZIP.TAX para forks
- visual provisional cuando todavía falta ubicación

En la práctica:

- el carrito puede mostrar impuesto como `--` hasta tener dirección suficiente
- el total final se recalcula en el Worker
- Manage Pledge y su diálogo de confirmación usan la misma cotización verificada de impuestos, incluido un resultado válido de impuesto cero
- recompensas físicas deben pedir datos suficientes para envío e impuesto
- los reportes incluyen impuesto y envío guardados; revisa el estado del pago antes de tratarlos como dinero cobrado

Guardar una tarjeta y confirmar un aporte son pasos separados. El checkout muestra éxito solo después de registrar el aporte. Si la confirmación sigue pendiente o no está disponible, usa la consulta de estado del intento existente o contacta a soporte con su referencia; no pidas crear otro aporte para resolver la incertidumbre. Un correo de confirmación retrasado no significa por sí solo que el aporte falló.

## Reportes y fulfillment

Entrega:

- correos de reportes de campaña
- persona o equipo responsable de fulfillment
- si hay add-ons operados por plataforma
- notas especiales de empaque o entrega
- ventanas esperadas de entrega
- proceso y contacto responsable para recompensas dañadas, defectuosas, incorrectas, faltantes, retrasadas o imposibles de cumplir
- si las recompensas deben agruparse, separarse o procesarse en cierto orden

Comportamiento:

- los usuarios asignados reciben reportes por defecto; desmarca a quien no deba recibirlos en **Reportes para usuarios**, luego guarda y publica
- usa **Correos adicionales para reportes** para otros destinatarios; estas preferencias no cambian el acceso al panel, y ser superadministrador no suscribe a todas las campañas
- el ledger diario se envía durante campañas live y hay un reporte único de fulfillment después de la fecha límite, según el horario y la zona horaria de plataforma
- los retrasos y fallos temporales al poner reportes en cola se reintentan durante el mismo día local; cambiar destinatarios después de completar el envío del día surte efecto el siguiente día programado
- el reporte de pledges es historial/ledger
- el reporte de fulfillment es vista actual por supporter y campaña
- el panel puede previsualizar y descargar CSVs de pledges o fulfillment sin enviar correos
- los add-ons de campaña se quedan con la campaña
- los add-ons de plataforma van al fulfillment de plataforma
- cambios y cancelaciones pueden aparecer como filas históricas, mientras fulfillment usa el estado actual
- las variantes y precios unitarios históricos guardados siguen en el registro de fulfillment; trabaja desde el reporte, no desde el catálogo actual

Si falta un correo, descarga el CSV actual desde **Reportes** y pide al equipo de plataforma revisar destinatarios y entrega. Las fechas anteriores omitidas o un envío extra el mismo día requieren intervención del operador. Un reporte en cola no confirma su llegada al inbox, y un ledger de aportes no prueba que se hayan cobrado; revisa el estado de pago antes de entregar recompensas. Comparte los archivos solo con quienes gestionan operaciones y entregas de la campaña.

## Paquete recomendado

- `1` imagen cuadrada
- `1` imagen ancha
- `1` imagen de creador/a
- `1` video pitch
- `3 a 8` imágenes de galería
- `1` blurb corto
- `1` descripción larga de `300 a 900` palabras
- `5 a 7` niveles
- `0 a 3` artículos de apoyo
- `0 a 5` add-ons de campaña
- `0 a 3` stretch goals
- `0 a 2` decisiones comunitarias listas para lanzar
- correos de reportes y responsable de fulfillment
- ventanas de entrega y proceso/contacto para problemas de recompensas físicas
- correos de editoras o editores del panel, si el equipo creador necesita acceso directo
- destinos de embed/promoción para la semana de lanzamiento
- destinos de QR/referencia y códigos de partners necesarios antes del lanzamiento
- asunto, cuerpo y CTA del primer Blast para patrocinadores
- decisión explícita de dejar deshabilitada la página de Shopping o entregar todos los datos físicos y de disponibilidad requeridos

## Checklist final

La campaña suele estar lista cuando:

- el título es claro
- el blurb es fuerte
- las imágenes principales están limpias y en tamaño correcto
- la página larga explica bien el proyecto
- el video pitch es conciso y persuasivo
- cada nivel se entiende rápido
- los add-ons están bien separados como campaña o plataforma
- la herencia de precios y los overrides por variante fueron revisados en la UI que verá el supporter
- cualquier recompensa física tiene envío, inventario, variantes y fulfillment
- el copy de timing, tallas, venta final y problemas de fulfillment coincide con los Términos públicos
- envío gratis, tarifa plana, fallback y USPS están decididos
- la copia sobre impuestos no promete más que el checkout configurado
- el copy explica correctamente el cobro all-or-nothing, qué cuenta hacia la meta y la diferencia entre no cobrar comisión de plataforma y todavía tener costos de procesamiento/producción
- reportes y fulfillment tienen responsables
- el acceso al panel y la responsabilidad de publicación están confirmados
- el proyecto completo está guardado, la vista previa protegida está revisada y la versión aprobada está publicada y comprobada en el sitio desplegado
- los archivos terminaron de subirse, los videos se reproducen en escritorio y móvil y se revisó el resultado de la optimización
- el inventario vacío/ilimitado, los valores de agotado y los límites por variante funcionan como se espera
- el embed fue probado en destinos de promoción
- los QR descargan correctamente y escanean al URL de campaña/referencia esperado
- cualquier Blast de lanzamiento o empuje final tiene asunto, cuerpo conciso, CTA Button Label y CTA Button URL
- los captions y el preview social se sienten apropiados para estados upcoming, live, funded y ended
- cada imagen con significado tiene alt text, las decorativas están marcadas de forma explícita y se revisaron las advertencias de referencias/optimización de media
- el switch de Shopping está apagado, o el nivel físico destacado y la fecha exacta de disponibilidad cumplen todos los requisitos y coinciden con el copy
- no quedan secciones placeholder

</article>

<nav class="creator-checklist-toc" aria-labelledby="creator-checklist-toc-title">
  <h2 id="creator-checklist-toc-title">Contenido</h2>
  <ol>
    <li><a href="#notas-de-la-plataforma-actual">Notas de la plataforma actual</a></li>
    <li><a href="#versin-rpida">Versión rápida</a></li>
    <li><a href="#qu-hace-que-una-campaa-se-sienta-completa">Campaña completa</a></li>
    <li><a href="#informacin-central">Información central</a></li>
    <li><a href="#handoff-del-panel-de-administracin">Panel</a></li>
    <li><a href="#save-preview-and-publish">Guardar, revisar y publicar</a></li>
    <li><a href="#imgenes-y-video">Imágenes y video</a></li>
    <li><a href="#niveles-y-recompensas">Niveles</a></li>
    <li><a href="#add-ons">Add-ons</a></li>
    <li><a href="#pgina-opcional-de-shopping-para-el-nivel-destacado">Página opcional de Shopping</a></li>
    <li><a href="#promocin-y-embeds">Promoción y embeds</a></li>
    <li><a href="#recompensas-fsicas-y-envo">Envío</a></li>
    <li><a href="#impuestos-y-checkout">Impuestos</a></li>
    <li><a href="#reportes-y-fulfillment">Reportes</a></li>
    <li><a href="#checklist-final">Checklist final</a></li>
  </ol>
</nav>
</div>
