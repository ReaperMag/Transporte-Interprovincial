from datetime import datetime
from decimal import Decimal

from fpdf import FPDF

from app.modules.reports.schemas import TripReport
from app.modules.reservations.service import as_local


STATUS_LABELS = {
    "boarding": "En abordaje",
    "in_progress": "En curso",
    "finished": "Finalizado",
}

CATEGORY_LABELS = {
    "regular": "Normal",
    "minor": "Menor de edad",
    "senior": "Tercera edad",
    "disability": "Discapacidad",
}

PROBLEM_LABELS = {
    "delay": "Retraso",
    "mechanical": "Falla mecánica",
    "other": "Otro",
}


def format_datetime(value: datetime | None) -> str:
    return as_local(value).strftime("%d/%m/%Y %H:%M") if value else "-"


def format_money(value: Decimal) -> str:
    return f"$ {value:.2f}"


class TripReportPdf(FPDF):
    def header(self) -> None:
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 10, "Reporte del viaje", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(200, 200, 200)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.cell(0, 8, f"Página {self.page_no()}", align="C")

    def section(self, title: str) -> None:
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 10)

    def row(self, label: str, value: str) -> None:
        self.set_font("Helvetica", "B", 10)
        self.cell(55, 6, label)
        self.set_font("Helvetica", "", 10)
        self.multi_cell(0, 6, value, new_x="LMARGIN", new_y="NEXT")


def render_trip_report_pdf(report: TripReport) -> bytes:
    """Convierte el reporte del viaje en un PDF listo para descargar."""
    pdf = TripReportPdf(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.section("Viaje")
    pdf.row("Viaje", f"#{report.tripId}")
    pdf.row("Ruta", f"{report.originCityName} - {report.destinationCityName}")
    pdf.row("Bus", f"{report.busNumber} ({report.busPlate})")
    pdf.row("Estado", STATUS_LABELS.get(report.status.value, report.status.value))

    pdf.section("Horarios")
    pdf.row("Salida programada", format_datetime(report.scheduledDepartureAt))
    pdf.row("Inicio del abordaje", format_datetime(report.boardingStartedAt))
    pdf.row("Salida real", format_datetime(report.startedAt))
    pdf.row("Llegada", format_datetime(report.finishedAt))
    duration = report.durationMinutes
    pdf.row(
        "Duración",
        f"{duration // 60} h {duration % 60} min" if duration is not None else "-",
    )

    pdf.section("Personal")
    pdf.row("Inició el abordaje", report.boardingStartedByName or "-")
    pdf.row("Inició el viaje", report.startedByName or "-")
    pdf.row("Finalizó el viaje", report.finishedByName or "-")

    counts = report.passengers
    pdf.section("Pasajeros")
    pdf.row("Boletos vendidos", str(counts.ticketsSold))
    pdf.row("Abordaron", str(counts.boarded))
    pdf.row("No se presentaron", str(counts.noShow))
    pdf.row("Rechazados por categoría", str(counts.rejected))
    pdf.row("Ventas a bordo", str(counts.onboardSales))

    totals = report.totals
    pdf.section("Recaudación")
    pdf.row("En línea", format_money(totals.online))
    pdf.row("Oficina", format_money(totals.office))
    pdf.row("A bordo (efectivo)", format_money(totals.onBoard))
    pdf.row("Total", format_money(totals.total))

    pdf.section("Ventas a bordo")
    if not report.onboardSales:
        pdf.cell(0, 6, "No hubo ventas a bordo.", new_x="LMARGIN", new_y="NEXT")
    for sale in report.onboardSales:
        category = CATEGORY_LABELS.get(sale.passengerCategory.value, "")
        pdf.multi_cell(
            0,
            6,
            f"Asiento {sale.seatNumber} - {sale.passengerName} ({category}): "
            f"{sale.originCityName} a {sale.destinationCityName}, "
            f"{format_money(sale.price)}. Cobró: {sale.soldByName or '-'}.",
            new_x="LMARGIN",
            new_y="NEXT",
        )

    pdf.section("Problemas reportados")
    if not report.problems:
        pdf.cell(0, 6, "No se reportaron problemas.", new_x="LMARGIN", new_y="NEXT")
    for problem in report.problems:
        kind = PROBLEM_LABELS.get(problem.problemType.value, "") if problem.problemType else ""
        state = (
            f"Atendido por {problem.resolvedByName or '-'}"
            if problem.resolvedAt
            else "Sin atender"
        )
        prefix = f"{kind}: " if kind else ""
        pdf.multi_cell(
            0,
            6,
            f"{format_datetime(problem.reportedAt)} - {prefix}{problem.comment} "
            f"Reportó: {problem.reportedByName or '-'}. {state}.",
            new_x="LMARGIN",
            new_y="NEXT",
        )

    return bytes(pdf.output())
