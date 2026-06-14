---
layout: default
title: Términos y pautas creativas
lang: es
translation_key: terms
permalink: /es/terms/
description: Revisa los términos de aporte, el procesamiento de pagos, el cumplimiento y la privacidad en The Pool.
---

# Términos y pautas creativas

Estos términos reflejan el hito de lanzamiento **v1.0.5** de la plataforma The Pool.

## Términos del aporte

- Todos los aportes son **de todo o nada**. Tu tarjeta se guarda de forma segura, pero se cobra **solo si** la campaña alcanza su meta antes de la fecha límite.
- Si una campaña no alcanza su objetivo de financiación, no se realizará ningún cobro en tu tarjeta.
- Puedes modificar o cancelar tu aporte en cualquier momento antes de que termine la campaña usando el enlace mágico de tu correo de confirmación.
- **No se requiere cuenta**: gestiona tu aporte por completo mediante enlaces de correo electrónico.
- Cuando esta implementación ofrece idiomas adicionales, esos enlaces enviados por correo para el aporte y la comunidad de patrocinadores pueden usar rutas localizadas sin dejar de autorizar el mismo aporte.
- Un mismo pago puede incluir más de una campaña, pero cada campaña se guarda y se gestiona como un aporte independiente después del pago.
- Los recordatorios de lanzamiento para campañas próximas son opcionales e independientes del aporte. Si te apuntas, The Pool envía un solo recordatorio cuando esa campaña se activa e incluye un enlace para cancelar ese recordatorio.
- Algunas campañas pueden compartirse de forma privada antes del lanzamiento mediante enlaces de vista previa protegida. Los enlaces para revisoras son solo por invitación, limitados a una campaña y vencen después de 24 horas.
- Todas las fechas límite de campaña usan la zona horaria configurada para esta implementación. Esta implementación usa `America/Denver` de forma predeterminada, salvo que las personas administradoras de plataforma la cambien.
- Los votos de comunidad se limitan a las opciones publicadas en la página de patrocinadores de la campaña, y las decisiones cerradas no aceptan nuevos votos.
- Si un enlace de gestión apunta a un aporte que ya no existe, The Pool lo trata como no disponible en lugar de reconstruir un acceso de marcador de posición.
- Las páginas públicas de campaña pueden incluir enlaces para compartir en plataformas externas, SMS y email. Esos enlaces son solo para URLs públicas de campaña y no incluyen tokens de gestión de aportes, checkout, comunidad de patrocinadores, admin ni magic links.

## Procesamiento de pagos

- Los datos de tu tarjeta son gestionados por **los campos de pago seguros de Stripe** integrados en el flujo de pago de The Pool. No almacenamos números completos de tarjeta ni valores CVC. No se realiza ningún cobro hasta que la campaña tenga éxito.
- Si una campaña se financia, todos los aportes del mismo correo para esa campaña se combinan en un único cobro.
- Si un mismo pago incluye más de una campaña financiada, cada campaña financiada puede generar su propio cobro porque los aportes y la liquidación están separados por campaña.
- Puedes añadir una **propina opcional para la plataforma** de entre 0% y 15% durante el pago. La propina predeterminada es del 5%.
- Las propinas opcionales ayudan al mantenimiento de The Pool y se incluyen en el total de tu aporte, pero **no cuentan para la meta de financiación de la campaña**.
- Esta implementación también puede ofrecer **complementos opcionales de la plataforma** junto con un aporte. Los complementos de la plataforma ayudan al mantenimiento de The Pool, se incluyen en el total de tu aporte y **no cuentan para la meta de financiación de la campaña**.
- Una campaña también puede ofrecer **complementos opcionales de campaña** junto con sus niveles. Los complementos de campaña se incluyen en el total de tu aporte, **sí cuentan para la meta de financiación de esa campaña** y permanecen asociados a esa campaña para informes y cumplimiento.
- El impuesto sobre las ventas se aplica según las reglas fiscales configuradas para esta implementación. Dependiendo de la implementación, eso puede significar una tasa fija configurada o un cálculo fiscal según la ubicación basado en la dirección de facturación o envío que proporciones durante el pago o más tarde al modificar el aporte.
- Los aportes con productos físicos, los complementos físicos de campaña o los complementos físicos de la plataforma pueden incluir cargos de envío configurados para esta implementación. Según la configuración de esta implementación y de la campaña, el envío puede cotizarse desde USPS, usar una tarifa de respaldo configurada, incluir anulaciones de envío gratis u ofrecer opciones limitadas de mejora con firma para envíos nacionales. Los complementos de campaña siguen las reglas de envío de su campaña; los complementos físicos de la plataforma pueden cobrarse como un envío de plataforma separado. Tu dirección de envío se recoge durante el pago para poder completar esas recompensas.
- En algunos carritos solo digitales o mixtos, The Pool también puede pedir suficiente información de ubicación de facturación para calcular el impuesto antes de finalizar el total del aporte. Si todavía no hay un resultado fiscal preciso, el carrito puede mostrar el impuesto como una estimación hasta que el pago tenga suficiente detalle de destino.
- Si hay una opción de entrega disponible para tu envío y la cambias en el pago o en Gestionar aporte, el total de envío guardado y el total del aporte se recalculan a partir del estado guardado del aporte antes de persistir el cambio.
- Si modificas un aporte, The Pool recalcula los totales a partir del estado guardado del aporte y de las definiciones de campaña o complemento vigentes en esa implementación, en lugar de confiar en importes enviados por el navegador.
- Los correos transaccionales y los enlaces de acceso para patrocinadores pueden reflejar la marca configurada para esta implementación y su estructura de rutas localizadas, pero cada enlace de gestión enviado por correo sigue autorizando solo el aporte vinculado a ese pedido específico.
- Los reportes programados para responsables de campaña, los cambios de estado de campaña y las comprobaciones de liquidación usan la misma zona horaria configurada que las fechas límite de campaña. Las comprobaciones de liquidación se serializan por campaña para evitar cobros duplicados de una campaña.

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
- Las recompensas físicas, los complementos físicos de campaña y los complementos físicos de la plataforma se envían a la dirección recogida durante el pago. Cualquier cargo de envío mostrado durante el pago se guarda con el aporte y se incluye en el total de tu aporte.

