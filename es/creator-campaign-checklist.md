---
layout: default
title: Lista para creadores de campañas
description: "Una lista práctica para preparar una campaña en The Pool: panel de administración, imágenes, video, textos, niveles, add-ons, enlaces para compartir, embeds, impuestos, envío, reportes y fulfillment."
permalink: /es/creator-campaign-checklist/
lang: es
indexable: false
translation_key: creator_campaign_checklist
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
- reportes, fulfillment y entrega final
- acceso al panel, borradores y expectativas de publicación

## Qué cambió desde v0.9.5

Esta lista refleja los cambios de la plataforma hasta **v1.0.3**:

- las personas creadoras pueden tener acceso específico al panel para editar campañas sin acceso directo al repositorio
- las cargas de media en el panel soportan imágenes, video, audio, previews y optimización posterior en el repositorio con variantes WebP responsivas
- los add-ons de campaña pueden pertenecer a una sola campaña y contar hacia su meta
- los correos de reportes pueden recibir ledgers diarios de pledges y exports de fulfillment después de la fecha límite
- los embeds alojados dan un widget vivo para sitios web y páginas de partners que aceptan HTML
- las páginas de campaña incluyen enlaces para compartir en Bluesky, X, Threads, Facebook, SMS y email
- los textos de compartir usan estado de campaña, título, blurb y URL pública cuando la plataforma destino permite texto
- las campañas próximas pueden recoger recordatorios únicos de lanzamiento antes de abrir aportes
- el lanzamiento y las fechas límite siguen la zona horaria configurada para la plataforma
- las mejoras de performance hacen más estable la primera carga, pero las campañas aún necesitan media optimizada y copy conciso

## Versión rápida

### Obligatorio para lanzar

- título de la campaña
- slug
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
- correos de reportes si la persona responsable quiere recibir reportes automáticos
- correos de editoras o editores del panel, si el equipo creador editará directamente
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
- captions para compartir en lanzamiento, campaña live, empuje final, campaña funded y campaña ended

### Si algo es físico

- marcar la recompensa como física
- definir un preset de envío o medidas/peso explícitos
- decidir si el envío será gratis, cotizado por USPS, tarifa plana manual o tarifa de respaldo
- incluir inventario
- incluir variantes y cantidades por variante, si aplican
- definir responsable de fulfillment y notas de empaque o entrega

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
| Slug | Sí | Minúsculas, con guiones y estable. Ejemplo: `picnic-de-medianoche`. |
| Nombre de creador/a | Sí | Nombre público. |
| Categoría | Sí | Ejemplo: `Cortometraje`, `Largometraje`, `Álbum`, `Fanzine`. |
| Meta | Sí | Monto en dólares enteros. |
| Fecha de inicio | Sí | Fecha pública real de lanzamiento. |
| Fecha límite | Sí | Fecha real de cierre. |
| Blurb corto | Sí | Una oración clara, idealmente 12 a 24 palabras. |
| Nivel destacado | Recomendado | El nivel de entrada más claro. |
| Correos de reportes | Recomendado | Correos que recibirán reportes de pledges y fulfillment. |
| Responsable de fulfillment | Recomendado | Quién entrega las recompensas si la campaña se cobra con éxito. |
| Editores del panel | Recomendado | Correos autorizados del equipo creador que deberían tener acceso solo a esta campaña. |
| Recordatorios de lanzamiento | Opcional | Si la campaña tiene periodo previo, decidir si se recogerán correos para un único recordatorio cuando abra. |

<figure class="creator-checklist-screenshot creator-checklist-screenshot--compact">
  <img src="/assets/images/checklists/creator-campaign-checklist/creator-facts.png" alt="Panel de datos de creador con imagen, nombre, categoría y enlace de embed." loading="lazy">
  <figcaption>Los metadatos básicos aparecen en la página pública, así que los huecos se notan.</figcaption>
</figure>

## Handoff del panel de administración

The Pool usa un panel privado para la edición normal de campañas y operaciones. Las personas creadoras no necesitan acceso directo al repositorio para los cambios soportados.

El panel puede gestionar:

- ajustes de campaña, fechas, blurbs, imágenes, video y opciones de envío
- contenido largo mediante el editor WYSIWYG de bloques
- niveles, artículos de apoyo, add-ons de campaña, stretch goals, entradas de diario y decisiones
- vistas previas de reportes, listas de patrocinadores, analytics, enlaces de marketing/referencia y accesos al constructor de embeds
- textos de compartir y entradas de social preview mediante los mismos campos de título, blurb, imagen hero y estado que se muestran en la página pública

