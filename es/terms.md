---
layout: default
title: Términos y pautas creativas
lang: es
translation_key: terms
permalink: /es/terms/
---

# Términos y pautas creativas

## Términos del aporte

- Todos los aportes son **de todo o nada**. Tu tarjeta se guarda de forma segura, pero se cobra **solo si** la campaña alcanza su meta antes de la fecha límite.
- Si una campaña no alcanza su objetivo de financiación, no se realizará ningún cobro en tu tarjeta.
- Puedes modificar o cancelar tu aporte en cualquier momento antes de que termine la campaña usando el enlace mágico de tu correo de confirmación.
- **No se requiere cuenta**: gestiona tu aporte por completo mediante enlaces de correo electrónico.
- Un mismo pago puede incluir más de una campaña, pero cada campaña se guarda y se gestiona como un aporte independiente después del pago.
- Todas las fechas límite de campaña usan horario de montaña (MST/MDT).
- Los votos de comunidad se limitan a las opciones publicadas en la página de patrocinadores de la campaña, y las decisiones cerradas no aceptan nuevos votos.
- Si un enlace de gestión apunta a un aporte que ya no existe, The Pool lo trata como no disponible en lugar de reconstruir un acceso de marcador de posición.

## Procesamiento de pagos

- Los datos de tu tarjeta son gestionados por **los campos de pago seguros de Stripe** integrados en el flujo de pago de The Pool. No almacenamos números completos de tarjeta ni valores CVC. No se realiza ningún cobro hasta que la campaña tenga éxito.
- Si una campaña se financia, todos los aportes del mismo correo para esa campaña se combinan en un único cobro.
- Puedes añadir una **propina opcional para la plataforma** de entre 0% y 15% durante el pago. La propina predeterminada es del 5%.
- Las propinas opcionales ayudan al mantenimiento de The Pool y se incluyen en el total de tu aporte, pero **no cuentan para la meta de financiación de la campaña**.
- El impuesto sobre las ventas se aplica a los aportes usando la tasa configurada para esta implementación.
- Los aportes con productos físicos incluyen una tarifa fija de envío por campaña que contenga artículos físicos. Tu dirección de envío se recoge durante el pago para poder completar esas recompensas.

## Control creativo y envíos

Esta sección solo se aplica a campañas que solicitan expresamente aportes creativos (por ejemplo, derechos de nombramiento, ideas de historia o mensajes personalizados). Si una campaña no incluye niveles basados en envíos, esta sección no se aplica a tu aporte.

- Nos otorgas una licencia amplia e irrevocable para usar los medios o textos enviados dentro de la producción.
- Conservamos la discreción creativa; se rechazarán instrucciones inseguras, ilegales, difamatorias o inviables.
- Los envíos deben cumplir nuestras pautas de contenido (sin discurso de odio, acoso o contenido ilegal).
- Nos reservamos el derecho de adaptar o modificar los envíos para que encajen con la visión creativa y las limitaciones de producción.

## Cumplimiento y entrega

- Los plazos de entrega pueden ajustarse según la realidad de la producción.
- Proporcionaremos actualizaciones periódicas sobre el progreso de la producción y los plazos de entrega.
- Las recompensas digitales se entregarán por correo electrónico a la dirección proporcionada durante el aporte.
- Las recompensas físicas se envían a la dirección recogida durante el pago. Una tarifa fija de envío por campaña física se incluye en el total del aporte.

## Reembolsos y cancelaciones

- **Antes de la financiación:** puedes cancelar en cualquier momento mediante tu enlace de gestión del aporte. No se realizará ningún cobro.
- **Después de la financiación:** una vez que una campaña alcanza su meta y se procesan los cobros, los reembolsos se gestionan caso por caso.
- Los aportes cancelados nunca se cobran.
- Contáctanos en support@dustwave.xyz para solicitudes de reembolso o incidencias.

## Privacidad y datos

- Solo recopilamos la información necesaria para procesar aportes y completar recompensas: correo electrónico, nombre, detalles del aporte o pedido y, para niveles con productos físicos, una dirección de envío.
- Los datos completos de tarjeta son gestionados y almacenados por Stripe. The Pool no almacena números completos de tarjeta ni valores CVC.
- Las direcciones de correo electrónico y cualquier dato de envío necesario para el cumplimiento pueden almacenarse en nuestro sistema para la gestión del aporte, confirmaciones específicas de campaña, actualizaciones de campaña y cumplimiento de recompensas.
- El acceso a la comunidad de patrocinadores en el navegador puede recordarse durante la sesión actual como una comodidad, pero el enlace mágico enviado por correo sigue siendo la fuente de verdad para el acceso.
- No vendemos ni compartimos tu información con terceros salvo cuando sea necesario para el procesamiento del pago y la entrega del correo.

## Plataforma y tecnología

The Pool es una [plataforma de crowdfunding de código abierto](https://github.com/aindaco1/pool) construida con:

- **Jekyll en [GitHub Pages](https://docs.github.com/en/pages)**: generación de sitio estático
- **El runtime de carrito de The Pool**: gestión propia del carrito, sidecars de pago y revisión del aporte
- **[Stripe](https://stripe.com)**: campos de pago seguros, métodos de pago guardados y procesamiento de pagos
- **[Cloudflare Workers](https://workers.cloudflare.com)**: API backend para validación canónica de aportes, almacenamiento de aportes, estadísticas en vivo y liquidación automatizada de campañas
- **[Resend](https://resend.com)**: correos transaccionales (confirmaciones, actualizaciones y notificaciones de cobro)

Los datos de los aportes se almacenan en Cloudflare KV. Esta arquitectura implica menores costes operativos y hace que una mayor parte de tu aporte vaya directamente al proyecto, con las propinas opcionales ayudando a cubrir el mantenimiento de The Pool.

## Preguntas

Si tienes preguntas sobre estos términos o sobre tu aporte, escribe a support@dustwave.xyz.

---

_Última actualización: abril de 2026_