## Reembolsos y cancelaciones

- **Antes de la financiación:** puedes cancelar en cualquier momento mediante tu enlace de gestión del aporte. No se realizará ningún cobro.
- **Después de la financiación:** una vez que una campaña alcanza su meta y se procesan los cobros, los reembolsos se gestionan caso por caso.
- Los aportes cancelados nunca se cobran.
- Contáctanos en info@dustwave.xyz para solicitudes de reembolso o incidencias.

## Privacidad y datos

- Solo recopilamos la información necesaria para procesar aportes y completar recompensas: correo electrónico, nombre, detalles del aporte o pedido y, para recompensas físicas, complementos físicos de campaña o complementos físicos de la plataforma, una dirección de envío.
- Los datos completos de tarjeta son gestionados y almacenados por Stripe. The Pool no almacena números completos de tarjeta ni valores CVC.
- Las direcciones de correo electrónico y cualquier dato de envío necesario para el cumplimiento pueden almacenarse en nuestro sistema para la gestión del aporte, confirmaciones específicas de campaña, actualizaciones de campaña y cumplimiento de recompensas.
- Si te apuntas a un recordatorio de lanzamiento para una campaña próxima, tu correo se guarda en registros de recordatorio limitados a esa campaña para que The Pool pueda enviar ese único recordatorio, evitar duplicados y respetar cancelaciones de ese recordatorio. Los formularios de recordatorio pueden usar Cloudflare Turnstile para reducir abuso.
- Las personas organizadoras de campañas pueden recibir informes por campaña o exportaciones de cumplimiento con los datos de apoyo y pedido necesarios para operar esa campaña concreta, coordinar la entrega o enviar actualizaciones relacionadas con la producción. Esos informes se limitan a la campaña que apoyaste y no exponen aportes de campañas no relacionadas.
- Las personas operadoras autorizadas también pueden ver filas de patrocinadores, reportes, analytics, datos de fulfillment y contenido de campaña desde el panel privado de administración de The Pool. El acceso del panel está limitado por rol: las personas usuarias de campaña solo ven las campañas asignadas, mientras que las administradoras de plataforma pueden ver datos operativos de toda la plataforma necesarios para operar The Pool.
- Las personas operadoras autorizadas pueden usar vistas previas protegidas para revisar páginas de campaña en borrador antes del lanzamiento. Las listas de correos de revisoras explícitas se guardan solo durante la ventana breve de preview y no están pensadas para páginas públicas de campaña.
- Si una campaña es archivada por una persona administradora autorizada de la plataforma, los datos fuente de la campaña y los medios subidos propiedad de esa campaña pueden conservarse en el archivo del repositorio como registros operativos en lugar de eliminarse.
- Cuando un aporte incluye complementos cumplidos por la plataforma, las operadoras de la plataforma pueden recibir por separado exportaciones de cumplimiento limitadas únicamente a los artículos que deben entregar.
- Las administradoras de plataforma pueden usar el panel para gestionar configuración de campañas, ajustes de plataforma, complementos, enlaces de referencia y personas usuarias autorizadas del panel. Los valores secretos se mantienen en almacenes de secretos de despliegue o archivos locales ignorados, no en contenido de campaña ni en borradores del panel.
- Los complementos de la plataforma con inventario limitado usan el estado de los aportes guardados, no los borradores en curso del carrito, para determinar el stock restante.
- Los complementos de campaña con inventario limitado también usan el estado de los aportes guardados, no los borradores en curso del carrito, para determinar el stock restante.
- El acceso a la comunidad de patrocinadores en el navegador puede recordarse durante la sesión actual como una comodidad, pero el enlace mágico enviado por correo sigue siendo la fuente de verdad para el acceso.
- Las páginas públicas pueden prefetch páginas públicas elegibles del mismo origen después de hover, foco o toque para que la navegación normal sea más rápida. Este comportamiento excluye enlaces de admin, checkout, Gestionar aporte, comunidad de patrocinadores, enlaces con tokens, externos y con parámetros sensibles.
- Las páginas de vista previa protegida son superficies privadas de revisión. Se excluyen del sitemap público, de previews sociales y de la intención de indexación hasta que una campaña se lance públicamente.
- Las páginas públicas de campaña pueden diferir algunos embeds de terceros, como videos hero de YouTube, hasta que elijas reproducirlos. Hasta entonces, la página puede mostrar una imagen local de poster en lugar de contactar a ese proveedor externo.
- Los enlaces para compartir campañas pueden preservar parámetros públicos seguros de referencia o UTM para que responsables de campaña entiendan el origen de la promoción pública. No preservan parámetros de token, pedido, email, sesión u otros datos sensibles.
- Las personas operadoras autorizadas de la plataforma pueden cargar el estado de uso de planes de Cloudflare y Resend en el panel privado. Esas comprobaciones usan credenciales del servidor y no envían detalles de aportes, correos de patrocinadores, direcciones de envío ni datos de pago a los endpoints de uso.
- No vendemos tu información. Solo la compartimos cuando es necesario para el procesamiento del pago, la entrega de correos transaccionales, la prevención de abuso, el cálculo de cotizaciones de envío y el cumplimiento de recompensas.