Antes del lanzamiento, confirma:

- qué correos del equipo creador deben tener acceso específico a la campaña
- quién puede publicar cambios de campaña
- si una administradora de plataforma debe revisar los cambios antes del lanzamiento
- qué campos deben quedarse estables cuando ya existan enlaces públicos, especialmente slug, URL, precios, inventario, envío e impuestos

Notas operativas:

- Los IDs nuevos de niveles, artículos, add-ons, decisiones y variantes pueden derivarse del nombre o label en el panel; los IDs heredados deben mantenerse estables.
- Los borradores del editor son locales hasta que se guarden o publiquen, así que no deben tratarse como fuente de verdad.
- Publicar cambios de campaña o configuración pasa por el flujo de la plataforma y puede tardar en desplegarse.
- La gestión de usuarios es separada: los usuarios del panel se guardan en Worker KV y no crean commits en GitHub.
- El sign-in del panel puede pedir un desafío de Cloudflare Turnstile antes de enviar el magic link por email.
- Los formularios de recordatorio para campañas próximas también pueden usar Cloudflare Turnstile; las claves y secretos los configuran las personas operadoras de plataforma, no las creadoras.
- Las fechas de lanzamiento y cierre se interpretan en la zona horaria de plataforma configurada por una persona superadministradora, así que conviene confirmarla antes de publicar copy sensible a horario.

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
- **Optimización:** las cargas del panel preservan la fuente y el pipeline del repositorio puede generar imágenes comprimidas, variantes WebP responsivas y derivados WebM antes de lanzar

El pipeline de media de v1.0.3 puede crear variantes WebP de `320w`, `480w`, `960w` y `1600w` para páginas públicas cuando la imagen fuente es más grande. Aun así, conviene exportar las imágenes cerca de las dimensiones y recortes recomendados antes de subirlas.

El video debería responder:

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

El cuerpo largo puede incluir texto, citas, imágenes, galerías y embeds estructurados. Cada imagen pública debe traer alt text y, si ayuda, una leyenda.

Los embeds deben usar URLs `https://` de proveedores aprobados como YouTube, Vimeo, Spotify o Instagram. Cualquier proveedor nuevo debe revisarse antes de lanzar por seguridad, mobile y layout.

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
- preset de envío o medidas/peso explícitos, si es físico
- responsable de fulfillment

Notas importantes:

- los add-ons de campaña cuentan para el progreso de la campaña
- los add-ons de plataforma quedan separados como merch de la plataforma
- los add-ons físicos de campaña siguen las reglas de envío de esa campaña
- los reportes separan filas de campaña y filas de plataforma

## Promoción y embeds

The Pool incluye un constructor de embed:

- `/embed/campaign/?slug=tu-campaign-slug`
- `/es/embed/campaign/?slug=tu-campaign-slug`

El embed es un `iframe` vivo para sitios que aceptan HTML. Refleja el estado actual de la campaña, monto pledged, progreso, countdown, media y CTA. El mismo constructor también aparece dentro del tab Marketing del panel junto con herramientas para códigos de referencia y enlaces UTM guardados.

<figure class="creator-checklist-screenshot">
  <img src="/assets/images/checklists/creator-campaign-checklist/embed-builder.png" alt="Constructor de embed con controles de layout, tema, media, CTA, código y vista previa." loading="lazy">
  <figcaption>El constructor convierte la promoción en decisiones concretas: layout, tema, media, CTA y destino.</figcaption>
</figure>

Prepara:

- URL principal de campaña
- destinos donde se pegará el embed
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
- contactos de prensa o partners, si aplican

Los botones de compartir usan la URL pública de campaña y texto por estado donde se permite. Facebook y otros destinos centrados en preview dependen principalmente del Open Graph title, description e imagen de la campaña.

## Recompensas físicas y envío

Las recompensas físicas agregan inventario, costos, envío y fulfillment. Funcionan mejor cuando son simples, significativas y bien presupuestadas.

Para cualquier recompensa física o add-on físico, define:

