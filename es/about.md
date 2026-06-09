---
layout: default
title: ¿Qué es esto?
lang: es
translation_key: about
permalink: /es/about/
description: Aprende cómo funciona The Pool, desde los aportes todo o nada hasta el acceso mediante enlaces mágicos por correo.
---

# ¿Qué es The Pool?

**The Pool** es la plataforma de crowdfunding de Dust Wave para cine independiente y proyectos creativos, construida sobre tecnología de código abierto.

El hito de lanzamiento actual de la plataforma es **v1.0.3**. El conjunto de funciones de v1.0 y el endurecimiento de lanzamiento ya están completos, y la versión más reciente se enfoca en zona horaria configurable, recordatorios opt-in para campañas próximas, presupuestos de Cloudflare KV, liquidación de campañas más segura, performance móvil, enlaces de diario y flujos de media del panel.

## Aportes de todo o nada

Cuando apoyas un proyecto en The Pool, tu tarjeta se guarda de forma segura a través de Stripe, pero **no se te cobra hasta que la campaña alcance su meta**. Si el proyecto no llega a su objetivo de financiación antes de la fecha límite, nunca se realizará el cobro.

Esto protege tanto a los patrocinadores como a los creadores: solo pagas por proyectos que realmente pueden alcanzar su meta de financiación.

## No necesitas crear una cuenta

A diferencia de otras plataformas, The Pool no te exige crear una cuenta. Cuando haces un aporte, recibes enlaces por correo electrónico para:

- **Gestionar tu aporte**: cancelar, modificar el importe o actualizar tu método de pago
- **Acceder a la comunidad de patrocinadores**: votar en decisiones creativas publicadas y ver actualizaciones exclusivas

Si tu pago incluye más de una campaña, recibirás correos de confirmación y enlaces de gestión separados para cada una. Solo guarda esos correos. Son tus llaves.

Para campañas que aún no han lanzado, también puedes apuntarte a un recordatorio único de lanzamiento sin crear una cuenta ni iniciar un aporte.

## Cómo funcionan los enlaces mágicos por correo

En lugar de pedirte que crees una contraseña, The Pool utiliza enlaces seguros por correo para comprobar que controlas un aporte.

- **Cada aporte tiene su propio enlace**: tu correo de confirmación incluye un enlace de gestión para ese aporte de campaña concreto.
- **Usa el enlace de gestión para hacer cambios**: desde ahí puedes revisar tu aporte, ajustarlo mientras la campaña siga activa, cancelarlo o actualizar tu tarjeta guardada.
- **Los enlaces de comunidad son solo para patrocinadores**: si una campaña tiene activada la votación comunitaria, el correo también incluye un enlace a la comunidad de patrocinadores de esa campaña.
- **Los recordatorios de lanzamiento son independientes**: si optas por recibir un recordatorio para una campaña próxima, The Pool envía un solo correo cuando esa campaña se activa e incluye un enlace para cancelar ese recordatorio.
- **Guarda el correo**: el enlace es la forma más rápida de volver a tu aporte más tarde. Si abres la página de comunidad en otro navegador o después de reiniciar tu sesión del navegador, volver a usar el enlace del correo es la forma más segura de recuperar el acceso.

Si apoyaste varias campañas en un mismo pago, aun así las gestionarás por separado después.

Para el acceso a la comunidad de patrocinadores, The Pool mantiene la sesión verificada del patrocinador en la sesión actual del navegador, en lugar de una cookie de acceso de larga duración. Si esa sesión caduca, volver a abrir el enlace del correo es la forma más segura de regresar.

## Entonces, ¿cómo funciona exactamente?

1. **Explora**: encuentra una campaña que quieras ayudar a hacer realidad.
2. **Arma tu aporte**: añade una o más campañas a tu carrito, elige recompensas o add-ons si quieres, y decide si quieres incluir una propina opcional para la plataforma. Si tu aporte incluye artículos físicos, el checkout muestra envío e impuestos cuando tiene suficiente información para calcularlos.
3. **Guarda tu método de pago**: ingresa los datos de pago mediante Stripe. La tarjeta se guarda de forma segura, pero no se cobra cuando haces el aporte.
4. **Sigue la campaña**: la campaña queda abierta hasta su fecha límite, mostrada en la zona horaria configurada para la plataforma.
5. **Mira el resultado**: si la campaña alcanza su meta, tu aporte se cobra después de que termine. Si no alcanza su meta, no se te cobra.

Algunos checkouts pueden incluir add-ons de plataforma, add-ons de campaña, mejoras de entrega, tarifas de envío, impuestos o una propina opcional para la plataforma. El checkout explica qué cuenta para la meta de la campaña y qué apoya a la plataforma por separado.