## Plataforma y tecnología

The Pool es una [plataforma de crowdfunding de código abierto](https://github.com/aindaco1/pool) creada con:

- **Jekyll en [GitHub Pages](https://docs.github.com/en/pages)**: generación de sitio estático
- **El runtime de carrito de The Pool**: gestión propia del carrito, sidecars de pago, revisión del aporte y carga diferida en páginas públicas hasta que haya estado de carrito o intención del patrocinador
- **[Stripe](https://stripe.com)**: campos de pago seguros, métodos de pago guardados y procesamiento de pagos
- **[Cloudflare Workers](https://workers.cloudflare.com)**: API backend para validación canónica de aportes, almacenamiento de aportes, estadísticas en vivo y liquidación automatizada de campañas
- **Panel privado de administración**: edición de campañas por rol, vistas previas protegidas, creación de campañas nuevas, reportes, analytics, vistas de patrocinadores, enlaces de marketing, gestión de usuarios y operaciones de plataforma
- **[Resend](https://resend.com)**: correos transaccionales (confirmaciones, recordatorios de lanzamiento, actualizaciones y notificaciones de cobro)

Los datos de los aportes se almacenan en Cloudflare KV. Esta arquitectura implica menores costes operativos y hace que una mayor parte de tu aporte vaya directamente al proyecto, con las propinas opcionales ayudando a cubrir el mantenimiento de The Pool. Las compilaciones de producción también minifican los assets CSS/JS generados después de crear el sitio estático, generan variantes responsivas de imagen para páginas públicas y dejan que Cloudflare gestione la compresión de transferencia en el edge. La automatización del ciclo de vida de campañas usa la zona horaria configurada para mantener alineadas fechas límite, cuentas regresivas, reportes y comprobaciones de liquidación.

## Preguntas

Si tienes preguntas sobre estos términos o sobre tu aporte, escribe a info@dustwave.xyz.

---

_Última actualización: 12 de junio de 2026_
