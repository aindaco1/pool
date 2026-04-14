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

## Aportes de todo o nada

Cuando apoyas un proyecto en The Pool, tu tarjeta se guarda de forma segura a través de Stripe, pero **no se te cobra hasta que la campaña alcance su meta**. Si el proyecto no llega a su objetivo de financiación antes de la fecha límite, nunca se realizará el cobro.

Esto protege tanto a los patrocinadores como a los creadores: solo pagas por proyectos que realmente pueden alcanzar su meta de financiación.

## No necesitas crear una cuenta

A diferencia de otras plataformas, The Pool no te exige crear una cuenta. Cuando haces un aporte, recibes enlaces por correo electrónico para:

- **Gestionar tu aporte**: cancelar, modificar el importe o actualizar tu método de pago
- **Acceder a la comunidad de patrocinadores**: votar en decisiones creativas publicadas y ver actualizaciones exclusivas

Si tu pago incluye más de una campaña, recibirás correos de confirmación y enlaces de gestión separados para cada una. Solo guarda esos correos. Son tus llaves.

## Cómo funcionan los enlaces mágicos por correo

En lugar de pedirte que crees una contraseña, The Pool utiliza enlaces seguros por correo para comprobar que controlas un aporte.

- **Cada aporte tiene su propio enlace**: tu correo de confirmación incluye un enlace de gestión para ese aporte de campaña concreto.
- **Usa el enlace de gestión para hacer cambios**: desde ahí puedes revisar tu aporte, ajustarlo mientras la campaña siga activa, cancelarlo o actualizar tu tarjeta guardada.
- **Los enlaces de comunidad son solo para patrocinadores**: si una campaña tiene activada la votación comunitaria, el correo también incluye un enlace a la comunidad de patrocinadores de esa campaña.
- **Guarda el correo**: el enlace es la forma más rápida de volver a tu aporte más tarde. Si abres la página de comunidad en otro navegador o después de reiniciar tu sesión del navegador, volver a usar el enlace del correo es la forma más segura de recuperar el acceso.

Si apoyaste varias campañas en un mismo pago, aun así las gestionarás por separado después.

Para el acceso a la comunidad de patrocinadores, The Pool mantiene la sesión verificada del patrocinador en la sesión actual del navegador, en lugar de una cookie de acceso de larga duración. Si esa sesión caduca, volver a abrir el enlace del correo es la forma más segura de regresar.

## Entonces, ¿cómo funciona exactamente?

1. **Explora**: encuentra un proyecto que quieras apoyar
2. **Aporta**: añade una o más campañas a tu carrito, añade opcionalmente una propina del 0% al 15% para el mantenimiento de la plataforma y continúa al paso de pago seguro de The Pool con Stripe. Las recompensas físicas pueden añadir envío calculado por el Worker durante el pago, incluidas cotizaciones respaldadas por USPS, tarifas de respaldo configuradas u opciones de envío gratis cuando una implementación las habilita.
   También puedes ver complementos opcionales de la plataforma. Esos complementos apoyan directamente a Dust Wave, no cuentan para la meta de financiación de una campaña y pueden ser digitales o físicos. Cuando su inventario es limitado, el stock refleja los aportes guardados, no los carritos en curso.
   Algunas campañas también pueden ofrecer complementos de campaña. Esos complementos usan la misma interfaz de tarjetas de complementos, pero sí cuentan para el total de financiación de esa campaña y siguen las reglas de envío de esa campaña.
3. **Guarda la tarjeta**: Stripe guarda de forma segura tu método de pago dentro de ese flujo (todavía no se realiza ningún cobro)
4. **Espera**: la campaña continúa hasta su fecha límite (todas las horas están en horario de montaña)
5. **Resultado**: si una campaña se financia, se cobra tu aporte para esa campaña. Si no, no pasa nada.

Los múltiples aportes desde el mismo correo se combinan en un único cobro cuando la misma campaña tiene éxito. Las propinas opcionales para la plataforma y los complementos de la plataforma van a Dust Wave para ayudar a mantener The Pool y no cuentan para la meta de financiación del proyecto.

## Para creadores

The Pool está diseñado para cineastas y otros creativos, con funciones como:

- **0% de comisión de plataforma para organizadores**: los patrocinadores pueden añadir opcionalmente una propina del 0% al 15% para ayudar a sostener la plataforma sin reducir los fondos de la campaña
- **Pago de primera parte**: The Pool controla el carrito, los sidecars de pago y el flujo de revisión del aporte, mientras Stripe gestiona de forma segura los datos del pago
- **Niveles físicos y digitales**: ofrece recompensas tangibles con captura de dirección de envío durante el pago, soporte para cotizaciones respaldadas por USPS, controles de política de envío de respaldo o gratuito, e impuesto sobre ventas configurable
- **Complementos opcionales de la plataforma**: ofrece un pequeño catálogo global de merch junto con los aportes de campaña, con inventario por variante, avisos de poco stock basados en aportes guardados y soporte de envío para complementos físicos
- **Complementos opcionales de campaña**: permite que una campaña ofrezca merch propio mediante la misma interfaz de complementos en carrito y Gestionar aporte, mientras ese merch sigue contando para el subtotal de la campaña y usa sus reglas de envío
- **Fases de producción**: divide tu presupuesto en fases que los patrocinadores puedan financiar directamente
- **Metas ampliadas**: desbloquea posibilidades creativas adicionales a medida que crece la financiación
- **Decisiones comunitarias**: permite que tus patrocinadores voten sobre decisiones creativas publicadas
- **Diario de producción**: mantén a tu comunidad implicada con actualizaciones
- **Apoyo continuo**: acepta contribuciones después de que tu campaña principal termine
- **Acceso sin cuenta para patrocinadores**: los patrocinadores gestionan aportes y se unen a páginas exclusivas de la comunidad mediante enlaces mágicos por correo, en lugar de crear cuentas
- **Flujos para patrocinadores listos para varios idiomas**: las cadenas compartidas de la interfaz, las páginas de resultado del aporte, `/manage/`, las rutas de la comunidad de patrocinadores y los correos para patrocinadores pueden seguir el modelo de idioma configurado para la implementación, con inglés como base y otros idiomas añadidos mediante configuración más contenido traducido
- **Contenido enriquecido más seguro**: el texto de campaña y las entradas del diario admiten Markdown e incrustaciones aprobadas, mientras que el HTML sin procesar inseguro y los esquemas peligrosos de enlaces o incrustaciones se bloquean al renderizarse
- **Interfaz con accesibilidad como base**: diálogos, pestañas, deslizadores, flujos de comunidad y acciones públicas de campaña compatibles con teclado forman parte de la base de la plataforma, con comprobaciones automatizadas de accesibilidad sobre páginas públicas críticas, estados de resultado del aporte y flujos de pago

## La tecnología

The Pool funciona sobre una arquitectura estática moderna:

| Capa | Plataforma | Función |
|-------|----------|------|
| Frontend | [GitHub Pages](https://docs.github.com/en/pages) | Sitio estático con Jekyll |
| Carrito | The Pool | Carrito propio, sidecars de pago y revisión del aporte |
| Pagos | [Stripe](https://stripe.com) | Campos de pago seguros, tarjetas guardadas y cobros fuera de sesión |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com) | Precios canónicos, almacenamiento de aportes, estadísticas en vivo, datos de cumplimiento y liquidación |
| Correo | [Resend](https://resend.com) | Confirmaciones, actualizaciones y notificaciones |

La plataforma está construida sobre servicios que ofrecen niveles gratuitos, y The Pool fue diseñado desde el principio para funcionar eficazmente dentro de esos niveles gratuitos siempre que sea posible.

Para los forks, eso significa que las páginas estáticas permanecen en GitHub Pages, las lecturas públicas en vivo se combinan de forma agresiva y se cachean en el navegador, y la mayor parte del uso de Cloudflare Workers se reserva para las partes del ciclo de vida del aporte que son sensibles desde el punto de vista de la seguridad, mientras que la configuración de impuestos, envío, SEO y logging se mantiene reflejada o acotada mediante la configuración para que la interfaz local, el pago, los informes y los correos se mantengan alineados.

Esa arquitectura también deja margen para endurecer la accesibilidad sin sacrificar el modelo de seguridad de la plataforma: los flujos de carrito, pago y gestión usan semántica reforzada para diálogos, foco, teclado y regiones en vivo, mientras Stripe sigue siendo el dueño de los campos sensibles de pago dentro de su interfaz segura.

La parte pública también está pensada para ser rastreable sin exponer el acceso exclusivo para patrocinadores: las páginas públicas y las páginas de campaña emiten metadatos coherentes y datos estructurados conservadores, mientras que las páginas privadas con enlaces mágicos, como Gestionar aporte y los flujos de comunidad para patrocinadores, quedan fuera de la indexación de búsqueda.

## Código abierto

The Pool es de código abierto. Toda la plataforma, frontend, Worker y automatización, está disponible en GitHub.

**Código fuente:** [github.com/aindaco1/pool](https://github.com/aindaco1/pool)

---

*The Pool es creado y mantenido por [Dust Wave](https://dustwave.xyz).*
