import asyncio
import os
from playwright.async_api import Playwright, async_playwright
from playwright.async_api import expect

_LOGIN_PROGRESS = 22

def log_progress(p, m):
    print(f'PROGRESS: {{"p": {p}, "m": "{m}"}}', flush=True)

async def renovar_sessao(playwright: Playwright, email: str, senha: str, headless: bool = True) -> None:
    p = _LOGIN_PROGRESS
    log_progress(p, "Abrindo navegador para renovar sessão...")
    browser = await playwright.chromium.launch(
        headless=headless,
        args=["--window-size=1280,800", "--lang=pt-BR"],
    )
    context = await browser.new_context(locale="pt-BR")
    await context.add_init_script('''
        Object.defineProperty(navigator, "language", { get: () => "pt-BR" });
        Object.defineProperty(navigator, "languages", { get: () => ["pt-BR", "pt"] });
    ''')
    page = await context.new_page()

    log_progress(p, "Acessando tela de login da Microsoft...")
    await page.goto("https://app.powerbi.com/singleSignOn?experience=power-bi&ru=https%3A%2F%2Fapp.powerbi.com%2Fgroups%2Fme%2Freports%2F6a910f57-fbf5-45f2-8064-bf2463667097%2Fbfd774259b1360b0e2a0%3Fexperience%3Dpower-bi%26noSignUpCheck%3D1")
    await page.wait_for_timeout(3000)

    log_progress(p, "Analisando tela de login...")

    # ---------- EMAIL ----------
    conta_salva = page.get_by_text(email)
    input_email_selectors = [
        'input[placeholder="Enter email"]',
        'input[placeholder="Digite o email"]',
        'input[placeholder="Insira o email"]',
        'input[type="email"]',
        'input[name="loginfmt"]',
    ]
    input_email = page.locator(", ".join(input_email_selectors))

    try:
        await expect(conta_salva.or_(input_email).first).to_be_visible(timeout=15000)
    except Exception:
        log_progress(p, "Tela de login pode ter mudado, tentando fallback...")

    if await conta_salva.is_visible():
        log_progress(p, "Conta salva encontrada! Entrando...")
        await conta_salva.click()
    elif await input_email.first.is_visible():
        log_progress(p, "Digitando e-mail...")
        await input_email.first.fill(email)
        await input_email.first.press("Enter")
    else:
        log_progress(p, "Campo de e-mail não identificado. Tentando preenchimento direto...")
        campos = page.locator('input:not([type="hidden"])')
        count = await campos.count()
        for i in range(count):
            el = campos.nth(i)
            visible = await el.is_visible()
            if visible:
                await el.fill(email)
                await el.press("Enter")
                break

    await page.wait_for_timeout(2000)

    # ---------- SENHA ----------
    log_progress(p, "Aguardando campo de senha...")
    input_senha_selectors = [
        'input[name="passwd"]',
        'input[type="password"]',
        'input[name="Password"]',
        'input[placeholder="Senha"]',
        'input[placeholder="Password"]',
    ]
    input_senha = page.locator(", ".join(input_senha_selectors))

    try:
        await input_senha.first.wait_for(state="visible", timeout=15000)
        log_progress(p, "Digitando senha...")
        await input_senha.first.fill(senha)
        await input_senha.first.press("Enter")
    except Exception:
        log_progress(p, "Campo de senha não apareceu (pode já estar autenticado).")

    await page.wait_for_timeout(2000)

    # ---------- "CONTINUAR CONECTADO" ----------
    log_progress(p, "Verificando tela de 'Continuar conectado'...")
    botoes_nao = page.locator(
        'input[id="idBtn_Back"], '
        'button:has-text("Não"), '
        'button:has-text("No"), '
        '#idBtn_Back'
    )
    try:
        await botoes_nao.first.wait_for(state="visible", timeout=15000)
        log_progress(p, "Recusando 'Continuar conectado'...")
        await botoes_nao.first.click()
    except Exception:
        log_progress(p, "Tela de 'Continuar conectado' não apareceu.")

    # ---------- AGUARDAR REDIRECT ----------
    log_progress(p, "Aguardando redirecionamento para o Power BI...")
    try:
        await page.wait_for_url("**/groups/me/reports/**", timeout=45000)
    except Exception:
        log_progress(p, "Redirecionamento lento. Aguardando mais...")
        await page.wait_for_timeout(15000)

    log_progress(p, "Login concluído! Salvando estado da sessão...")

    auth_path = os.path.join(os.path.dirname(__file__), "auth.json")
    await context.storage_state(path=auth_path)
    log_progress(p, "Sessão salva em auth.json")

    await context.close()
    await browser.close()

    log_progress(p, "Renovação de sessão finalizada!")


async def main() -> None:
    async with async_playwright() as playwright:
        import sys, base64, json
        from core.banco import buscar_credencial_site
        try:
            params = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
            email, senha = buscar_credencial_site(
                int(params.get('user_id', 1)),
                params.get('servico_credencial', 'Power BI WoW')
            )
        except (IndexError, Exception):
            email, senha = buscar_credencial_site(1, "Power BI WoW")
        if email and senha:
            await renovar_sessao(playwright, email, senha)
        else:
            print("ERRO: Credenciais não encontradas no cofre.")

if __name__ == "__main__":
    asyncio.run(main())