Los múltiples aportes desde el mismo correo se combinan en un único cobro cuando la misma campaña tiene éxito. Si más de una campaña del mismo pago tiene éxito, esos cobros siguen separados por campaña. Las propinas opcionales y los add-ons de plataforma apoyan al equipo que opera la plataforma y no cuentan para la meta de financiación del proyecto.

## Compartir y performance

Las páginas de campaña están diseñadas para compartirse fácilmente sin convertir flujos privados de patrocinadores en enlaces públicos.

- **Enlaces integrados para compartir**: las páginas de campaña incluyen destinos para Bluesky, X, Threads, Facebook, SMS y email. Usan la URL pública de campaña y texto según el estado cuando la plataforma destino permite mensaje.
- **Previews enriquecidos**: los enlaces públicos de campaña emiten metadatos Open Graph y Twitter, además de imágenes de share card compatibles con crawlers, para que las plataformas sociales muestren un preview útil.
- **Los enlaces privados siguen privados**: Gestionar aporte, comunidad de patrocinadores, checkout, admin y enlaces con tokens quedan fuera de la intención pública de compartir e indexar.
- **Primera carga más rápida**: las barras de progreso e hitos de campaña renderizan posiciones estables antes de que termine JavaScript, las variantes responsivas reducen descargas de imagen en móvil, los videos hero de YouTube esperan intención de reproducción antes de cargar el embed remoto, el CSS/JS generado se minifica para producción y el runtime completo del carrito espera hasta que haya estado de carrito o intención del patrocinador.
- **Prefetch conservador**: las páginas públicas pueden prefetch rutas públicas probables del mismo origen después de hover, foco o toque, pero se excluyen enlaces privados, checkout, admin, comunidad de patrocinadores, externos y con parámetros sensibles.

## Para creadores

La plataforma está diseñada para cineastas y equipos creativos que necesitan una campaña que puedan operar sin mandar a sus patrocinadores por un laberinto de cuentas, plugins o herramientas desconectadas.

- **Sin comisión de plataforma para organizadores**: los fondos de campaña se quedan con el proyecto. Los patrocinadores pueden elegir una propina opcional del 0% al 15% para sostener The Pool sin reducir el financiamiento de la campaña.
- **Checkout de aportes integrado**: los patrocinadores aportan mediante el carrito y la revisión de The Pool, mientras Stripe gestiona de forma segura los datos de pago para cualquier cobro posterior de la campaña.
- **Niveles de recompensa que se adaptan al proyecto**: ofrece niveles digitales o físicos, recoge datos de envío cuando haga falta, define límites de cantidad y usa las reglas de impuestos y envío configuradas para la campaña.
- **Add-ons opcionales de plataforma**: ofrece merch de plataforma junto con los aportes cuando esté habilitado, con inventario y envío separados que no cuentan para la meta de financiación de la campaña.
- **Add-ons de campaña**: vende merch o extras específicos de la campaña en el mismo flujo de aporte, manteniendo ingresos, inventario y envío ligados a esa campaña.
- **Panel privado de administración**: da a personas de confianza un espacio enfocado para ajustes de campaña, contenido de página, recompensas, actualizaciones, decisiones, reportes, patrocinadores, analytics y enlaces de marketing.
- **Zona horaria configurable de plataforma**: las personas superadministradoras pueden elegir la zona horaria IANA usada para fechas límite, cuentas regresivas, reportes programados y automatización del ciclo de vida.
- **Cargas de media en el panel**: prepara imágenes, video y audio de campaña o diario con previews, publícalos en las rutas de assets de campaña, activa la optimización de imágenes/video y limpia media del panel que ya no esté referenciada.
- **Reportes cuando los necesites**: previsualiza y descarga CSVs de aportes o fulfillment desde el panel, con correos opcionales para responsables de campaña mientras la campaña está activa.
- **Recordatorios para campañas próximas**: permite que posibles patrocinadores opten por un solo correo de lanzamiento antes de que una campaña abra, sin cuentas ni dependencias de lista de correo.
- **Embeds para promoción**: genera widgets vivos de campaña para sitios aliados, páginas de prensa, portfolios de creadores o páginas de patrocinadores.
- **Enlaces para compartir y previews sociales**: ofrece a patrocinadores destinos claros para compartir mientras las imágenes y descripciones de preview se mantienen alineadas con el estado actual de la campaña.
- **Fases de producción**: muestra a los patrocinadores qué partes del presupuesto pueden ayudar a financiar.
- **Metas ampliadas**: haz visibles hitos creativos adicionales a medida que crece el apoyo.
- **Decisiones comunitarias**: invita a los patrocinadores a votar sobre decisiones creativas seleccionadas.
- **Diario de producción**: comparte actualizaciones que mantienen a la comunidad implicada desde el lanzamiento hasta el fulfillment.
- **Apoyo continuo**: sigue aceptando apoyo después de la campaña principal cuando la campaña esté configurada para ello.
- **Acceso sin cuenta para patrocinadores**: los patrocinadores gestionan aportes y visitan páginas exclusivas mediante enlaces seguros por correo, sin crear otra contraseña.
- **Flujos para varios idiomas**: empieza con inglés y añade páginas, correos, contenido de campaña y pantallas de gestión traducidas cuando una implementación necesite más idiomas.
- **Contenido enriquecido más seguro**: escribe páginas de campaña y entradas de diario con Markdown e incrustaciones aprobadas, con HTML inseguro y enlaces peligrosos bloqueados al renderizar.
- **Experiencia pensada para accesibilidad**: páginas de campaña, checkout, diálogos, pestañas, deslizadores y flujos de patrocinadores se construyen y prueban para uso con teclado y lectores de pantalla.

