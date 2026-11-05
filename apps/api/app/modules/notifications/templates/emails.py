"""Plantillas de los correos que envía el sistema, en texto plano y HTML."""

from html import escape

from app.modules.notifications.providers.smtp import EmailContent


SYSTEM_NAME = "Transporte Interprovincial"
FOOTER = f"Este es un mensaje automático de {SYSTEM_NAME}. No respondas a este correo."


def _render(subject: str, title: str, paragraphs: list[str], code: str | None = None) -> EmailContent:
    text_parts = [title, "", *paragraphs]
    if code is not None:
        text_parts += ["", f"Código: {code}"]
    text_parts += ["", "--", FOOTER]

    html_paragraphs = "".join(
        f'<p style="margin:0 0 12px;line-height:1.5">{escape(paragraph)}</p>'
        for paragraph in paragraphs
    )
    html_code = (
        '<p style="margin:20px 0;font-size:28px;font-weight:700;letter-spacing:8px;'
        f'color:#0e5a6b">{escape(code)}</p>'
        if code is not None
        else ""
    )
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;'
        'color:#14212b;background:#f5f4f0;padding:24px;border-radius:8px">'
        '<p style="margin:0 0 20px;color:#d99a1e;font-size:12px;font-weight:700;'
        f'letter-spacing:2px">{escape(SYSTEM_NAME.upper())}</p>'
        f'<h1 style="margin:0 0 16px;font-size:22px">{escape(title)}</h1>'
        f"{html_paragraphs}{html_code}"
        '<p style="margin:24px 0 0;color:#5b6670;font-size:12px">'
        f"{escape(FOOTER)}</p></div>"
    )

    return EmailContent(
        subject=f"{subject} - {SYSTEM_NAME}",
        text="\n".join(text_parts),
        html=html,
    )


def verification_code_email(code: str, expire_minutes: int) -> EmailContent:
    """Correo con el código para verificar la cuenta recién registrada."""
    return _render(
        "Verifica tu cuenta",
        "Verifica tu correo electrónico",
        [
            "Gracias por registrarte. Ingresa este código en la aplicación para activar tu cuenta.",
            f"El código vence en {expire_minutes} minutos. Si no creaste esta cuenta, ignora este correo.",
        ],
        code,
    )


def password_reset_code_email(code: str, expire_minutes: int) -> EmailContent:
    """Correo con el código para establecer una nueva contraseña."""
    return _render(
        "Recupera tu contraseña",
        "Recuperación de contraseña",
        [
            "Recibimos una solicitud para cambiar la contraseña de tu cuenta. "
            "Ingresa este código en la aplicación para crear una nueva.",
            f"El código vence en {expire_minutes} minutos. Si no lo solicitaste, ignora este "
            "correo: tu contraseña actual sigue siendo válida.",
        ],
        code,
    )


def notification_email(title: str, message: str) -> EmailContent:
    """Correo con el mismo título y mensaje de una notificación de la aplicación."""
    return _render(
        title,
        title,
        [message, "Puedes revisar el detalle en la aplicación."],
    )


