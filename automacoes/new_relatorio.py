import re
from playwright.sync_api import Playwright, sync_playwright, expect


def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    page.goto("http://10.61.72.63/Reports/browse/UTP/Comercial")
    page.get_by_role("link", name=" … IndicadoresOperacionaisDiario").click()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_label("Ano").select_option("9")
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_role("textbox", name="Mês").click()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_role("checkbox", name="1", exact=True).check()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.locator("#ReportViewerControl_ctl04_ctl07").get_by_role("cell", name="Dia").click()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_role("checkbox", name="(Selecionar Tudo)").check()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_role("button", name="Exibir Relatório").click()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_role("button", name="Menu suspenso Exportar").click()
    page.locator("iframe[title=\"Report Viewer\"]").content_frame.get_by_role("link", name="Excel").click()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    run(playwright)