## La tecnología

The Pool es una plataforma de crowdfunding con arquitectura static-first. Las páginas públicas se generan con anticipación, mientras el trabajo confiable de servidor queda detrás de Cloudflare Workers para precios, aportes, acceso administrativo, datos de fulfillment y liquidación serializada.

| Área | Qué lo ejecuta | Por qué importa para forks |
|------|----------------|----------------------------|
| Sitio público | [GitHub Pages](https://docs.github.com/en/pages) y Jekyll | Las páginas de campaña, docs, contenido traducido y metadatos públicos siguen siendo fáciles de alojar y revisar en Git. |
| Experiencia de aporte | Runtime de carrito de The Pool | El carrito, selección de recompensas, add-ons, revisión del aporte y gestión por enlaces mágicos siguen siendo de primera parte. |
| Pagos | [Stripe](https://stripe.com) | Stripe controla los campos sensibles de pago, métodos guardados y cobros posteriores. |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com) y KV | El Worker valida totales, guarda aportes, sirve estadísticas en vivo, alimenta APIs del panel y maneja fulfillment más estado de liquidación por campaña. |
| Panel de administración | Panel privado de The Pool | Las personas autorizadas pueden gestionar campañas, contenido, reportes, patrocinadores, analytics, enlaces de marketing, add-ons y usuarios sin editar archivos directamente. |
| Correo | [Resend](https://resend.com) | Confirmaciones, enlaces de patrocinador, recordatorios de lanzamiento, actualizaciones de campaña y avisos de cobro usan una sola ruta de correo transaccional. |

El stack está pensado para equipos pequeños y forks. Cada servicio principal ofrece un nivel gratuito, y la plataforma evita trabajo dinámico innecesario siempre que puede. Las páginas públicas de campaña son estáticas, los datos públicos en vivo se combinan y se cachean en el navegador, y el Worker se reserva para operaciones que necesitan confianza del servidor.

El modelo de performance pública sigue siendo static-first. El sitio minifica los assets generados, deja la compresión de transferencia a Cloudflare, reserva espacio estable para progreso y media de campaña, sirve variantes responsivas de imagen cuando existen, difiere los embeds hero remotos de YouTube hasta que haya intención de reproducción y retrasa el código pesado del carrito hasta que realmente hace falta.

El panel de administración sigue la misma disciplina de costes. Navegación, filtros, vistas previas, analytics, reportes y borradores locales evitan escrituras a KV. Las escrituras durables ocurren solo cuando una persona administradora guarda estado propio del panel o publica cambios de campaña/plataforma.

La personalización se controla principalmente por configuración. Impuestos, envío, SEO, localización, zona horaria de plataforma, logging, identidad de correo, ajustes del panel, branding público, estilo del checkout y presentación de correos para patrocinadores se mantienen alineados por config para que un fork pueda cambiar la presentación sin reescribir el modelo de aportes.

Para desarrolladores, los límites son intencionalmente claros: el contenido estático pertenece al sitio, los cálculos confiables de aportes pertenecen al Worker, los datos de pago pertenecen a Stripe, el correo transaccional pertenece a Resend y las operaciones por rol pertenecen al panel de administración.

La misma arquitectura permite trabajar accesibilidad y SEO sin debilitar la seguridad. Las páginas públicas emiten metadatos rastreables y datos estructurados conservadores, mientras que las páginas privadas con enlaces mágicos, como Gestionar aporte, las comunidades de patrocinadores y el panel de administración, quedan fuera de la indexación de búsqueda. Los flujos de checkout y gestión añaden comportamiento de teclado, foco, diálogos, regiones en vivo y landmarks alrededor de la UI segura de Stripe en lugar de reemplazarla.

## Código abierto

The Pool es de código abierto. Toda la plataforma, el frontend, el Worker, la automatización y la superficie de personalización para forks están disponibles en GitHub.

**Código fuente:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool ha sido creado y es mantenido por [Dust Wave](https://dustwave.xyz).*

_Última actualización: 9 de junio de 2026_