def tickets_confirmation_email(
    *,
    cooperative_name: str,
    origin_name: str,
    destination_name: str,
    departure_str: str,
    bus_number: str,
    tickets: list[dict],
    total_price: str,
) -> EmailContent:
    """Correo con los boletos detallados y sus códigos QR tras confirmar la compra."""
    title = "¡Tus boletos están listos!"
    subject = f"Boletos confirmados: {origin_name} a {destination_name}"

    text_parts = [
        title,
        "",
        f"Cooperativa: {cooperative_name}",
        f"Ruta: {origin_name} -> {destination_name}",
        f"Fecha y hora de salida: {departure_str}",
        f"Bus: #{bus_number}",
        f"Total pagado: ${total_price}",
        "",
        "Detalle de boletos:",
    ]

    ticket_cards_html = []

    for t in tickets:
        seat_num = t.get("seat_number", "")
        p_name = t.get("passenger_name", "")
        p_id = t.get("passenger_id_number") or "No registrado"
        cat = t.get("category", "regular")
        code = t.get("ticket_code", "")
        qr_b64 = t.get("qr_base64", "")
        price = t.get("price", "0.00")

        text_parts.append(
            f"- Asiento #{seat_num} | Pasajero: {p_name} ({p_id}) | Tarifa: {cat} | Precio: ${price} | Código: {code}"
        )

        qr_tag = (
            f'<div style="text-align:center;margin-top:12px;">'
            f'<img src="data:image/png;base64,{qr_b64}" alt="QR Boleto" width="140" height="140" style="border:1px solid #ddd;padding:4px;border-radius:6px;background:#fff;" />'
            f'<p style="margin:4px 0 0;font-size:11px;color:#666;font-family:monospace;">{escape(code)}</p>'
            f'</div>'
            if qr_b64
            else ""
        )

        card_html = f"""
        <div style="background:#ffffff;border:1px solid #dcd9d2;border-radius:8px;padding:16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:10px;">
                <span style="font-size:16px;font-weight:bold;color:#0e5a6b;">Asiento #{escape(str(seat_num))}</span>
                <span style="font-size:14px;font-weight:bold;color:#14212b;">${escape(str(price))}</span>
            </div>
            <p style="margin:0 0 6px;font-size:13px;color:#333;"><strong>Pasajero:</strong> {escape(p_name)}</p>
            <p style="margin:0 0 6px;font-size:13px;color:#555;"><strong>Identificación:</strong> {escape(str(p_id))}</p>
            <p style="margin:0 0 8px;font-size:12px;color:#777;"><strong>Categoría:</strong> {escape(str(cat))}</p>
            {qr_tag}
        </div>
        """
        ticket_cards_html.append(card_html)

    text_parts += [
        "",
        "Instrucciones de viaje:",
        "1. Presenta este código QR o tu cédula en el terminal o al momento de abordar el bus.",
        "2. Llega al terminal con al menos 20 minutos de anticipación.",
        "",
        "--",
        FOOTER,
    ]

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#14212b;background:#f5f4f0;padding:24px;border-radius:8px">
        <p style="margin:0 0 16px;color:#d99a1e;font-size:12px;font-weight:700;letter-spacing:2px">{escape(SYSTEM_NAME.upper())}</p>
        <h1 style="margin:0 0 12px;font-size:22px;color:#0e5a6b;">{escape(title)}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#4a5568;">Tu compra fue confirmada con éxito. A continuación encontrarás el detalle de tu viaje y tus boletos con código QR para abordar.</p>

        <div style="background:#eaf3f5;border-left:4px solid #0e5a6b;padding:14px;border-radius:4px;margin-bottom:20px;">
            <p style="margin:0 0 6px;font-size:14px;"><strong>Cooperativa:</strong> {escape(cooperative_name)}</p>
            <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#0e5a6b;">{escape(origin_name)} &rarr; {escape(destination_name)}</p>
            <p style="margin:0 0 6px;font-size:13px;"><strong>Salida:</strong> {escape(departure_str)}</p>
            <p style="margin:0 0 6px;font-size:13px;"><strong>Bus asignado:</strong> #{escape(str(bus_number))}</p>
            <p style="margin:0;font-size:14px;"><strong>Total pagado:</strong> ${escape(str(total_price))}</p>
        </div>

        <h2 style="font-size:16px;margin:0 0 12px;color:#14212b;">Tus Boletos de Viaje:</h2>
        {"".join(ticket_cards_html)}

        <div style="background:#fff9e6;border:1px solid #ffeeba;border-radius:6px;padding:12px;margin-top:20px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#856404;">Importante para el viaje:</p>
            <p style="margin:0 0 4px;font-size:12px;color:#856404;">&bull; Presenta el código QR o tu cédula directamente al chofer u oficial de cabina.</p>
            <p style="margin:0;font-size:12px;color:#856404;">&bull; Te sugerimos presentarte en el andén 20 minutos antes de la hora de salida.</p>
        </div>

        <p style="margin:24px 0 0;color:#5b6670;font-size:12px;text-align:center;">{escape(FOOTER)}</p>
    </div>
    """

    return EmailContent(
        subject=f"{subject} - {SYSTEM_NAME}",
        text="\n".join(text_parts),
        html=html,
    )
