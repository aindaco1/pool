---
layout: default
title: ¿Qué es esto?
lang: es
translation_key: about
permalink: /es/about/
description: Conoce cómo The Pool gestiona aportes de todo o nada, recompensas físicas, acceso de patrocinadores, privacidad y campañas creativas independientes.
last_modified_at: 2026-07-13
---
{% assign operator_name = site.platform.company_name | default: site.author %}
{% assign support_email = site.platform.support_email %}

# ¿Qué es The Pool?

**The Pool** es la plataforma de crowdfunding de código abierto de {{ operator_name }} para cine independiente y proyectos creativos. Ofrece a equipos pequeños un espacio enfocado para recaudar fondos, ofrecer recompensas, comunicarse con quienes los apoyan y gestionar la preparación y entrega sin exigir que cada patrocinador cree una cuenta.

## Aportes de todo o nada

Cuando apoyas una campaña, Stripe guarda de forma segura tu método de pago, pero **no se te cobra cuando haces el aporte**. La campaña debe alcanzar su meta antes de la fecha límite. Si no la alcanza, no se realiza ningún cobro en tu tarjeta.

Antes de que termine la campaña, puedes usar el enlace seguro de tu correo de confirmación para revisar, modificar o cancelar tu aporte. Si un mismo proceso de pago incluye varias campañas, cada campaña sigue siendo un aporte separado y se liquida por separado.

## No necesitas una cuenta

Tu correo de confirmación contiene los enlaces seguros necesarios para gestionar tu aporte y, cuando se ofrezca, entrar a la comunidad de patrocinadores de esa campaña. Guarda el correo: es la forma más sencilla de regresar sin mantener otra contraseña.

Los recordatorios de lanzamiento y de procesos de pago incompletos son opcionales. Cada uno se limita al propósito descrito cuando das tu consentimiento e incluye una forma de cancelar la suscripción.

## A dónde va el dinero

Los niveles de recompensa, el apoyo directo a la campaña, los montos personalizados para la campaña y sus complementos cuentan para la meta. El envío, los impuestos, los complementos de plataforma y la propina opcional para la plataforma no cuentan.

The Pool no descuenta una comisión de plataforma de los fondos de la campaña. Durante el proceso de pago, cada patrocinador puede elegir una propina opcional para ayudar a {{ operator_name }} a operar el servicio. Aun así, pueden aplicarse las comisiones de procesamiento de Stripe y otros gastos de la campaña.

## Recompensas físicas y políticas de compra

Las recompensas físicas forman parte de un aporte de crowdfunding; no son pedidos minoristas comunes de artículos en existencia. Las páginas de campaña muestran la recompensa, el precio, el tratamiento del envío y la información disponible sobre las fechas estimadas al momento del aporte. Pueden ocurrir retrasos de producción o del transportista.

Por defecto, las recompensas cobradas son venta final, sin devoluciones ni cambios por arrepentimiento, preferencia o talla. Los artículos dañados, defectuosos, incorrectos o faltantes siguen cubiertos por el proceso para problemas de preparación o entrega de nuestra [política de no devoluciones y problemas de entrega]({% include localized-url.html lang=page.lang translation_key='terms' %}#returns-refunds). Los detalles de envío están en la [política de envío]({% include localized-url.html lang=page.lang translation_key='terms' %}#shipping-policy).

Cuando una campaña habilita de forma explícita una página enfocada de producto para su nivel físico destacado, The Pool puede publicar información precisa del producto y la preventa para los buscadores. No publica datos del producto hasta contar con la información obligatoria, incluida una fecha exacta de disponibilidad estimada.

## Para creadores

Los equipos de campaña pueden configurar financiación de todo o nada, niveles de recompensa digitales y físicos, complementos de campaña, fases de producción, metas ampliadas, decisiones para patrocinadores, actualizaciones de diario, vistas previas protegidas, módulos para insertar la campaña y apoyo tardío cuando corresponda.

Un panel privado con acceso según el rol permite gestionar contenido de campaña, recompensas, reportes, patrocinadores, preparación y entrega, análisis, enlaces de promoción y personas usuarias autorizadas. El servidor verifica los precios y totales sensibles en vez de confiar en el navegador.

## Privacidad, acceso y seguridad

Stripe gestiona los datos completos de las tarjetas de pago. The Pool almacena la información necesaria para gestionar aportes, comunicarse sobre las campañas, calcular impuestos y envíos aplicables, prevenir abusos y entregar recompensas. Las personas operadoras autorizadas solo reciben la información de patrocinadores y entrega necesaria para las campañas que gestionan. No vendemos la información de patrocinadores.

Las páginas públicas de campaña, Acerca de, Términos y recompensas elegibles están diseñadas para la búsqueda y para compartir. Los enlaces de gestión de aportes, las páginas exclusivas para patrocinadores, las vistas previas protegidas, los resultados del proceso de pago y el panel privado quedan fuera de la intención de indexación y difusión pública.

## Código abierto

El sitio público, el Worker de Cloudflare, la automatización, la localización y el panel están disponibles en [github.com/aindaco1/pool](https://github.com/aindaco1/pool). Los forks pueden cambiar su identidad mediante configuración y mantener alineados los límites de pagos, localización, privacidad e indexación.

¿Tienes preguntas? Escribe a [{{ support_email }}](mailto:{{ support_email }}).

---

_Última actualización: 13 de julio de 2026_