- categoría física/digital
- preset de envío o peso/dimensiones
- inventario
- variantes, si aplican
- si califica para envío gratis
- si necesita tarifa plana específica de campaña
- si puede usar la tarifa de respaldo si USPS no está disponible
- si se ofrecerán opciones domésticas con firma o firma de adulto
- responsable de fulfillment y restricciones de origen

Modelo actual:

- USPS puede cotizar envíos nacionales e internacionales
- existen tarifas de respaldo configuradas
- una campaña puede forzar tarifa plana
- algunos presets simples pueden usar tarifas manuales
- puede haber envío gratis global o por campaña/item
- las opciones con firma se guardan en el pledge, email, Manage Pledge y reportes

Regla clave:

> No prometas un precio de envío en la copia si la configuración de campaña no lo hace cumplir.

## Impuestos y checkout

El checkout es verificado por servidor. El Worker reconstruye carrito, envío, impuestos, tips, add-ons y totales antes de iniciar el pago de Stripe.

La persona creadora no calcula impuestos, pero debe evitar prometer precios con impuesto incluido salvo que eso esté configurado.

El comportamiento actual puede incluir:

- tasa plana configurada
- reglas offline de respaldo
- soporte de New Mexico GRT
- soporte opcional de ZIP.TAX para forks
- visual provisional cuando todavía falta ubicación

En la práctica:

- el carrito puede mostrar impuesto como `--` hasta tener dirección suficiente
- el total final se recalcula en el Worker
- recompensas físicas deben pedir datos suficientes para envío e impuesto
- los reportes incluyen impuesto y envío guardados

## Reportes y fulfillment

Entrega:

- correos de reportes de campaña
- persona o equipo responsable de fulfillment
- si hay add-ons operados por plataforma
- notas especiales de empaque o entrega
- ventanas esperadas de entrega
- si las recompensas deben agruparse, separarse o procesarse en cierto orden

Comportamiento:

- el reporte de pledges es historial/ledger
- el reporte de fulfillment es vista actual por supporter y campaña
- el panel puede previsualizar y descargar CSVs de pledges o fulfillment sin enviar correos
- los add-ons de campaña se quedan con la campaña
- los add-ons de plataforma van al fulfillment de plataforma
- cambios y cancelaciones pueden aparecer como filas históricas, mientras fulfillment usa el estado actual

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
- correos de editoras o editores del panel, si el equipo creador necesita acceso directo
- destinos de embed/promoción para la semana de lanzamiento

## Checklist final

La campaña suele estar lista cuando:

- el título es claro
- el blurb es fuerte
- las imágenes principales están limpias y en tamaño correcto
- la página larga explica bien el proyecto
- el video pitch es conciso y persuasivo
- cada nivel se entiende rápido
- los add-ons están bien separados como campaña o plataforma
- cualquier recompensa física tiene envío, inventario, variantes y fulfillment
- envío gratis, tarifa plana, fallback y USPS están decididos
- la copia sobre impuestos no promete más que el checkout configurado
- reportes y fulfillment tienen responsables
- el acceso al panel y la responsabilidad de publicación están confirmados
- el embed fue probado en destinos de promoción
- los captions y el preview social se sienten apropiados para estados upcoming, live, funded y ended
- las imágenes tienen alt text
- no quedan secciones placeholder

</article>

<nav class="creator-checklist-toc" aria-labelledby="creator-checklist-toc-title">
  <h2 id="creator-checklist-toc-title">Contenido</h2>
  <ol>
    <li><a href="#qué-cambió-desde-v095">Cambios desde v0.9.5</a></li>
    <li><a href="#versión-rápida">Versión rápida</a></li>
    <li><a href="#qué-hace-que-una-campaña-se-sienta-completa">Campaña completa</a></li>
    <li><a href="#información-central">Información central</a></li>
    <li><a href="#handoff-del-panel-de-administración">Panel</a></li>
    <li><a href="#imágenes-y-video">Imágenes y video</a></li>
    <li><a href="#niveles-y-recompensas">Niveles</a></li>
    <li><a href="#add-ons">Add-ons</a></li>
    <li><a href="#promoción-y-embeds">Promoción y embeds</a></li>
    <li><a href="#recompensas-físicas-y-envío">Envío</a></li>
    <li><a href="#impuestos-y-checkout">Impuestos</a></li>
    <li><a href="#reportes-y-fulfillment">Reportes</a></li>
    <li><a href="#checklist-final">Checklist final</a></li>
  </ol>
</nav>
</div>
